import boto3
import json
import logging
from datetime import datetime
from decimal import Decimal
from enum import Enum
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Guard against oversized payloads to prevent DynamoDB storage abuse.
# The entire request body must not exceed this limit (bytes).
MAX_REQUEST_BODY_SIZE = 10 * 1024  # 10 KB — generous for preferences + feed metadata

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('up-user-profiles')


class VideoFeedType(Enum):
    VIDEO_FOCUSED_FEED = "VIDEO_FOCUSED_FEED"
    VIDEO_AUDIO_FEED = "VIDEO_AUDIO_FEED"


class VideoFeedTypeMetadata:
    def __init__(self, hashtag_to_confidence_scores=None):
        self.hashtag_to_confidence_scores = hashtag_to_confidence_scores or {}

    def to_dynamodb(self):
        return {
            k: Decimal(str(v))
            for k, v in self.hashtag_to_confidence_scores.items()
            if k.strip()
        }

    @classmethod
    def from_payload(cls, payload):
        return cls(
            hashtag_to_confidence_scores=payload.get('hashtag_to_confidence_scores', {})
        )


class UserProfile:
    def __init__(self, user_id, video_feed_metadata=None, preferences=None, last_login=None):
        self.user_id = user_id
        self.video_feed_metadata = video_feed_metadata or {
            VideoFeedType.VIDEO_FOCUSED_FEED.value: VideoFeedTypeMetadata(),
            VideoFeedType.VIDEO_AUDIO_FEED.value: VideoFeedTypeMetadata(),
        }
        self.preferences = preferences or {}
        self.last_login = last_login

    @classmethod
    def from_payload(cls, payload):
        logger.debug("Received payload for user_id=%s", payload.get('user_id', 'unknown'))
        user_id = payload.get('user_id')
        if not user_id:
            raise ValueError("user_id is required")

        video_feed_metadata = {
            VideoFeedType.VIDEO_FOCUSED_FEED.value: VideoFeedTypeMetadata.from_payload(
                payload.get(VideoFeedType.VIDEO_FOCUSED_FEED.value, {})
            ),
            VideoFeedType.VIDEO_AUDIO_FEED.value: VideoFeedTypeMetadata.from_payload(
                payload.get(VideoFeedType.VIDEO_AUDIO_FEED.value, {})
            ),
        }
        logger.debug("Video feed metadata: %s", video_feed_metadata)

        return cls(
            user_id=user_id,
            video_feed_metadata=video_feed_metadata,
            preferences=payload.get('preferences', {}),
            last_login=payload.get('last_login')
        )

    def validate(self):
        if not self.user_id:
            raise ValueError("user_id is required")
        if not any(self.video_feed_metadata.values()) and not self.preferences and not self.last_login:
            raise ValueError("No valid data to update (e.g., video feed metadata, preferences, or last_login).")

    def to_dynamodb_item(self):
        item = {
            'user_id': self.user_id,
        }

        for feed_type, metadata in self.video_feed_metadata.items():
            item[feed_type] = metadata.to_dynamodb()

        if self.preferences:
            item['preferences'] = self.preferences

        if self.last_login:
            item['last_login'] = self.last_login

        logger.debug("Item: %s", item)
        return item


def ensure_user_exists(user_profile):
    """Create the profile if it doesn't already exist (conditional put)."""
    logger.info("user_profile %s %s", user_profile.user_id, user_profile.video_feed_metadata)
    try:
        table.put_item(
            Item=user_profile.to_dynamodb_item(),
            ConditionExpression="attribute_not_exists(user_id)",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise


def sanitize_dynamodb_map(d):
    """Remove empty-string keys and convert floats to Decimal for DynamoDB."""
    if isinstance(d, dict):
        return {k: sanitize_dynamodb_map(v) for k, v in d.items() if k.strip()}
    elif isinstance(d, list):
        return [sanitize_dynamodb_map(v) for v in d]
    elif isinstance(d, float):
        return Decimal(str(d))
    return d


def update_user_profile(user_profile):
    sanitized_focused_feed = sanitize_dynamodb_map({
        "hashtag_to_confidence_scores": user_profile.video_feed_metadata["VIDEO_FOCUSED_FEED"].to_dynamodb()
    })

    sanitized_audio_feed = sanitize_dynamodb_map({
        "hashtag_to_confidence_scores": user_profile.video_feed_metadata["VIDEO_AUDIO_FEED"].to_dynamodb()
    })

    update_expression = (
        "SET #prefs = :prefs, #last_login = :last_login, "
        "#algorithm = if_not_exists(#algorithm, :empty_map)"
    )
    expression_attribute_values = {
        ":prefs": sanitize_dynamodb_map(user_profile.preferences),
        ":last_login": user_profile.last_login or datetime.utcnow().isoformat(),
        ":empty_map": {},
    }
    expression_attribute_names = {
        "#prefs": "preferences",
        "#last_login": "last_login",
        "#algorithm": "algorithm",
    }

    try:
        table.update_item(
            Key={"user_id": user_profile.user_id},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values,
            ExpressionAttributeNames=expression_attribute_names,
        )

        feed_update_expression = (
            "SET #algorithm.#video_focused_feed = :video_focused_feed, "
            "#algorithm.#video_audio_feed = :video_audio_feed"
        )
        feed_expression_attribute_values = {
            ":video_focused_feed": sanitized_focused_feed if sanitized_focused_feed else {},
            ":video_audio_feed": sanitized_audio_feed if sanitized_audio_feed else {},
        }
        feed_expression_attribute_names = {
            "#algorithm": "algorithm",
            "#video_focused_feed": "VIDEO_FOCUSED_FEED",
            "#video_audio_feed": "VIDEO_AUDIO_FEED",
        }

        table.update_item(
            Key={"user_id": user_profile.user_id},
            UpdateExpression=feed_update_expression,
            ExpressionAttributeValues=feed_expression_attribute_values,
            ExpressionAttributeNames=feed_expression_attribute_names,
        )

    except Exception as e:
        logger.error("Error updating user profile: %s", e)
        raise


def lambda_handler(event, context):
    try:
        from attestation_verifier import verify_request, enforce_user_binding
        attestation_result = verify_request(event)

        raw_body = event.get('body', '')
        if len(raw_body) > MAX_REQUEST_BODY_SIZE:
            raise ValueError(
                f"Request body exceeds {MAX_REQUEST_BODY_SIZE} byte limit"
            )

        payload = json.loads(raw_body)

        # IDOR: device_id ↔ user_id binding
        enforce_user_binding(attestation_result.get('device_id'), payload.get('user_id'))

        user_profile = UserProfile.from_payload(payload)
        user_profile.validate()

        ensure_user_exists(user_profile)
        update_user_profile(user_profile)

        response_body = {'message': 'User profile updated successfully'}
        if attestation_result.get('session_token'):
            response_body['session_token'] = attestation_result['session_token']

        return {
            'statusCode': 200,
            'body': json.dumps(response_body)
        }
    except PermissionError as pe:
        return {
            'statusCode': 403,
            'body': json.dumps({'error': str(pe)})
        }
    except ValueError:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Invalid request parameters'})
        }
    except Exception as e:
        logger.exception("Unexpected error in lambda_handler")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Internal server error'})
        }
