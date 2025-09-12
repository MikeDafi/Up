import json
import boto3
from boto3.dynamodb.conditions import Key
from datetime import datetime, timedelta
from decimal import Decimal
import random
import time
import traceback
import logging


# Initialize the DynamoDB client
dynamodb = boto3.resource('dynamodb')
hashtag_table = dynamodb.Table('up-hashtag')
user_profiles_table = dynamodb.Table('up-user-profiles')

TOO_MANY_REQUESTS_ERROR = "User too recently requesting new feed"
HARD_FEED_LIMIT = 40

debug_mode = False  # Set to False to disable debug logs

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG if debug_mode else logging.INFO)

def generate_video_feed(user_id, hashtags, confidence_scores, limit):
    """
    Generate a video feed using hashtags, querying the up-hashtag table's default hashtag-timestamp index.
    Maintain the order of user_feed_hashtags_ordered and place video_ids into the identical index as seen in user_feed_hashtags_ordered.
    """
    logger.debug(f"Generating video feed for hashtags: {hashtags}")
    user_feed_hashtags_ordered = get_hashtags_for_video_generation(hashtags, confidence_scores, limit)
    video_ids = get_video_ids_for_video_generation(user_id, user_feed_hashtags_ordered)
    if not video_ids:
        logger.warning("No video IDs retrieved, returning empty feed.")
    video_metadatas = get_video_metadatas(video_ids)
    logger.debug(f"Generated video feed: {video_metadatas}")
    return video_metadatas

def get_video_metadatas(video_ids):
    """
    Fetch metadata for a list of video_ids from the up-video-metadata table.
    """
    logger.debug(f"Fetching metadata for video IDs: {video_ids}")
    metadata_table = dynamodb.Table('up-videometadata')
    video_metadata = []
    
    for video_id in video_ids:
        try:
            response = metadata_table.query(
                IndexName="videoId-uploadedAt-index",
                KeyConditionExpression=Key('videoId').eq(video_id)
            )
            logger.debug(f"Metadata query response: {response}")
            items = response.get('Items')
            if items:
                video_metadata.append(items[0])
        except Exception as e:
            logger.error(f"Error fetching metadata for video {video_id}: {e}")
    
    return video_metadata

def get_video_ids_for_video_generation(user_id: str, user_feed_hashtags_ordered: list[str]) -> list[str]:
    """ Use the hashtags for video feed to get the video ids for the feed, excluding seen videos. """
    unique_hashtags = list(set(user_feed_hashtags_ordered))
    feed = [None] * len(user_feed_hashtags_ordered)  # Pre-allocate the feed list
    
    hashtag_to_feed_index = {hashtag: [] for hashtag in unique_hashtags}
    for idx, hashtag in enumerate(user_feed_hashtags_ordered):
        hashtag_to_feed_index[hashtag].append(idx)
    
    used_video_ids = set()  # Track used video IDs to prevent duplicates
    seen_video_ids_checksums = fetch_seen_video_ids_checksums(user_id)  # Get seen videos for exclusion
    print("seen_video_ids_checksums", seen_video_ids_checksums)

    for hashtag in unique_hashtags:
        try:
            # Query the last 200 videos using the hashtag-timestamp index
            response = hashtag_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('hashtag').eq(hashtag),
                ScanIndexForward=False,  # Get latest videos first
                Limit=200  # Fetch last 200 videos
            )
        except Exception as e:
            logger.debug(f"Hashtag is unknown {hashtag}: {e}")
            continue

        items = response.get('Items', [])
        logger.debug(f"Retrieved {len(items)} items for hashtag {hashtag}")

        if not items:
            continue
        
        # Filter out videos already seen
        available_videos = [
            item['videoId'] for item in items 
            if item['videoId'] not in used_video_ids and item['videoId'][:8] not in seen_video_ids_checksums
        ]
        
        if not available_videos:
            continue  # Skip if no new unique videos found
        
        chosen_videos = random.choices(
            population=available_videos,
            weights=[max(float(item['popularity']), 1e-6) for item in items if item['videoId'] in available_videos],
            k=min(len(available_videos), len(hashtag_to_feed_index[hashtag]))  # Ensure we don't exceed available videos
        )

        for i, index in enumerate(hashtag_to_feed_index[hashtag]):
            if i < len(chosen_videos):
                feed[index] = chosen_videos[i]
                used_video_ids.add(chosen_videos[i])  # Mark video as used

    return [video for video in feed if video is not None]

