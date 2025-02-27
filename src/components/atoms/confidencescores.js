import { getHashtagConfidenceScoresCache, updateHashtagConfidenceScoresCache, setLastConfidenceScoreDecayTimestamp, getLastUploadHashtagTimestamp, setLastUploadHashtagTimestamp} from "./videoCacheStorage";
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
 * @param {Object} currentScores - A map of hashtags to confidence scores.
 * @param {number} decayFactor - The percentage to degrade each score (e.g., 0.95 for 5% decay).
 * @returns {Object} - The updated scores after applying the decay.
 */
const applyScoreDecay = (currentScores, decayFactor = 0.95) => {
  const updatedScores = {};
  for (const [hashtag, score] of Object.entries(currentScores)) {
    updatedScores[hashtag] = Math.max(0, score * decayFactor); // Ensure scores don't drop below 0
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
  const currentScores = await getHashtagConfidenceScoresCache(video_feed_type);
  for (const hashtag of hashtags) {
    const currentScore = currentScores[hashtag] || 0;
    const scoreUpdate = calculateConfidenceScoreUpdate(interactions);
    currentScores[hashtag] = Math.max(0, currentScore + scoreUpdate); // Ensure scores don't go below 0
  }

  // Extract the top confidence scores and update the cache
  const topScores = Object.entries(currentScores)
      .filter(([, score]) => !isNaN(score) && score != null)
      .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
      .slice(0, HASHTAG_CONFIDENCE_LOCAL_CACHE_SIZE_LIMIT)
      .reduce((acc, [hashtag, score]) => {
        acc[hashtag] = score;
        return acc;
      }, {});

  try {
    await updateHashtagConfidenceScoresCache(video_feed_type, topScores);
    console.log("getHashtagConfidenceScoresCache", video_feed_type, await getHashtagConfidenceScoresCache(video_feed_type));
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
        const currentScores = await getHashtagConfidenceScoresCache(video_feed_type);
        const updatedScores = applyScoreDecay(currentScores);
        await updateHashtagConfidenceScoresCache(video_feed_type, updatedScores);
        await setLastConfidenceScoreDecayTimestamp(now);
        }
    }
  } catch (error) {
    console.error('Failed to apply decay to all confidence scores:', error);
  }
};
/**
 * Uploads the top confidence scores to the DynamoDB backend.
 * @returns {Promise<void>}
 */
export const uploadHashtagConfidenceScores = async () => {
  try {
    const lastUploadHashtagTimestamp = await getLastUploadHashtagTimestamp();
    const now = Date.now();

    // if (lastUploadHashtagTimestamp && now - lastUploadHashtagTimestamp > BACKUP_USER_DATA_INTERVAL_MS) {
    //   return;
    // }

    const uuid = await getUUIDCache();
    const payload = {
      "user_id": uuid
    };
    for (const video_feed_type of Object.values(VideoFeedType)) {
      const confidenceScores = await getHashtagConfidenceScoresCache(video_feed_type);
      payload[video_feed_type] = {};

      // Extract top HASHTAG_CONFIDENCE_UPLOAD_SIZE_LIMIT hashtags with their confidence scores
      payload[video_feed_type][HASHTAG_CONFIDENCE_SCORES_KEY] = Object.entries(confidenceScores)
          .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
          .slice(0, HASHTAG_CONFIDENCE_UPLOAD_SIZE_LIMIT)
          .reduce((acc, [hashtag, score]) => {
            acc[hashtag] = score;
            return acc;
          }, {});

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