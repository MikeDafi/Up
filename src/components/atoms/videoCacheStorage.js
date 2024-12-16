import AsyncStorage from '@react-native-async-storage/async-storage';
import {SEEN_VIDEO_IDS_KEY, CURRENT_VIDEO_INDEX_KEY, CURRENT_VIDEO_PATHS_KEY, SEEN_VIDEO_IDS_LIMIT} from './constants';

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
return data ? JSON.parse(data) : fallback;
} catch (error) {
console.error(`Failed to retrieve cached data for key ${key}:`, error);
return fallback;
}
};

export const updateSeenVideoIdsCache = async (video_feed_type, newIds) => {
    const currentIds = (await retrieveCachedData(`${video_feed_type}/${SEEN_VIDEO_IDS_KEY}`, [])) || [];
    const updatedIds = Array.from(new Set([...currentIds, ...newIds])).slice(-SEEN_VIDEO_IDS_LIMIT); // Keep the last SEEN_VIDEO_IDS_LIMIT ids
    await cacheData(`${video_feed_type}/${SEEN_VIDEO_IDS_KEY}`, updatedIds);
};

export const getSeenVideoIdsCache = async (video_feed_type) =>
    retrieveCachedData(`${video_feed_type}/${SEEN_VIDEO_IDS_KEY}`, []);

export const getVideoIndexIdealStateCache = async (video_feed_type) =>
    retrieveCachedData(`${video_feed_type}/${CURRENT_VIDEO_INDEX_KEY}`, 0);

export const setVideoIndexIdealStateCache = async (video_feed_type, index) =>
    cacheData(`${video_feed_type}/${CURRENT_VIDEO_INDEX_KEY}`, index);

export const getCurrentVideoIdsCache = async (video_feed_type) =>
    retrieveCachedData(`${video_feed_type}/${CURRENT_VIDEO_PATHS_KEY}`, []);

export const setVideoIdsCache = async (video_feed_type, videoIds) =>
    cacheData(`${video_feed_type}/${CURRENT_VIDEO_PATHS_KEY}`, videoIds);