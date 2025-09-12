import boto3
import json
import traceback
from datetime import datetime
from enum import Enum

# Initialize DynamoDB client
dynamodb = boto3.client('dynamodb')


class VideoFeedType(Enum):
    VIDEO_FOCUSED_FEED = "VIDEO_FOCUSED_FEED"
    VIDEO_AUDIO_FEED = "VIDEO_AUDIO_FEED"


class VideoFeedTypeMetadata:
    def __init__(self, hashtag_to_confidence_scores=None):
        self.hashtag_to_confidence_scores = hashtag_to_confidence_scores or {}

    def to_dynamodb(self):
        # ✅ Remove empty keys before converting to DynamoDB format
        sanitized_scores = {k: v for k, v in self.hashtag_to_confidence_scores.items() if k.strip()}
        return {
            k: {'N': str(v)} for k, v in sanitized_scores.items()
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
        """
        Create a UserProfile instance from a payload dictionary.
        """
        print(f"Received payload: {payload}")
        user_id = payload.get('user_id')
        if not user_id:
            raise ValueError("user_id is required")

        # Parse VideoFeedTypeMetadata for both feed types
        video_feed_metadata = {
            VideoFeedType.VIDEO_FOCUSED_FEED.value: VideoFeedTypeMetadata.from_payload(
                payload.get(VideoFeedType.VIDEO_FOCUSED_FEED.value, {})
            ),
            VideoFeedType.VIDEO_AUDIO_FEED.value: VideoFeedTypeMetadata.from_payload(
                payload.get(VideoFeedType.VIDEO_AUDIO_FEED.value, {})
            ),
        }
        print(f"Video feed metadata: {video_feed_metadata}")

        return cls(
            user_id=user_id,
            video_feed_metadata=video_feed_metadata,
            preferences=payload.get('preferences', {}),
            last_login=payload.get('last_login')
        )

    def validate(self):
        """
        Validate the user profile fields.
        """
        if not self.user_id:
            raise ValueError("user_id is required")
        if not any(self.video_feed_metadata.values()) and not self.preferences and not self.last_login:
            raise ValueError("No valid data to update (e.g., video feed metadata, preferences, or last_login).")

    def to_dynamodb_item(self):
        """
        Convert the UserProfile instance to a DynamoDB item for insertion.
        """
        item = {
            'user_id': {'S': self.user_id},
        }

        for feed_type, metadata in self.video_feed_metadata.items():
            item[feed_type] = {'M': metadata.to_dynamodb()}

        if self.preferences:
            item['preferences'] = {'M': {
                k: {'S': str(v)} for k, v in self.preferences.items()
            }}

        if self.last_login:
            item['last_login'] = {'S': self.last_login}
        print(f"Item: {item}")
        return item


def ensure_user_exists(table_name, user_profile):
    """
    Ensure the user profile exists in the DynamoDB table. If it doesn't exist, create it.
    """
    print("user_profile", user_profile.user_id, user_profile.video_feed_metadata)
    try:
        dynamodb.put_item(
            TableName=table_name,
            Item=user_profile.to_dynamodb_item(),
            ConditionExpression="attribute_not_exists(#user_id)",  # ✅ Use alias
            ExpressionAttributeNames={  # ✅ Define the alias
                "#user_id": "user_id"
            }
        )
    except dynamodb.exceptions.ClientError as e:
        if not e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise  # Raise other errors normally

def sanitize_dynamodb_map(d):
    """ Recursively remove empty string keys from a nested dictionary. """
    if isinstance(d, dict):
        return {k: sanitize_dynamodb_map(v) for k, v in d.items() if k.strip()}
    elif isinstance(d, list):
        return [sanitize_dynamodb_map(v) for v in d]
    return d

def update_user_profile(table_name, user_profile):
    """
    Update the user profile in the DynamoDB table.
    """

    # Step 1: Ensure 'algorithm' exists
    update_expression = """SET #prefs = :prefs, #last_login = :last_login, 
                           #algorithm = if_not_exists(#algorithm, :empty_map)"""

    expression_attribute_values = {
        ":prefs": {"M": {k: {"S": str(v)} for k, v in user_profile.preferences.items()}},
        ":last_login": {"S": user_profile.last_login or datetime.utcnow().isoformat()},
        ":empty_map": {"M": {}},  # Ensures `algorithm` is initialized if missing
    }
    expression_attribute_names = {
        "#prefs": "preferences",
        "#last_login": "last_login",
        "#algorithm": "algorithm",
    }

    try:
        # Step 1: Ensure 'algorithm' exists
        dynamodb.update_item(
            TableName=table_name,
            Key={"user_id": {"S": user_profile.user_id}},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values,
            ExpressionAttributeNames=expression_attribute_names,
        )

        # Step 2: Remove Old Root-Level VIDEO_FEED Fields (Prevents Redundancy)
        update_expression_remove = "REMOVE #video_focused_feed, #video_audio_feed"

        expression_attribute_names_remove = {
            "#video_focused_feed": "VIDEO_FOCUSED_FEED",
            "#video_audio_feed": "VIDEO_AUDIO_FEED",
        }

        dynamodb.update_item(
            TableName=table_name,
            Key={"user_id": {"S": user_profile.user_id}},
            UpdateExpression=update_expression_remove,
            ExpressionAttributeNames=expression_attribute_names_remove,
        )

        # Step 3: Sanitize and update 'VIDEO_FOCUSED_FEED' and 'VIDEO_AUDIO_FEED' inside 'algorithm'
        sanitized_focused_feed = sanitize_dynamodb_map({
            "hashtag_to_confidence_scores": {
                "M": {k: {"N": str(v)} for k, v in user_profile.video_feed_metadata["VIDEO_FOCUSED_FEED"].hashtag_to_confidence_scores.items()}
            }
        })

        sanitized_audio_feed = sanitize_dynamodb_map({
            "hashtag_to_confidence_scores": {
                "M": {k: {"N": str(v)} for k, v in user_profile.video_feed_metadata["VIDEO_AUDIO_FEED"].hashtag_to_confidence_scores.items()}
            }
        })

        update_expression = """SET #algorithm.#video_focused_feed = :video_focused_feed, 
                               #algorithm.#video_audio_feed = :video_audio_feed"""
        expression_attribute_values = {
            ":video_focused_feed": {"M": sanitized_focused_feed} if sanitized_focused_feed else None,
            ":video_audio_feed": {"M": sanitized_audio_feed} if sanitized_audio_feed else None,
        }

        # Remove None values (DynamoDB does not accept None)
        expression_attribute_values = {k: v for k, v in expression_attribute_values.items() if v is not None}

        expression_attribute_names = {
            "#algorithm": "algorithm",
            "#video_focused_feed": "VIDEO_FOCUSED_FEED",
            "#video_audio_feed": "VIDEO_AUDIO_FEED",
        }

        dynamodb.update_item(
            TableName=table_name,
            Key={"user_id": {"S": user_profile.user_id}},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values,
            ExpressionAttributeNames=expression_attribute_names,
        )

    except Exception as e:
        print(f"Error updating user profile: {str(e)}")
        raise

def lambda_handler(event, context):
    table_name = 'up-user-profiles'

    try:
        # Parse and validate payload
        payload = json.loads(event['body'])
        user_profile = UserProfile.from_payload(payload)
        user_profile.validate()

        # Ensure the profile exists
        ensure_user_exists(table_name, user_profile)

        # Update the profile
        update_user_profile(table_name, user_profile)

        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'User profile updated successfully'})
        }
    except ValueError as ve:
        # Handle validation errors
        return {
            'statusCode': 400,
            'body': json.dumps({'error': str(ve)})
        }
    except Exception as e:
        # Handle unexpected errors
        traceback.print_exc()
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }