import json
import boto3
from datetime import datetime, timedelta
from botocore.exceptions import ClientError

def get_s3_video_files(s3_client, bucket):
    """Get all video files from S3"""
    video_files = set()
    paginator = s3_client.get_paginator('list_objects_v2')
    
    for page in paginator.paginate(Bucket=bucket):
        if 'Contents' in page:
            for obj in page['Contents']:
                video_files.add(obj['Key'])
    
    return video_files

def lambda_handler(event, context):
    """
    Lambda function to clean up old video metadata and their corresponding S3 files.
    Uses GSI (datePartition-uploadedAt-index) for efficient queries instead of full table scan.
    Also cleans up orphaned records (metadata without S3 files).
    """
    
    # Configuration
    DYNAMODB_TABLE = 'up-videometadata'
    GSI_NAME = 'datePartition-uploadedAt-index'
    S3_BUCKET = 'up-compressed-content'
    VIDEO_EXPIRY_DAYS = 30  # Delete videos older than 30 days
    
    # Initialize AWS clients
    dynamodb = boto3.client('dynamodb', region_name='us-east-2')
    s3 = boto3.client('s3', region_name='us-east-2')
    
    # Calculate cutoff date
    cutoff_date = datetime.now() - timedelta(days=VIDEO_EXPIRY_DAYS)
    cutoff_date_str = cutoff_date.isoformat()
    
    print(f"Cleaning up videos older than {cutoff_date_str} ({VIDEO_EXPIRY_DAYS} days)")
    
    # Get all S3 files for orphaned record cleanup
    s3_files = get_s3_video_files(s3, S3_BUCKET)
    print(f"Found {len(s3_files)} files in S3")
    
    # Statistics
    stats = {
        'partitions_queried': 0,
        'scanned': 0,
        'expired_found': 0,
        'orphaned_found': 0,
        'dynamodb_deleted': 0,
        's3_deleted': 0,
        'errors': 0
    }
    
    try:
        # Query only date partitions older than cutoff (efficient!)
        # Generate list of date partitions to query (past 30+ days to catch any stragglers)
        dates_to_check = []
        for days_ago in range(VIDEO_EXPIRY_DAYS, VIDEO_EXPIRY_DAYS + 60):  # Check 30-90 days ago
            date = datetime.now() - timedelta(days=days_ago)
            dates_to_check.append(date.strftime('%Y-%m-%d'))
        
        print(f"Checking {len(dates_to_check)} date partitions")
        
        for date_partition in dates_to_check:
            stats['partitions_queried'] += 1
            
            # Query by datePartition using GSI
            try:
                paginator = dynamodb.get_paginator('query')
                
                for page in paginator.paginate(
                    TableName=DYNAMODB_TABLE,
                    IndexName=GSI_NAME,
                    KeyConditionExpression='datePartition = :dp',
                    ExpressionAttributeValues={':dp': {'S': date_partition}}
                ):
                    for item in page['Items']:
                        stats['scanned'] += 1
                        
                        video_id = item['videoId']['S']
                        uploaded_at_str = item['uploadedAt']['S']
                        
                        # Parse upload date
                        try:
                            uploaded_at = datetime.fromisoformat(uploaded_at_str.replace('Z', '+00:00'))
                            if uploaded_at.tzinfo is not None:
                                uploaded_at = uploaded_at.replace(tzinfo=None)
                        except ValueError:
                            print(f"Invalid date format for video {video_id}: {uploaded_at_str}")
                            stats['errors'] += 1
                            continue
                        
                        # Check if video is expired OR orphaned
                        is_expired = uploaded_at < cutoff_date
                        is_orphaned = video_id not in s3_files
                        
                        if is_expired or is_orphaned:
                            if is_expired:
                                stats['expired_found'] += 1
                                print(f"Found expired video: {video_id} (uploaded: {uploaded_at_str})")
                            if is_orphaned:
                                stats['orphaned_found'] += 1
                                print(f"Found orphaned video: {video_id} (not in S3)")
                            
                            # Delete from DynamoDB
                            try:
                                region = item['region']['S']
                                
                                dynamodb.delete_item(
                                    TableName=DYNAMODB_TABLE,
                                    Key={
                                        'region': {'S': region},
                                        'uploadedAt': {'S': uploaded_at_str}
                                    }
                                )
                                stats['dynamodb_deleted'] += 1
                                print(f"✅ Deleted from DynamoDB: {video_id}")
                                
                                # Delete from S3 if expired (orphaned already missing)
                                if is_expired and video_id in s3_files:
                                    try:
                                        s3.delete_object(Bucket=S3_BUCKET, Key=video_id)
                                        stats['s3_deleted'] += 1
                                        print(f"✅ Deleted from S3: {video_id}")
                                    except ClientError as e:
                                        print(f"❌ Error deleting from S3 {video_id}: {e}")
                                        stats['errors'] += 1
                                
                            except ClientError as e:
                                print(f"❌ Error deleting from DynamoDB {video_id}: {e}")
                                stats['errors'] += 1
                                
            except ClientError as e:
                # GSI might not have data for this partition - that's fine
                if 'ResourceNotFoundException' not in str(e):
                    print(f"Error querying partition {date_partition}: {e}")
    
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        stats['errors'] += 1
    
    # Return results
    result = {
        'statusCode': 200,
        'body': json.dumps({
            'message': 'Video cleanup completed',
            'stats': stats,
            'cutoff_date': cutoff_date_str,
            'timestamp': datetime.now().isoformat()
        })
    }
    
    print(f"=== Cleanup Summary ===")
    print(f"Date partitions queried: {stats['partitions_queried']}")
    print(f"Videos scanned: {stats['scanned']}")
    print(f"Expired videos found: {stats['expired_found']}")
    print(f"Orphaned videos found: {stats['orphaned_found']}")
    print(f"DynamoDB records deleted: {stats['dynamodb_deleted']}")
    print(f"S3 files deleted: {stats['s3_deleted']}")
    print(f"Errors: {stats['errors']}")
    
    return result
