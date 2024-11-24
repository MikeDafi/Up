import { ENV_NAME } from '@env';

export const VideoFeedType = {
    VIDEO_FOCUSED_FEED: 'VIDEO_FOCUSED_FEED',
    VIDEO_AUDIO_FEED: 'VIDEO_AUDIO_FEED',
};

export const VIDEO_METADATA_API_URL = 'https://vie8q37y20.execute-api.us-east-2.amazonaws.com/prod/createVideoMetadata';

export const S3_API_URL = `https://o28an1f9e8.execute-api.us-east-2.amazonaws.com/${ENV_NAME}`;