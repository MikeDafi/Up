import json
import boto3
from boto3.dynamodb.conditions import Key
from datetime import datetime, timedelta
from decimal import Decimal
import random
import time
import traceback
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed


dynamodb = boto3.resource('dynamodb')
hashtag_table = dynamodb.Table('up-hashtag')
hashtag_registry_table = dynamodb.Table('up-hashtag-registry')
user_profiles_table = dynamodb.Table('up-user-profiles')

TOO_MANY_REQUESTS_ERROR = "User too recently requesting new feed"
HARD_FEED_LIMIT = 40
HASHTAG_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60  # 7 days
ACTIVE_USER_WINDOW_DAYS = 7  # Only batch-generate feeds for users active within this window

_hashtag_cache = {"hashtags": None, "expires_at": 0}

debug_mode = False  # Set to False to disable debug logs

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG if debug_mode else logging.INFO)

def generate_video_feed(user_id, hashtags, confidence_scores, limit, seen_checksums=None):
    """Generate a ranked video feed, preserving the hashtag slot ordering."""
    if seen_checksums is None:
        seen_checksums = set()
    logger.debug(f"Generating video feed for hashtags: {hashtags}")
    user_feed_hashtags_ordered = get_hashtags_for_video_generation(hashtags, confidence_scores, limit)
    video_ids = get_video_ids_for_video_generation(user_id, user_feed_hashtags_ordered, seen_checksums)
    if not video_ids:
        logger.warning("No video IDs retrieved, returning empty feed.")
    video_metadatas = get_video_metadatas(video_ids)
    logger.debug(f"Generated video feed: {video_metadatas}")
    return video_metadatas

_VIDEO_METADATA_FIELDS = 'videoId, description, hashtags, muteByDefault, uploadedAt, city, #r, country, compressionStatus'
_VIDEO_METADATA_EXPR_NAMES = {'#r': 'region'}  # reserved word
_VIDEOID_GSI = 'videoId-uploadedAt-index'

videometadata_table = dynamodb.Table('up-videometadata')


def _query_video_metadata(video_id: str):
    try:
        response = videometadata_table.query(
            IndexName=_VIDEOID_GSI,
            KeyConditionExpression=Key('videoId').eq(video_id),
            ProjectionExpression=_VIDEO_METADATA_FIELDS,
            ExpressionAttributeNames=_VIDEO_METADATA_EXPR_NAMES,
            Limit=1,
        )
        items = response.get('Items', [])
        return items[0] if items else None
    except Exception as e:
        logger.error(f"Error querying metadata for videoId {video_id}: {e}")
        return None


def get_video_metadatas(video_ids):
    """Resolve metadata via videoId GSI in parallel, filter by compressionStatus."""
    if not video_ids:
        return []

    logger.debug(f"Fetching metadata for {len(video_ids)} video IDs via GSI queries")
    video_metadata = []

    with ThreadPoolExecutor(max_workers=min(len(video_ids), 10)) as executor:
        futures = {executor.submit(_query_video_metadata, vid): vid for vid in video_ids}
        for future in as_completed(futures):
            result = future.result()
            if result is not None:
                video_metadata.append(result)

    # Legacy videos without compressionStatus are treated as ready
    video_metadata = [
        item for item in video_metadata
        if item.get('compressionStatus', 'READY') == 'READY'
    ]

    for item in video_metadata:
        item.pop('compressionStatus', None)

    metadata_by_id = {item['videoId']: item for item in video_metadata}
    return [metadata_by_id[vid] for vid in video_ids if vid in metadata_by_id]

def _query_hashtag(hashtag: str):
    try:
        response = hashtag_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('hashtag').eq(hashtag),
            ScanIndexForward=False,
            Limit=200
        )
        return hashtag, response.get('Items', [])
    except Exception as e:
        logger.debug(f"Hashtag is unknown {hashtag}: {e}")
        return hashtag, []


def get_video_ids_for_video_generation(user_id: str, user_feed_hashtags_ordered: list[str], seen_video_ids_checksums: set) -> list[str]:
    unique_hashtags = list(set(user_feed_hashtags_ordered))
    feed = [None] * len(user_feed_hashtags_ordered)

    hashtag_to_feed_index = {hashtag: [] for hashtag in unique_hashtags}
    for idx, hashtag in enumerate(user_feed_hashtags_ordered):
        hashtag_to_feed_index[hashtag].append(idx)

    used_video_ids = set()
    logger.debug(f"Excluding {len(seen_video_ids_checksums)} seen video checksums")

    hashtag_items = {}
    with ThreadPoolExecutor(max_workers=min(len(unique_hashtags), 10)) as executor:
        futures = {executor.submit(_query_hashtag, ht): ht for ht in unique_hashtags}
        for future in as_completed(futures):
            hashtag, items = future.result()
            if items:
                hashtag_items[hashtag] = items

    for hashtag in unique_hashtags:
        items = hashtag_items.get(hashtag)
        if not items:
            continue

        logger.debug(f"Retrieved {len(items)} items for hashtag {hashtag}")

        available_videos = [
            item['videoId'] for item in items
            if item['videoId'] not in used_video_ids and item['videoId'][:8] not in seen_video_ids_checksums
        ]

        if not available_videos:
            continue

        available_set = set(available_videos)
        chosen_videos = random.choices(
            population=available_videos,
            weights=[max(float(item['popularity']), 1e-6) for item in items if item['videoId'] in available_set],
            k=min(len(available_videos), len(hashtag_to_feed_index[hashtag]))
        )

        for i, index in enumerate(hashtag_to_feed_index[hashtag]):
            if i < len(chosen_videos):
                feed[index] = chosen_videos[i]
                used_video_ids.add(chosen_videos[i])

    return [video for video in feed if video is not None]


