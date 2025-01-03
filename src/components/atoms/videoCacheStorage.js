import AsyncStorage from '@react-native-async-storage/async-storage';
import {SEEN_VIDEO_IDS_KEY, CURRENT_VIDEO_INDEX_KEY, CURRENT_VIDEO_PATHS_KEY, SEEN_VIDEO_IDS_LIMIT} from './constants';
import {VideoMetadata} from '../atoms/VideoMetadata';
export const cacheData = async (key, data) => {
try {
await AsyncStorage.setItem(key, JSON.stringify(data));
} catch (error) {
console.error(`Failed to cache data for key ${key}:`, error);
}
};

export const retrieveCachedData = async (key, fallback = null) => {
try {
const data = await AsyncStorage.getItem(key);
return data ? JSON.parse(data) : data;
} catch (error) {
console.error(`Failed to retrieve cached data for key ${key}:`, error);
return fallback;
}
};

export const updateSeenVideoMetadatasCache = async (video_feed_type, newIds) => {
    const currentIds = (await retrieveCachedData(`${video_feed_type}/${SEEN_VIDEO_IDS_KEY}`, [])) || [];
    const updatedIds = [...newIds, ...currentIds].slice(0, SEEN_VIDEO_IDS_LIMIT);
    await cacheData(`${video_feed_type}/${SEEN_VIDEO_IDS_KEY}`, updatedIds);
};

export const getSeenVideoMetadatasCache = async (video_feed_type) => {
    return await retrieveCachedData(`${video_feed_type}/${SEEN_VIDEO_IDS_KEY}`, []);
}

export const getVideoIndexIdealStateCache = async (video_feed_type) => {
    return await retrieveCachedData(`${video_feed_type}/${CURRENT_VIDEO_INDEX_KEY}`, 0);
}

export const setVideoIndexIdealStateCache = async (video_feed_type, index) =>
    cacheData(`${video_feed_type}/${CURRENT_VIDEO_INDEX_KEY}`, index);

export const getVideoMetadatasCache = async (video_feed_type) => {
    const videoRawMetadatas = await retrieveCachedData(`${video_feed_type}/${CURRENT_VIDEO_PATHS_KEY}`, []);
    if (!Array.isArray(videoRawMetadatas)) {
        console.warn('Invalid cached video metadata:', videoRawMetadatas);
        return [];
    }
    return videoRawMetadatas.map((videoRawMetadata) => new VideoMetadata(videoRawMetadata));
}

export const setVideoMetadatasCache = async (video_feed_type, videoMetadatas) => {
    cacheData(`${video_feed_type}/${CURRENT_VIDEO_PATHS_KEY}`,
        videoMetadatas.map((videoMetadata) => videoMetadata.toJSON()));
}

export const getAndSetVideoScreenTutorialSeenCache = async () => {
    const seen = await retrieveCachedData('videoScreenTutorialSeen', false);
    if (!seen) {
        await cacheData('videoScreenTutorialSeen', true);
    }
    console.log('seen', seen);
    return seen;
}