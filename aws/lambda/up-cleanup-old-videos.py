import json
import logging
import os
import boto3
from datetime import datetime, timedelta
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

VIDEOMETADATA_TABLE = 'up-videometadata'
HASHTAG_TABLE = 'up-hashtag'
GSI_NAME = 'datePartition-uploadedAt-index'
S3_BUCKET = 'up-compressed-content'
EXPIRY_DAYS = 30
BATCH_SIZE = 25
S3_BATCH_SIZE = 1000
REGION = os.environ.get('AWS_REGION', 'us-east-2')


def parse_timestamp(timestamp_str):
    dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
    if dt.tzinfo is not None:
        dt = dt.replace(tzinfo=None)
    return dt


def batch_delete_dynamodb(dynamodb, table_name, keys, stats, stat_key):
    for i in range(0, len(keys), BATCH_SIZE):
        batch = keys[i:i + BATCH_SIZE]
        request_items = {
            table_name: [{'DeleteRequest': {'Key': key}} for key in batch]
        }
        try:
            response = dynamodb.batch_write_item(RequestItems=request_items)

            unprocessed = response.get('UnprocessedItems', {}).get(table_name, [])
            stats[stat_key] += len(batch) - len(unprocessed)

            while unprocessed:
                retry_count = len(unprocessed)
                response = dynamodb.batch_write_item(
                    RequestItems={table_name: unprocessed}
                )
                unprocessed = response.get('UnprocessedItems', {}).get(table_name, [])
                stats[stat_key] += retry_count - len(unprocessed)
        except ClientError as e:
            logger.error("Batch delete error on %s: %s", table_name, e)
            stats['errors'] += 1


def batch_delete_s3(s3, bucket, keys, stats):
    for i in range(0, len(keys), S3_BATCH_SIZE):
        batch = keys[i:i + S3_BATCH_SIZE]
        try:
            response = s3.delete_objects(
                Bucket=bucket,
                Delete={'Objects': [{'Key': k} for k in batch], 'Quiet': True}
            )
            failed = response.get('Errors', [])
            stats['s3_deleted'] += len(batch) - len(failed)
            for err in failed:
                logger.error("S3 delete failed for %s: %s", err['Key'], err['Message'])
                stats['errors'] += 1
        except ClientError as e:
            logger.error("S3 batch delete error: %s", e)
            stats['errors'] += 1


def get_dynamodb_video_ids(dynamodb):
    video_ids = set()
    paginator = dynamodb.get_paginator('scan')
    for page in paginator.paginate(
        TableName=VIDEOMETADATA_TABLE,
        ProjectionExpression='videoId'
    ):
        for item in page['Items']:
            video_ids.add(item['videoId']['S'])
    return video_ids


def cleanup_old_hashtags(dynamodb, cutoff_date, stats):
    logger.info("Cleaning up hashtags older than %s", cutoff_date.isoformat())

    paginator = dynamodb.get_paginator('scan')
    keys_to_delete = []

    for page in paginator.paginate(
        TableName=HASHTAG_TABLE,
        ProjectionExpression='hashtag, #ts',
        ExpressionAttributeNames={'#ts': 'timestamp'}
    ):
        for item in page['Items']:
            stats['hashtags_scanned'] += 1
            hashtag = item['hashtag']['S']
            timestamp_str = item['timestamp']['S']

            try:
                item_time = parse_timestamp(timestamp_str)
            except ValueError:
                logger.warning("Invalid timestamp for hashtag %s: %s", hashtag, timestamp_str)
                stats['errors'] += 1
                continue

            if item_time < cutoff_date:
                keys_to_delete.append({
                    'hashtag': {'S': hashtag},
                    'timestamp': {'S': timestamp_str}
                })

    if keys_to_delete:
        logger.info("Deleting %d expired hashtags", len(keys_to_delete))
        batch_delete_dynamodb(dynamodb, HASHTAG_TABLE, keys_to_delete, stats, 'hashtags_deleted')


