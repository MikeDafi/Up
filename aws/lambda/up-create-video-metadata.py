import json
import boto3
from datetime import datetime

# Initialize the DynamoDB client
dynamodb = boto3.resource('dynamodb')
metadata_table = dynamodb.Table('up-videometadata')
hashtag_table = dynamodb.Table('up-hashtag')

def save_metadata(item):
    """
    Save video metadata to the DynamoDB table.
    """
    metadata_table.put_item(Item=item)

def flatten_and_publish_hashtags(video_id, hashtags):
    """
    Flatten hashtags and publish each hashtag with the associated video inform
    to the up-hashtag table.
    """
    for hashtag in hashtags:
        if not isinstance(hashtag, str) or not hashtag.strip():
            print(f"Invalid hashtag type: {hashtag}. Skipping.")
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
            print(f"Error publishing hashtag {hashtag} for video {video_id}: {e}")

def remove_hashtags(description) -> str:
    """
    Remove hashtags from the description.
    """
    words = description.split()
    return ' '.join([word for word in words if not word.startswith('#')])

def lambda_handler(event, context):
    try:
        # Parse the incoming metadata from the event body
        body = json.loads(event['body'])

        # Extract and validate required fields
        video_id = body.get('videoId')
        description = body.get('description')
        uploaded_at = body.get('uploadedAt', datetime.utcnow().isoformat())

        if not video_id:
            return {
                "statusCode": 400,
                "body": json.dumps({"message": "Missing required fields: videoId"})
            }

        # Extract optional fields
        hashtags = body.get('hashtags', [])  # Default to an empty list if not provided
        mute_by_default = body.get('muteByDefault', False)  # Default to False if not provided
        city = body.get('city', 'NA')
        region = body.get('region', 'NA')
        country = body.get('country', 'NA')

        # Extract date partition (YYYY-MM-DD) for efficient cleanup queries
        date_partition = uploaded_at[:10]  # "2025-12-25T10:30:00" -> "2025-12-25"

        # Prepare the item to insert into DynamoDB
        item = {
            "videoId": video_id,
            "description": remove_hashtags(description),
            "uploadedAt": uploaded_at,
            "datePartition": date_partition,  # For GSI-based cleanup queries
            "hashtags": hashtags,
            "muteByDefault": mute_by_default,
            "city": city, 
            "region": region, 
            "country": country
        }

        # Save metadata to DynamoDB
        save_metadata(item)

        # Flatten and publish hashtags
        flatten_and_publish_hashtags(video_id, hashtags)

        # Return success response
        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "Metadata and hashtags saved successfully",
                "videoId": video_id
            })
        }
    except Exception as e:
        # Log the error for debugging
        print(f"Error: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"message": "Failed to save metadata", "error": str(e)})
        }