def fetch_seen_video_ids_checksums(user_id: str) -> set:
    """Fetch the set of seen video ID checksums for a given user."""
    try:
        response = user_profiles_table.get_item(Key={'user_id': user_id})
        user_preferences = response.get('Item', {}).get('preferences', {})
        seen_checksums = set(user_preferences.get('seen_video_ids_checksums', []))
        return seen_checksums
    except Exception as e:
        logger.error(f"Error fetching seen video IDs for user {user_id}: {e}")
        return set()

def fetch_exploratory_videos(count, scan_limit):
    """Fetch exploratory videos from trending or random sources, ensuring uniqueness."""
    try:
        response = hashtag_table.scan(Limit=scan_limit)  # Scan for trending/random videos
        videos = [item['videoId'] for item in response.get('Items', []) ]

        # Ensure we select unique exploratory videos
        return random.sample(videos, min(count, len(videos)))
    except Exception as e:
        logger.error(f"Error fetching exploratory videos: {e}")
        return []


def get_hashtags_for_video_generation(hashtags, confidence_scores, limit) -> list[str]:
    """
    Generate a user's video feed using hashtags and confidence scores.
    Implements exploration, exploitation, and TikTok-like ranking.
    If hashtags are missing, trending tags are used instead.
    """
    confident_tags = {tag: confidence_scores[tag] for tag in confidence_scores if tag in hashtags}
    missing_tags = [tag for tag in confidence_scores if tag not in hashtags]

    # Fetch trending hashtags (stubbed logic for now, implement as needed)
    trending_tags = random.sample(hashtags, min(len(hashtags), 5))

    # Replace missing tags with trending tags
    for missing_tag in missing_tags:
        if trending_tags:
            replacement_tag = random.choice(trending_tags)
            # Convert Decimal to float before multiplication
            confident_tags[replacement_tag] = confident_tags.get(replacement_tag, Decimal(0)) + Decimal(confidence_scores[missing_tag]) * Decimal('0.8')

    # Add exploratory tags with low initial confidence
    exploratory_tags = [tag for tag in hashtags if tag not in confident_tags]
    exploratory_scores = {tag: Decimal(random.uniform(0.1, 0.3)) for tag in exploratory_tags}

    # Assign scores to trending tags that were not used
    trending_scores = {tag: Decimal(random.uniform(0.3, 0.5)) for tag in trending_tags if tag not in confident_tags}

    # Combine and normalize scores
    combined_scores = {**confident_tags, **exploratory_scores, **trending_scores}
    max_score = max(combined_scores.values(), default=Decimal(1))
    combined_scores = {tag: score / max_score for tag, score in combined_scores.items()}

    if not combined_scores:
        return []

    # Create a feed with weighted random sampling
    feed = random.choices(
        population=list(combined_scores.keys()),
        weights=[float(score) for score in combined_scores.values()],
        k=min(limit, HARD_FEED_LIMIT)
    )

    logger.debug(f"Generated video feed for hashtags: {feed}")

    return feed

def fetch_user_profile(user_id, retries=3, delay=10):
    """
    Retrieve the user profile from DynamoDB.
    """
    for attempt in range(retries):
        response = user_profiles_table.get_item(Key={'user_id': user_id})
        user_profile = response.get('Item')

        if user_profile:
            return user_profile  # ✅ User found

        time.sleep(delay)  # ⏳ Wait before retrying

    return None  # ❌ User not found after retries

def fetch_all_hashtags():
    """
    Retrieve the list of hashtags from DynamoDB.
    """
    response = hashtag_table.scan()  # Adjust for larger datasets with pagination
    return [item['hashtag'] for item in response.get('Items', [])]

def should_generate_new_feed(last_updated_feed):
    """
    Determine if a new feed should be generated based on the last update time.
    """
    if not last_updated_feed: # Probably a new account to not have last_updated_feed
        return True
    last_updated_feed = datetime.fromisoformat(last_updated_feed)
    return (datetime.utcnow() - last_updated_feed) >= timedelta(minutes=5)

