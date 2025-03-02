import { getHashtagConfidenceScoreMetadatasCache, updateHashtagConfidenceScoreMetadatasCache, setLastConfidenceScoreDecayTimestamp, getLastUploadHashtagTimestamp, setLastUploadHashtagTimestamp} from "./videoCacheStorage";
import {getLastConfidenceScoreDecayTimestamp, getUUIDCache} from "./videoCacheStorage";
import {updateUserData} from "./dynamodb";
import {
  APPLY_DECAY_INTERVAL_MS,
  BACKUP_USER_DATA_INTERVAL_MS,
  COMMENT_CONFIDENCE_SCORE_WEIGHT,
  PERCENTAGE_OF_VIDEO_CONFIDENCE_SCORE_WEIGHT,
  HASHTAG_CONFIDENCE_UPLOAD_SIZE_LIMIT,
  ON_LIKE_CONFIDENCE_SCORE_WEIGHT,
  ON_UNLIKE_CONFIDENCE_SCORE_WEIGHT,
  HASHTAG_CONFIDENCE_SCORES_KEY,
  VideoFeedType, HASHTAG_CONFIDENCE_LOCAL_CACHE_SIZE_LIMIT
} from "./constants";

/**
 * Calculates the confidence score update for different user interactions.
 *
 * @param {Object} interactions - An object containing interaction counts.
 *   Example: { onFullView: 1, onLike: 2, onComment: 1 }
 * @returns {number} - The total contribution to the confidence score.
 */
const calculateConfidenceScoreUpdate = (interactions) => {
  const { percentageSeenOfVideo = 0, onLike = 0, onComment = 0,
          onUnLike = 0} = interactions;


  return (
      percentageSeenOfVideo * PERCENTAGE_OF_VIDEO_CONFIDENCE_SCORE_WEIGHT +
      onLike * ON_LIKE_CONFIDENCE_SCORE_WEIGHT +
      onComment * COMMENT_CONFIDENCE_SCORE_WEIGHT +
      onUnLike * ON_UNLIKE_CONFIDENCE_SCORE_WEIGHT
  );
};

/**
 * Degrades all confidence scores over time.
 *
 * @param {Object} currentScoreMetadatas - A map of hashtags to confidence score metadata
 * @param {number} decayFactor - The percentage to degrade each score (e.g., 0.95 for 5% decay).
 * @returns {Object} - The updated scores after applying the decay.
 */
const applyScoreDecay = (currentScoreMetadatas, decayFactor = 0.98) => {
  const updatedScores = {};
  for (const [hashtag, scoreMetadatas] of Object.entries(currentScoreMetadatas)) {
    // Decay by number of days since last update
    const daysSinceLastUpdate = (Date.now() - scoreMetadatas.last_updated) / (24 * 60 * 60 * 1000);
    updatedScores[hashtag] = Math.max(0, scoreMetadatas.score * Math.pow(decayFactor, daysSinceLastUpdate));
  }
  return updatedScores;
};

/**
 * Updates confidence scores for a single hashtag based on interactions.
 *
 * @param video_feed_type
 * @param hashtags
 * @param {Object} interactions - Interaction counts for the hashtag.
 *   Example: { percentageSeenOfVideo: 0.5, onLike: 2, onComment: 1 }
 * @returns {Promise<void>}
 */
export const calculateAndUpdateConfidenceScoreCache = async (video_feed_type, hashtags, interactions) => {
  const currentScoresMetadatas = await getHashtagConfidenceScoreMetadatasCache(video_feed_type);
  const currentDate = Date.now();
  for (const hashtag of hashtags) {
    const currentScoreMetadata = currentScoresMetadatas[hashtag] || {"score": 0, "last_updated": currentDate};
    const scoreUpdate = calculateConfidenceScoreUpdate(interactions);
    // if score in currentScoresMetadatas is null, set it
    const currentScore = currentScoreMetadata.score ?? 0;
    currentScoresMetadatas[hashtag] = {"score": Math.max(0, currentScore + scoreUpdate), "last_updated": currentDate};
  }

  // Extract the top confidence scores and update the cache
  const topScores = sortHashtagToConfidenceScoreMetadatas(currentScoresMetadatas, HASHTAG_CONFIDENCE_LOCAL_CACHE_SIZE_LIMIT);
  try {
    await updateHashtagConfidenceScoreMetadatasCache(video_feed_type, topScores);
  } catch (error) {
    console.error(`Failed to update confidence score for hashtag "${hashtag}":`, error);
    return;
  }
};


/**
 * Applies score decay to all hashtags once a week.
 *
 * @returns {Promise<void>}
 */
export const applyDecayToAllConfidenceScores = async () => {
  try {
    const lastDecayTimestamp = await getLastConfidenceScoreDecayTimestamp();
    const now = Date.now();

    if (!lastDecayTimestamp || now - lastDecayTimestamp > APPLY_DECAY_INTERVAL_MS) {
      for (const video_feed_type of Object.values(VideoFeedType)) {
        const currentScoreMetadatas = await getHashtagConfidenceScoreMetadatasCache(video_feed_type);
        const updatedScoreMetadatas = applyScoreDecay(currentScoreMetadatas);
        await updateHashtagConfidenceScoreMetadatasCache(video_feed_type, updatedScoreMetadatas);
        await setLastConfidenceScoreDecayTimestamp(now);
        }
    }
  } catch (error) {
    console.error('Failed to apply decay to all confidence scores:', error);
  }
};

/**
 * Sorts hashtags by confidence score and returns the top scores. Optionally, only hashtag to score mapping can be returned.
 */
const sortHashtagToConfidenceScoreMetadatas = (currentScoresMetadatas, list_limit, keepScoresOnly=false) => {
  return  Object.entries(currentScoresMetadatas)
      .filter(([, scoreMetadatas]) => scoreMetadatas != null && !isNaN(scoreMetadatas.score))
      .sort(([, scoreMetadataA], [, scoreMetadataB]) => scoreMetadataB.score - scoreMetadataA.score)
      .slice(0, list_limit)
      .reduce((acc, [hashtag, scoreMetadata]) => {
        acc[hashtag] = keepScoresOnly ? scoreMetadata.score : scoreMetadata;
        return acc;
      }, {});
};


/**
 * Uploads the top confidence scores to the DynamoDB backend.
 * @returns {Promise<void>}
 */
export const uploadHashtagConfidenceScores = async () => {
  try {
    const lastUploadHashtagTimestamp = await getLastUploadHashtagTimestamp();
    const now = Date.now();

    if (lastUploadHashtagTimestamp && now - lastUploadHashtagTimestamp > BACKUP_USER_DATA_INTERVAL_MS) {
      return;
    }

    const uuid = await getUUIDCache();
    const payload = {
      "user_id": uuid
    };
    for (const video_feed_type of Object.values(VideoFeedType)) {
      const currentScoresMetadatas = await getHashtagConfidenceScoreMetadatasCache(video_feed_type);
      payload[video_feed_type] = {};

      payload[video_feed_type][HASHTAG_CONFIDENCE_SCORES_KEY] = sortHashtagToConfidenceScoreMetadatas(currentScoresMetadatas, HASHTAG_CONFIDENCE_UPLOAD_SIZE_LIMIT, true);

      if (Object.keys(payload[video_feed_type][HASHTAG_CONFIDENCE_SCORES_KEY]).length === 0) {
        console.debug("No hashtag confidence scores to upload.");
        return;
      }
    }
    await updateUserData(payload);
    await setLastUploadHashtagTimestamp(now);
  } catch (error) {
    console.error("Failed to upload hashtag confidence scores:", error);
  }
}