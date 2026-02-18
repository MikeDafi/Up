import { ENV_NAME } from '@env';

export const VideoFeedType = {
    VIDEO_FOCUSED_FEED: 'VIDEO_FOCUSED_FEED',
    VIDEO_AUDIO_FEED: 'VIDEO_AUDIO_FEED',
};

export const CREATE_VIDEO_METADATA_URL = `https://vie8q37y20.execute-api.us-east-2.amazonaws.com/${ENV_NAME}/createVideoMetadata`;

export const UPDATE_USER_DATA_URL = `https://em6qi5e4cl.execute-api.us-east-2.amazonaws.com/${ENV_NAME}/up-update-user-profiles`;

export const S3_API_URL = `https://o28an1f9e8.execute-api.us-east-2.amazonaws.com/${ENV_NAME}`;

// Attestation challenge endpoint
export const ATTESTATION_CHALLENGE_URL = `https://lns75kqv74.execute-api.us-east-2.amazonaws.com/${ENV_NAME}/challenge`;

export const SESSION_TOKEN_KEY = 'session_token';
export const ATTESTED_KEY_ID_KEY = 'attested_key_id';

export const COMPRESSED_S3_BUCKET = `https://up-compressed-content.s3.us-east-2.amazonaws.com`;

export const GET_FEED_URL = `https://qi6dd69zxd.execute-api.us-east-2.amazonaws.com/${ENV_NAME}/feed`;

export const SEEN_VIDEO_METADATAS_KEY = 'seen_video_metadatas';
export const SEEN_VIDEO_METADATAS_LIMIT = 1000;

export const SEEN_VIDEO_IDS_CHECKSUM_UPDATE_TIMESTAMP_KEY = 'seen_video_checksum_ids_update_timestamp';

export const SEEN_VIDEO_IDS_CHECKSUM_UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
export const SEEN_VIDEO_IDS_CHECKSUM_UPLOAD_SIZE_LIMIT = 100;
export const CURRENT_VIDEO_INDEX_KEY = 'current_video_index';

export const CURRENT_VIDEO_PATHS_KEY = 'current_video_paths';

export const HASHTAG_CONFIDENCE_SCORES_KEY = 'hashtag_to_confidence_scores';
export const HASHTAG_CONFIDENCE_UPLOAD_SIZE_LIMIT = 50;
export const HASHTAG_CONFIDENCE_LOCAL_CACHE_SIZE_LIMIT = 1000;

export const LAST_CONFIDENCE_SCORE_DECAY_UPDATE_TIMESTAMP_KEY = 'last_confidence_score_decay_timestamp';
export const LAST_UPLOAD_HASHTAG_CONFIDENCE_SCORE_TIMESTAMP_KEY = 'last_upload_hashtag_confidence_scores_timestamp';
export const APPLY_DECAY_INTERVAL_MS = 24 * 60 * 60 * 1000;  // 1 day

export const BACKUP_USER_DATA_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export const LAST_LOGIN_UPDATE_TIMESTAMP_KEY = 'last_login_update_timestamp';
export const LAST_LOGIN_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day

export const NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE = 5;

export const NUM_VIDEOS_TO_REQUEST = 40; // Hard cap is set on up-generated-feed lambda side

export const PADDING_VIDEO_W_AUDIO_FEED = '10.5%'; // padding from bottom for video w audio feed
export const PADDING_BOTTOM_CONTROLLER_WRAPPER = '17.5%'; // bottom controller padding from bottom
export const HEIGHT_VIDEO_W_AUDIO_FEED = '60.5%'; // this value - PADDING_VIDEO_W_AUDIO_FEED = 50%
export const HEIGHT_VIDEO_W_AUDIO_VIDEO_IN_VIDEO_SLIDE = '90%';

export const VIDEO_REFRESH_PERIOD_MS = 300000; // 5 minutes

export const RIGHT_PADDING_FOR_CONTROLLERS = 25;

export const REATTEMPT_FETCHING_FEED_INTERVAL = 30000; // 30 seconds
export const MAX_REATTEMPT_FETCHING_FEED_INTERVAL = 120000; // 2 minutes

export const PERCENTAGE_OF_VIDEO_CONFIDENCE_SCORE_WEIGHT = 0.5;
export const ON_LIKE_CONFIDENCE_SCORE_WEIGHT = 1;
export const ON_UNLIKE_CONFIDENCE_SCORE_WEIGHT = -1;
export const COMMENT_CONFIDENCE_SCORE_WEIGHT = 0.8;

export const MAX_DESCRIPTION_CHARACTERS = 500;