def get_hashtags_for_video_generation(hashtags, confidence_scores, limit) -> list[str]:
    """Weighted sampling: exploit confident tags, explore trending + random."""
    confident_tags = {tag: confidence_scores[tag] for tag in confidence_scores if tag in hashtags}
    missing_tags = [tag for tag in confidence_scores if tag not in hashtags]

    trending_tags = random.sample(hashtags, min(len(hashtags), 5))  # TODO: real trending source

    for missing_tag in missing_tags:
        if trending_tags:
            replacement_tag = random.choice(trending_tags)
            confident_tags[replacement_tag] = confident_tags.get(replacement_tag, Decimal(0)) + Decimal(confidence_scores[missing_tag]) * Decimal('0.8')

    exploratory_tags = [tag for tag in hashtags if tag not in confident_tags]
    exploratory_scores = {tag: Decimal(random.uniform(0.1, 0.3)) for tag in exploratory_tags}
    trending_scores = {tag: Decimal(random.uniform(0.3, 0.5)) for tag in trending_tags if tag not in confident_tags}

    combined_scores = {**confident_tags, **exploratory_scores, **trending_scores}
    max_score = max(combined_scores.values(), default=Decimal(1))
    combined_scores = {tag: score / max_score for tag, score in combined_scores.items()}

    if not combined_scores:
        return []

    feed = random.choices(
        population=list(combined_scores.keys()),
        weights=[float(score) for score in combined_scores.values()],
        k=min(limit, HARD_FEED_LIMIT)
    )

    logger.debug(f"Generated video feed for hashtags: {feed}")

    return feed

def fetch_user_profile(user_id, retries=3, delay=10):
    for attempt in range(retries):
        response = user_profiles_table.get_item(Key={'user_id': user_id})
        user_profile = response.get('Item')

        if user_profile:
            return user_profile

        time.sleep(delay)

    return None

def fetch_all_hashtags():
    """Scan up-hashtag-registry (not up-hashtag) for distinct tags. Cached 7 days."""
    now = time.time()
    if _hashtag_cache["hashtags"] is not None and now < _hashtag_cache["expires_at"]:
        return _hashtag_cache["hashtags"]

    hashtags = []
    response = hashtag_registry_table.scan(ProjectionExpression='hashtag')
    hashtags.extend(item['hashtag'] for item in response.get('Items', []))
    while 'LastEvaluatedKey' in response:
        response = hashtag_registry_table.scan(
            ProjectionExpression='hashtag',
            ExclusiveStartKey=response['LastEvaluatedKey']
        )
        hashtags.extend(item['hashtag'] for item in response.get('Items', []))

    _hashtag_cache["hashtags"] = hashtags
    _hashtag_cache["expires_at"] = now + HASHTAG_CACHE_TTL_SECONDS
    return hashtags

def should_generate_new_feed(last_updated_feed):
    if not last_updated_feed:
        return True
    last_updated_feed = datetime.fromisoformat(last_updated_feed)
    return (datetime.utcnow() - last_updated_feed) >= timedelta(seconds=5)  # TODO: restore to minutes=5 after testing

def update_user_feed(user_id, video_feed):
    """Writes last_batch_feed_update (not last_updated_feed) to avoid throttling individual requests."""
    try:
        user_profiles_table.update_item(
            Key={'user_id': user_id},
            UpdateExpression="SET video_feed = :video_feed, last_batch_feed_update = :last_batch_feed_update",
            ExpressionAttributeValues={
                ':video_feed': video_feed,
                ':last_batch_feed_update': datetime.utcnow().isoformat()
            }
        )
    except Exception as e:
        logger.error("Error updating user feed for user_id %s: %s", user_id, e)
        raise


def update_individual_feed_timestamp(user_id, video_feed_type):
    try:
        user_profiles_table.update_item(
            Key={'user_id': user_id},
            UpdateExpression="SET #ts_key = :ts",
            ExpressionAttributeNames={
                '#ts_key': f'last_updated_feed_{video_feed_type}'
            },
            ExpressionAttributeValues={
                ':ts': datetime.utcnow().isoformat()
            }
        )
    except Exception as e:
        logger.error(f"Error updating individual feed timestamp for {user_id}: {e}")

def extract_seen_checksums(user_profile: dict) -> set:
    return set(
        user_profile.get('preferences', {}).get('seen_video_ids_checksum', [])
    )

