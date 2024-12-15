import { ENV_NAME } from '@env';

export const VideoFeedType = {
    VIDEO_FOCUSED_FEED: 'VIDEO_FOCUSED_FEED',
    VIDEO_AUDIO_FEED: 'VIDEO_AUDIO_FEED',
};

export const CREATE_VIDEO_METADATA_URL = `https://vie8q37y20.execute-api.us-east-2.amazonaws.com/${ENV_NAME}/createVideoMetadata`;

export const S3_API_URL = `https://o28an1f9e8.execute-api.us-east-2.amazonaws.com/${ENV_NAME}`;

export const COMPRESSED_S3_BUCKET = `https://up-compressed-content.s3.us-east-2.amazonaws.com`;

export const GET_FEED_URL = `https://qi6dd69zxd.execute-api.us-east-2.amazonaws.com/${ENV_NAME}/feed`;

export const SEEN_VIDEO_IDS_KEY = 'seen_video_ids';
export const SEEN_VIDEO_IDS_LIMIT = 500;
export const CURRENT_VIDEO_INDEX_KEY = 'current_video_index';

export const CURRENT_VIDEO_PATHS_KEY = 'current_video_paths';

export const SEEN_VIDEOS_FETCH_FEED_THRESHOLD_PERCENTAGE = 0.7