def update_user_feed(user_id, video_feed):
    """
    Update the user's video feed and last_updated_feed fields in DynamoDB.
    """
    try:
        user_profiles_table.update_item(
            Key={'user_id': user_id},
            UpdateExpression="SET video_feed = :video_feed, last_updated_feed = :last_updated_feed",
            ExpressionAttributeValues={
                ':video_feed': video_feed,
                ':last_updated_feed': datetime.utcnow().isoformat()
            }
        )
    except Exception as e:
        print(f"Error updating user feed for user_id {user_id}: {str(e)}")
        raise

def process_individual_user(user_id, video_feed_type, limit):
    """
    Process an individual user's request for a video feed.
    """
    user_profile = fetch_user_profile(user_id)
    if not user_profile:
        raise Exception(f"User profile not found for user_id {user_id}")
    
    if not should_generate_new_feed(user_profile.get('last_updated_feed')):
        raise Exception(f"{TOO_MANY_REQUESTS_ERROR} for user_id {user_id}, please wait a couple minutes")

    # Get the user's hashtag to confidence scores
    hashtag_to_confidence = user_profile.get(video_feed_type, {}).get('hashtag_to_confidence_scores', {})

    # Fetch the list of hashtags from up-hashtag
    hashtags = fetch_all_hashtags()

    if not hashtags:
        logger.warning(f"No hashtags retrieved for user {user_id}.")

    # Generate the user's video feed
    video_feed = generate_video_feed(user_id, hashtags, hashtag_to_confidence, limit,)

    if not video_feed:
        logger.warning(f"No video feed generated for user {user_id}. {video_feed}")

    return video_feed

def process_all_users():
    """
    Process all users to generate and store video feeds.
    """
    response = user_profiles_table.scan(Limit=50)
    users = response.get('Items', [])

    while users:
        for user in users:
            user_id = user['user_id']
            if not should_generate_new_feed(user.get('last_updated_feed')):
                continue
            # Get the user's hashtag to confidence scores
            hashtag_to_confidence = user.get('hashtag_to_confidence_scores', {})

            # Fetch the list of hashtags from up-hashtag
            hashtags = fetch_all_hashtags()

            # Generate the user's video feed
            video_feed = generate_video_feed(user_id, hashtags, hashtag_to_confidence)

            # Update the user's feed in the user profiles table
            update_user_feed(user_id, video_feed)

        # Check if there are more users to process
        if not 'LastEvaluatedKey' in response:
            break

        response = user_profiles_table.scan(Limit=50, ExclusiveStartKey=response['LastEvaluatedKey'])
        users = response.get('Items', [])

def get_params_invalid_reason(user_id, video_feed_type, limit):
    """
    Validate the parameters for the Lambda function.
    """
    if not user_id or not isinstance(user_id, str):
        return "Invalid user_id, must be a string"
    if not video_feed_type or not isinstance(video_feed_type, str) or video_feed_type not in ["VIDEO_AUDIO_FEED", "VIDEO_FOCUSED_FEED"]:
        raise ValueError("Invalid video_feed_type, must be VIDEO_AUDIO_FEED or VIDEO_FOCUSED_FEED")
    if not limit or not isinstance(limit, int) or limit <= 0:
        raise ValueError("Invalid limit, must be >= 0")

def lambda_handler(event, context):
    try:
        # Check if the invocation is via HTTP by inspecting the 'http' key
        if 'http' in event["requestContext"]:
            # Parse the request body
            body = json.loads(event.get('body', '{}'))
            user_id = body.get('user_id')
            video_feed_type = body.get('video_feed_type')
            limit = body.get('limit', HARD_FEED_LIMIT)

            invalid_param_reason = get_params_invalid_reason(user_id, video_feed_type, limit)
            if invalid_param_reason:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"message": invalid_param_reason})
                }

            video_feed = process_individual_user(user_id, video_feed_type, limit)
            return {
                "statusCode": 200,
                "body": json.dumps({"video_feed": video_feed})
            }
        else:
            # Handle non-HTTP invocations
            process_all_users()
            return {
                "statusCode": 200,
                "body": json.dumps({"message": "User feeds generated and stored successfully"})
            }

    except Exception as e:
        # Log the error for debugging
        traceback.print_exc()  # This prints the full stack trace to the logs
        if TOO_MANY_REQUESTS_ERROR in str(e):
            return {
                "statusCode": 429,
                "body": json.dumps({"message": "Too many new feed requests, please wait a couple minutes", "error": str(e)})
            }
        else:
            return {
                "statusCode": 500,
                "body": json.dumps({"message": "Failed to generate user feeds", "error": str(e)})
            }