def cleanup_old_videos(dynamodb, s3, cutoff_date, stats):
    now = cutoff_date + timedelta(days=EXPIRY_DAYS)
    dates_to_check = []
    for days_ago in range(EXPIRY_DAYS, EXPIRY_DAYS + 60):
        date = now - timedelta(days=days_ago)
        dates_to_check.append(date.strftime('%Y-%m-%d'))

    logger.info("Checking %d date partitions for video metadata", len(dates_to_check))

    dynamodb_keys_to_delete = []
    s3_keys_to_delete = []

    for date_partition in dates_to_check:
        stats['partitions_queried'] += 1

        try:
            paginator = dynamodb.get_paginator('query')

            for page in paginator.paginate(
                TableName=VIDEOMETADATA_TABLE,
                IndexName=GSI_NAME,
                KeyConditionExpression='datePartition = :dp',
                ExpressionAttributeValues={':dp': {'S': date_partition}}
            ):
                for item in page['Items']:
                    stats['videos_scanned'] += 1

                    video_id = item['videoId']['S']
                    uploaded_at_str = item['uploadedAt']['S']
                    region = item['region']['S']

                    try:
                        uploaded_at = parse_timestamp(uploaded_at_str)
                    except ValueError:
                        logger.warning("Invalid date format for video %s: %s", video_id, uploaded_at_str)
                        stats['errors'] += 1
                        continue

                    if uploaded_at < cutoff_date:
                        stats['expired_found'] += 1
                        dynamodb_keys_to_delete.append({
                            'region': {'S': region},
                            'uploadedAt': {'S': uploaded_at_str}
                        })
                        s3_keys_to_delete.append(video_id)

        except ClientError as e:
            if 'ResourceNotFoundException' not in str(e):
                logger.error("Error querying partition %s: %s", date_partition, e)

    if dynamodb_keys_to_delete:
        logger.info("Deleting %d expired video metadata records", len(dynamodb_keys_to_delete))
        batch_delete_dynamodb(dynamodb, VIDEOMETADATA_TABLE, dynamodb_keys_to_delete, stats, 'dynamodb_deleted')

    if s3_keys_to_delete:
        logger.info("Deleting %d expired S3 files", len(s3_keys_to_delete))
        batch_delete_s3(s3, S3_BUCKET, s3_keys_to_delete, stats)


def cleanup_orphaned_s3_files(s3, dynamodb_video_ids, stats):
    logger.info("Checking for orphaned S3 files")

    orphaned_keys = []
    paginator = s3.get_paginator('list_objects_v2')

    for page in paginator.paginate(Bucket=S3_BUCKET):
        for obj in page.get('Contents', []):
            stats['s3_scanned'] += 1
            key = obj['Key']
            if key not in dynamodb_video_ids:
                orphaned_keys.append(key)
                stats['orphaned_s3_found'] += 1

    if orphaned_keys:
        logger.info("Deleting %d orphaned S3 files", len(orphaned_keys))
        batch_delete_s3(s3, S3_BUCKET, orphaned_keys, stats)


def lambda_handler(event, context):
    dynamodb = boto3.client('dynamodb', region_name=REGION)
    s3 = boto3.client('s3', region_name=REGION)

    now = datetime.now()
    cutoff_date = now - timedelta(days=EXPIRY_DAYS)
    logger.info("Cleaning up records older than %s (%d days)", cutoff_date.isoformat(), EXPIRY_DAYS)

    dynamodb_video_ids = get_dynamodb_video_ids(dynamodb)
    logger.info("Found %d video records in DynamoDB", len(dynamodb_video_ids))

    stats = {
        'partitions_queried': 0,
        'videos_scanned': 0,
        'expired_found': 0,
        'dynamodb_deleted': 0,
        's3_scanned': 0,
        's3_deleted': 0,
        'orphaned_s3_found': 0,
        'hashtags_scanned': 0,
        'hashtags_deleted': 0,
        'errors': 0
    }

    try:
        cleanup_old_videos(dynamodb, s3, cutoff_date, stats)
        cleanup_orphaned_s3_files(s3, dynamodb_video_ids, stats)
        cleanup_old_hashtags(dynamodb, cutoff_date, stats)
    except Exception as e:
        logger.exception("Unexpected error during cleanup")
        stats['errors'] += 1

    logger.info("=== Cleanup Summary ===")
    logger.info("Date partitions queried: %d", stats['partitions_queried'])
    logger.info("Videos scanned: %d", stats['videos_scanned'])
    logger.info("Expired videos found: %d", stats['expired_found'])
    logger.info("DynamoDB video records deleted: %d", stats['dynamodb_deleted'])
    logger.info("S3 files scanned: %d", stats['s3_scanned'])
    logger.info("S3 files deleted: %d", stats['s3_deleted'])
    logger.info("Orphaned S3 files found: %d", stats['orphaned_s3_found'])
    logger.info("Hashtags scanned: %d", stats['hashtags_scanned'])
    logger.info("Hashtags deleted: %d", stats['hashtags_deleted'])
    logger.info("Errors: %d", stats['errors'])

    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': 'Cleanup completed',
            'stats': stats,
            'cutoff_date': cutoff_date.isoformat(),
            'timestamp': now.isoformat()
        })
    }