def process_individual_user(user_id, video_feed_type, limit):
    """Rate-limited per feed type (batch uses last_batch_feed_update)."""
    user_profile = fetch_user_profile(user_id)
    if not user_profile:
        raise Exception(f"User profile not found for user_id {user_id}")
    
    feed_timestamp_key = f'last_updated_feed_{video_feed_type}'
    if not should_generate_new_feed(user_profile.get(feed_timestamp_key)):
        raise Exception(f"{TOO_MANY_REQUESTS_ERROR} for user_id {user_id}, please wait a couple minutes")

    hashtag_to_confidence = user_profile.get('algorithm', {}).get(video_feed_type, {}).get('hashtag_to_confidence_scores', {})
    seen_checksums = extract_seen_checksums(user_profile)
    hashtags = fetch_all_hashtags()

    if not hashtags:
        logger.warning(f"No hashtags retrieved for user {user_id}.")

    video_feed = generate_video_feed(user_id, hashtags, hashtag_to_confidence, limit, seen_checksums)

    if not video_feed:
        logger.warning(f"No video feed generated for user {user_id}. {video_feed}")

    update_individual_feed_timestamp(user_id, video_feed_type)

    return video_feed

def _is_recently_active(user, window_days=ACTIVE_USER_WINDOW_DAYS):
    last_login = user.get('preferences', {}).get('last_login')
    if not last_login:
        return False
    try:
        login_dt = datetime.fromisoformat(last_login)
        return (datetime.utcnow() - login_dt) < timedelta(days=window_days)
    except (ValueError, TypeError):
        return False


def process_all_users():
    """Batch pre-generate feeds for users active in the last ACTIVE_USER_WINDOW_DAYS days."""
    response = user_profiles_table.scan(Limit=50)
    users = response.get('Items', [])

    while users:
        for user in users:
            user_id = user['user_id']

            if not _is_recently_active(user):
                continue

            if not should_generate_new_feed(user.get('last_batch_feed_update')):
                continue

            algorithm = user.get('algorithm', {})
            focused_scores = algorithm.get('VIDEO_FOCUSED_FEED', {}).get('hashtag_to_confidence_scores', {})
            audio_scores = algorithm.get('VIDEO_AUDIO_FEED', {}).get('hashtag_to_confidence_scores', {})
            hashtag_to_confidence = {**focused_scores, **audio_scores}
            for tag in focused_scores:
                if tag in audio_scores:
                    hashtag_to_confidence[tag] = max(focused_scores[tag], audio_scores[tag])

            seen_checksums = extract_seen_checksums(user)
            hashtags = fetch_all_hashtags()
            video_feed = generate_video_feed(user_id, hashtags, hashtag_to_confidence, HARD_FEED_LIMIT, seen_checksums)
            update_user_feed(user_id, video_feed)

        if 'LastEvaluatedKey' not in response:
            break

        response = user_profiles_table.scan(Limit=50, ExclusiveStartKey=response['LastEvaluatedKey'])
        users = response.get('Items', [])

def get_params_invalid_reason(user_id, video_feed_type, limit):
    if not user_id or not isinstance(user_id, str):
        return "Invalid user_id, must be a string"
    if not video_feed_type or not isinstance(video_feed_type, str) or video_feed_type not in ["VIDEO_AUDIO_FEED", "VIDEO_FOCUSED_FEED"]:
        return "Invalid video_feed_type, must be VIDEO_AUDIO_FEED or VIDEO_FOCUSED_FEED"
    if not limit or not isinstance(limit, int) or limit <= 0:
        return "Invalid limit, must be >= 0"
    return None

def lambda_handler(event, context):
    try:
        if 'http' in event["requestContext"]:
            from attestation_verifier import verify_request, enforce_user_binding
            attestation_result = verify_request(event)

            body = json.loads(event.get('body', '{}'))
            user_id = body.get('user_id')

            enforce_user_binding(attestation_result.get('device_id'), user_id)
            video_feed_type = body.get('video_feed_type')
            limit = body.get('limit', HARD_FEED_LIMIT)

            invalid_param_reason = get_params_invalid_reason(user_id, video_feed_type, limit)
            if invalid_param_reason:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"message": invalid_param_reason})
                }

            video_feed = process_individual_user(user_id, video_feed_type, limit)
            response_body = {"video_feed": video_feed}
            if attestation_result.get('session_token'):
                response_body['session_token'] = attestation_result['session_token']

            return {
                "statusCode": 200,
                "body": json.dumps(response_body, default=str)
            }
        else:
            process_all_users()
            return {
                "statusCode": 200,
                "body": json.dumps({"message": "User feeds generated and stored successfully"})
            }

    except PermissionError as pe:
        return {
            "statusCode": 403,
            "body": json.dumps({"message": str(pe)})
        }
    except Exception as e:
        traceback.print_exc()
        if TOO_MANY_REQUESTS_ERROR in str(e):
            return {
                "statusCode": 429,
                "body": json.dumps({"message": "Too many new feed requests, please wait a couple minutes"})
            }
        else:
            return {
                "statusCode": 500,
                "body": json.dumps({"message": "Failed to generate user feeds"})
            }