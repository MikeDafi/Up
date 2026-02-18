import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    SEEN_VIDEO_METADATAS_KEY,
    CURRENT_VIDEO_INDEX_KEY,
    CURRENT_VIDEO_PATHS_KEY,
    SEEN_VIDEO_METADATAS_LIMIT,
    LAST_CONFIDENCE_SCORE_DECAY_UPDATE_TIMESTAMP_KEY,
    HASHTAG_CONFIDENCE_SCORES_KEY,
    LAST_UPLOAD_HASHTAG_CONFIDENCE_SCORE_TIMESTAMP_KEY,
    LAST_LOGIN_UPDATE_TIMESTAMP_KEY, SEEN_VIDEO_IDS_CHECKSUM_UPDATE_TIMESTAMP_KEY
} from './constants';
import {VideoMetadata} from './VideoMetadata';
import {generateUUID} from './utilities';

export const cacheData = async (key, data) => {
    try {
        await AsyncStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error('Failed to cache data:', error.message);
    }
};

export const retrieveCachedData = async (key, fallback = null) => {
    try {
        const data = await AsyncStorage.getItem(key);
        if (data === null) {
            return fallback;
        }
        return data ? JSON.parse(data) : data;
    } catch (error) {
        console.error('Failed to retrieve cached data:', error.message);
        return fallback;
    }
};

export const updateSeenVideoMetadatasCache = async (video_feed_type, new_video_metadatas) => {
    const currentIds = (await retrieveCachedData(`${SEEN_VIDEO_METADATAS_KEY}`, [])) || [];

    // Maintain unique IDs while preserving order (newer ones first)
    const idSet = new Set();
    const updatedIds = [...new_video_metadatas, ...currentIds].filter(videoMetadata => {
        if (idSet.has(videoMetadata.videoId)) return false; // Skip duplicates
        idSet.add(videoMetadata.videoId);
        return true;
    }).slice(0, SEEN_VIDEO_METADATAS_LIMIT); // Enforce limit

    await cacheData(`${SEEN_VIDEO_METADATAS_KEY}`, updatedIds);
};

export const getSeenVideoMetadatasCache = async () => {
    return await retrieveCachedData(`${SEEN_VIDEO_METADATAS_KEY}`, []);
};

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
    return seen;
}

export const getUUIDCache = async () => {
    const uuid = await retrieveCachedData('uuid', null);
    if (!uuid) {
        const newUUID = generateUUID();
        await cacheData('uuid', newUUID);
        return newUUID;
    }
    return uuid;
};

export const getHashtagConfidenceScoreMetadatasCache = async (video_feed_type) => {
    const raw = await retrieveCachedData(`${video_feed_type}/${HASHTAG_CONFIDENCE_SCORES_KEY}`, {});
    // Normalize: heal any entries corrupted into bare numbers (e.g. from a previous applyScoreDecay bug)
    const normalized = {};
    for (const [hashtag, value] of Object.entries(raw)) {
        if (typeof value === 'number') {
            normalized[hashtag] = { score: value, last_updated: Date.now() };
        } else if (value && typeof value === 'object' && typeof value.score === 'number') {
            normalized[hashtag] = value;
        }
        // Drop entries that are null, undefined, or otherwise malformed
    }
    return normalized;
};

export const updateHashtagConfidenceScoreMetadatasCache = async (video_feed_type,confidenceScores) => {
    await cacheData(`${video_feed_type}/${HASHTAG_CONFIDENCE_SCORES_KEY}`, confidenceScores);
}

export const getLastConfidenceScoreDecayTimestamp = async () => {
    return await retrieveCachedData(LAST_CONFIDENCE_SCORE_DECAY_UPDATE_TIMESTAMP_KEY, null);
}

export const setLastConfidenceScoreDecayTimestamp = async (timestamp) => {
    await cacheData(LAST_CONFIDENCE_SCORE_DECAY_UPDATE_TIMESTAMP_KEY, timestamp);
}

export const getLastUploadHashtagTimestamp = async () => {
    return await retrieveCachedData(LAST_UPLOAD_HASHTAG_CONFIDENCE_SCORE_TIMESTAMP_KEY, null);
}

export const setLastUploadHashtagTimestamp = async (timestamp) => {
    await cacheData(LAST_UPLOAD_HASHTAG_CONFIDENCE_SCORE_TIMESTAMP_KEY, timestamp);
}

export const getLastLoginUpdateTimestamp = async () => {
    return await retrieveCachedData(LAST_LOGIN_UPDATE_TIMESTAMP_KEY, null);
}

export const setLastLoginUpdateTimestamp = async (timestamp) => {
    await cacheData(LAST_LOGIN_UPDATE_TIMESTAMP_KEY, timestamp);
}

export const getSeenVideoIdsChecksumUpdateTimestamp = async () => {
    return await retrieveCachedData(SEEN_VIDEO_IDS_CHECKSUM_UPDATE_TIMESTAMP_KEY, null);
}

export const setSeenVideoIdsChecksumUpdateTimestamp = async (timestamp) => {
    await cacheData(SEEN_VIDEO_IDS_CHECKSUM_UPDATE_TIMESTAMP_KEY, timestamp);
}
