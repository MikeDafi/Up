import json
import logging
import time
import boto3
from datetime import datetime

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
metadata_table = dynamodb.Table('up-videometadata')
hashtag_table = dynamodb.Table('up-hashtag')
hashtag_registry_table = dynamodb.Table('up-hashtag-registry')
rate_limit_table = dynamodb.Table('up-rate-limits')

MAX_UPLOADS_PER_HOUR = 10
RATE_LIMIT_WINDOW_SECONDS = 3600

# Hashtag limits (must match client-side validation)
MIN_HASHTAGS = 3
MAX_HASHTAGS = 20
MAX_HASHTAG_LENGTH = 15

# Description limits (must match client-side MAX_DESCRIPTION_CHARACTERS)
MAX_DESCRIPTION_LENGTH = 500

# Guard against oversized payloads to prevent DynamoDB storage abuse (bytes)
MAX_REQUEST_BODY_SIZE = 4 * 1024  # 4 KB — generous for metadata fields

def save_metadata(item):
    metadata_table.put_item(Item=item)

def flatten_and_publish_hashtags(video_id, hashtags):
    """
    Flatten hashtags and publish each hashtag with the associated video info
    to the up-hashtag table. Also registers each distinct hashtag in the
    up-hashtag-registry table so feed generation can avoid full table scans.
    """
    for hashtag in hashtags:
        if not isinstance(hashtag, str) or not hashtag.strip():
            logger.warning("Invalid hashtag type: %s. Skipping.", hashtag)
            continue

        hashtag_item = {
            "hashtag": hashtag,
            "videoId": video_id,
            "timestamp": datetime.utcnow().isoformat(),
            "popularity": 0
        }
        try:
            hashtag_table.put_item(Item=hashtag_item)
        except Exception as e:
            logger.error("Error publishing hashtag %s for video %s: %s", hashtag, video_id, e)

        # Register the hashtag in the registry (idempotent — same PK just overwrites)
        try:
            hashtag_registry_table.put_item(Item={"hashtag": hashtag})
        except Exception as e:
            logger.error("Error registering hashtag %s in registry: %s", hashtag, e)

def check_rate_limit(device_id):
    """
    Enforce per-device upload rate limiting.
    Uses an hour-bucketed key so each window auto-expires via DynamoDB TTL.
    Raises PermissionError if the device has exceeded MAX_UPLOADS_PER_HOUR.
    """
    hour_bucket = int(time.time()) // RATE_LIMIT_WINDOW_SECONDS
    rate_key = f"{device_id}#upload#{hour_bucket}"
    ttl = (hour_bucket + 2) * RATE_LIMIT_WINDOW_SECONDS  # expire 1 window after current

    response = rate_limit_table.update_item(
        Key={'rate_key': rate_key},
        UpdateExpression='SET #count = if_not_exists(#count, :zero) + :one, #ttl = :ttl',
        ExpressionAttributeNames={'#count': 'request_count', '#ttl': 'ttl'},
        ExpressionAttributeValues={':zero': 0, ':one': 1, ':ttl': ttl},
        ReturnValues='UPDATED_NEW',
    )
    new_count = int(response['Attributes']['request_count'])
    if new_count > MAX_UPLOADS_PER_HOUR:
        raise PermissionError(
            f"Rate limit exceeded: {MAX_UPLOADS_PER_HOUR} uploads per hour per device"
        )


def validate_description(description):
    """
    Server-side description validation matching client-side MAX_DESCRIPTION_CHARACTERS.
    Returns a sanitized description string. Raises ValueError on invalid input.
    """
    if not isinstance(description, str):
        raise ValueError("description must be a string")

    description = description.strip()

    if len(description) == 0:
        raise ValueError("description cannot be empty")

    if len(description) > MAX_DESCRIPTION_LENGTH:
        raise ValueError(
            f"description exceeds {MAX_DESCRIPTION_LENGTH} character limit"
        )

    return description


