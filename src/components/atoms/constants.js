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

export const SEEN_VIDEOS_FETCH_FEED_THRESHOLD_PERCENTAGE = 0.6;

export const NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE = 4;

export const NUM_VIDEOS_TO_REQUEST = 10;

export const PADDING_VIDEO_W_AUDIO_FEED = '10.5%'; // padding from bottom for video w audio feed
export const PADDING_BOTTOM_CONTROLLER_WRAPPER = '17.5%'; // bottom controller padding from bottom
export const HEIGHT_VIDEO_W_AUDIO_FEED = '60.5%'; // this value - PADDING_VIDEO_W_AUDIO_FEED = 50%
export const HEIGHT_VIDEO_W_AUDIO_VIDEO_IN_VIDEO_SLIDE = '90%';

export const VIDEO_REFRESH_PERIOD_SECONDS = 600000; // 10 minutes

export const RIGHT_PADDING_FOR_CONTROLLERS = 25;