def validate_hashtags(hashtags):
    """
    Server-side hashtag validation matching client-side rules.
    Returns a sanitized list of hashtags. Raises ValueError on invalid input.
    """
    if not isinstance(hashtags, list):
        raise ValueError("hashtags must be a list")

    if len(hashtags) < MIN_HASHTAGS:
        raise ValueError(f"At least {MIN_HASHTAGS} hashtags are required")

    if len(hashtags) > MAX_HASHTAGS:
        raise ValueError(f"Maximum {MAX_HASHTAGS} hashtags allowed")

    seen = set()
    sanitized = []
    for tag in hashtags:
        if not isinstance(tag, str):
            raise ValueError(f"Each hashtag must be a string, got {type(tag).__name__}")

        tag = tag.strip()
        if not tag:
            raise ValueError("Hashtag cannot be empty")

        if len(tag) > MAX_HASHTAG_LENGTH:
            raise ValueError(f"Hashtag '{tag[:20]}...' exceeds {MAX_HASHTAG_LENGTH} character limit")

        tag_lower = tag.lower()
        if tag_lower in seen:
            raise ValueError(f"Duplicate hashtag: {tag}")
        seen.add(tag_lower)
        sanitized.append(tag)

    return sanitized


def remove_hashtags(description) -> str:
    words = description.split()
    return ' '.join([word for word in words if not word.startswith('#')])

def lambda_handler(event, context):
    try:
        from attestation_verifier import verify_request, enforce_user_binding
        attestation_result = verify_request(event)

        device_id = attestation_result.get('device_id')
        if device_id:
            check_rate_limit(device_id)

        raw_body = event.get('body', '')
        if len(raw_body) > MAX_REQUEST_BODY_SIZE:
            raise ValueError(
                f"Request body exceeds {MAX_REQUEST_BODY_SIZE} byte limit"
            )

        body = json.loads(raw_body)

        # IDOR: device_id ↔ user_id binding
        user_id = body.get('user_id')
        enforce_user_binding(device_id, user_id)

        video_id = body.get('videoId')
        description = body.get('description')
        uploaded_at = body.get('uploadedAt', datetime.utcnow().isoformat())

        if not video_id:
            return {
                "statusCode": 400,
                "body": json.dumps({"message": "Missing required fields: videoId"})
            }

        description = validate_description(description)
        hashtags = validate_hashtags(body.get('hashtags', []))
        mute_by_default = body.get('muteByDefault', False)
        city = body.get('city', 'NA')
        region = body.get('region', 'NA')
        country = body.get('country', 'NA')

        date_partition = uploaded_at[:10]

        item = {
            "videoId": video_id,
            "description": remove_hashtags(description),
            "uploadedAt": uploaded_at,
            "datePartition": date_partition,
            "hashtags": hashtags,
            "muteByDefault": mute_by_default,
            "city": city, 
            "region": region, 
            "country": country,
            "compressionStatus": "PROCESSING",  # set to READY by up-s3-staged-to-compressed
        }

        save_metadata(item)
        flatten_and_publish_hashtags(video_id, hashtags)

        response_body = {
            "message": "Metadata and hashtags saved successfully",
            "videoId": video_id
        }
        if attestation_result.get('session_token'):
            response_body['session_token'] = attestation_result['session_token']

        return {
            "statusCode": 200,
            "body": json.dumps(response_body)
        }
    except ValueError as ve:
        return {
            "statusCode": 400,
            "body": json.dumps({"message": str(ve)})
        }
    except PermissionError as pe:
        # Rate limit violations get 429; auth failures get 403
        is_rate_limit = "Rate limit exceeded" in str(pe)
        return {
            "statusCode": 429 if is_rate_limit else 403,
            "body": json.dumps({"message": str(pe)})
        }
    except Exception as e:
        logger.exception("Error saving metadata")
        return {
            "statusCode": 500,
            "body": json.dumps({"message": "Failed to save metadata"})
        }
