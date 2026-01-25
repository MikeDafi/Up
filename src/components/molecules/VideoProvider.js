import React, {useEffect, useRef, useState} from 'react';
import {Text, View, ActivityIndicator} from 'react-native';
import PropTypes from 'prop-types';
import {VideoContext} from '../atoms/contexts';

import {
  MAX_REATTEMPT_FETCHING_FEED_INTERVAL, NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE,
  NUM_VIDEOS_TO_REQUEST,
  REATTEMPT_FETCHING_FEED_INTERVAL,
  VIDEO_REFRESH_PERIOD_SECONDS,
  VideoFeedType
} from '../atoms/constants';
import {fetchFeed} from '../atoms/dynamodb';
import {backoff} from '../atoms/utilities';
import { useIsFocused } from "@react-navigation/native";
import {
  getVideoIndexIdealStateCache,
  getVideoMetadatasCache,
  setVideoIndexIdealStateCache,
  setVideoMetadatasCache,
  updateSeenVideoMetadatasCache,
  getSeenVideoMetadatasCache,
  getUUIDCache
} from '../atoms/videoCacheStorage';
import {VideoMetadata} from '../atoms/VideoMetadata';
import {calculateAndUpdateConfidenceScoreCache} from "../atoms/confidencescores";
import TemporaryWarningBanner from "./TemporaryWarningBanner";
import {getBlockedUsers} from '../atoms/moderation';

/**
 * Track video assignments across feeds to prevent duplicates during concurrent fetches.
 * This handles the race condition when both feeds load simultaneously.
 */
const globalVideoAssignments = {}; // {videoId: feedType}
const MAX_GLOBAL_ASSIGNMENTS = 500; // Clean up after this many entries

/**
 * Track feed lengths globally to enable weighted distribution
 */
const globalFeedLengths = {
  [VideoFeedType.VIDEO_AUDIO_FEED]: 0,
  [VideoFeedType.VIDEO_FOCUSED_FEED]: 0,
};

/**
 * Update the global feed length for a specific feed type
 */
const updateGlobalFeedLength = (feedType, length) => {
  globalFeedLengths[feedType] = length;
};

/**
 * Calculate weighted probability to favor the shorter feed
 * Returns probability that a video should be assigned to currentFeedType
 */
const calculateWeightedProbability = (currentFeedType, otherFeedType) => {
  const currentLength = globalFeedLengths[currentFeedType] || 0;
  const otherLength = globalFeedLengths[otherFeedType] || 0;
  const totalLength = currentLength + otherLength;
  
  // If both feeds are empty or equal, use 50/50
  if (totalLength === 0 || currentLength === otherLength) {
    return 0.5;
  }
  
  // Favor the shorter feed: shorter feed gets higher probability
  // If current feed is shorter, it should get more videos
  // Probability = otherLength / totalLength (inverse relationship)
  // Clamp between 0.2 and 0.8 to prevent extreme bias
  const rawProbability = otherLength / totalLength;
  const clampedProbability = Math.max(0.2, Math.min(0.8, rawProbability));
  
  console.debug(`Feed lengths - ${currentFeedType}: ${currentLength}, ${otherFeedType}: ${otherLength}, probability for current: ${clampedProbability.toFixed(2)}`);
  
  return clampedProbability;
};

/**
 * Clean up old video assignments to prevent unbounded memory growth
 */
const cleanupOldAssignments = () => {
  const assignmentKeys = Object.keys(globalVideoAssignments);
  if (assignmentKeys.length > MAX_GLOBAL_ASSIGNMENTS) {
    // Remove oldest 25% of entries
    const toRemove = Math.floor(assignmentKeys.length * 0.25);
    assignmentKeys.slice(0, toRemove).forEach(key => delete globalVideoAssignments[key]);
    console.debug(`Cleaned up ${toRemove} old video assignments`);
  }
};

const deduplicateAcrossFeeds = async (newVideos, currentFeedType) => {
  // Clean up old assignments periodically
  cleanupOldAssignments();
  
  const otherFeedType = currentFeedType === VideoFeedType.VIDEO_AUDIO_FEED 
    ? VideoFeedType.VIDEO_FOCUSED_FEED 
    : VideoFeedType.VIDEO_AUDIO_FEED;
  
  // Calculate weighted probability based on feed lengths
  const probabilityForCurrentFeed = calculateWeightedProbability(currentFeedType, otherFeedType);
  
  const deduplicatedVideos = [];
  
  for (const video of newVideos) {
    const videoId = video.videoId;
    
    // Check if this video has already been assigned to a feed during current session
    if (globalVideoAssignments[videoId]) {
      const assignedFeed = globalVideoAssignments[videoId];
      if (assignedFeed === currentFeedType) {
        // Already assigned to current feed, keep it
        deduplicatedVideos.push(video);
      } else {
        // Already assigned to other feed during concurrent fetch, skip it
        console.debug(`Video ${videoId} already assigned to ${assignedFeed}, skipping in ${currentFeedType}`);
      }
    } else {
      // First time seeing this video - assign with weighted probability favoring shorter feed
      const assignToCurrentFeed = Math.random() < probabilityForCurrentFeed;
      const assignedFeed = assignToCurrentFeed ? currentFeedType : otherFeedType;
      
      globalVideoAssignments[videoId] = assignedFeed;
      
      if (assignToCurrentFeed) {
        deduplicatedVideos.push(video);
        console.debug(`Video ${videoId} assigned to ${currentFeedType} (weight: ${(probabilityForCurrentFeed * 100).toFixed(0)}%)`);
      } else {
        console.debug(`Video ${videoId} assigned to ${otherFeedType}, skipping in ${currentFeedType}`);
      }
    }
  }
  
  return deduplicatedVideos;
};

const VideoProvider = ({children, video_feed_type}) => {
  const isFocused = useIsFocused();
  const [isMuted, setMuted] = useState(video_feed_type === VideoFeedType.VIDEO_FOCUSED_FEED);
  const [isLiked, setLiked] = useState(false);
  const [isPaused, setPaused] = useState(false);
  const [isRefreshing, setRefreshing] = useState(false);
  const [lastTimeRefreshed, setLastTimeRefreshed] = useState(null);
  const videoSlideFlatListRef = useRef(null);
  const videoSlideVideoRefs = useRef([]);
  const [videoMetadatas, setVideoMetadatas] = useState([]);
  const [, setVideoIndexIdealState] = useState(0);
  const [videoError, setVideoError] = useState("");
  const [videoIndexExternalView, setVideoIndexExternalView] = useState(0);
  const [checkedCache, setCheckedCache] = useState(false);
  const [temporaryWarning, setTemporaryWarning] = useState("");
  const [error, setError] = useState("");
  const [reAttemptFetchingFeedInterval, setreAttemptFetchingFeedInterval] = useState(REATTEMPT_FETCHING_FEED_INTERVAL);

  // Initialize data from storage
  const checkVideoCache = async () => {
    if (checkedCache) {
      return;
    }
    const cachedCurrentVideoMetadatas = await getVideoMetadatasCache(video_feed_type);
    const cachedIndex = await getVideoIndexIdealStateCache(video_feed_type);
    const startingVideoIndexIdealState = cachedIndex + 1;
    console.log("cachedCurrentVideoMetadatas", cachedCurrentVideoMetadatas, "cachedIndex", cachedIndex, "startingVideoIndexIdealState", startingVideoIndexIdealState);
    if (cachedCurrentVideoMetadatas) {
      const shrunkenVideoMetadatas = cachedCurrentVideoMetadatas.slice(startingVideoIndexIdealState, cachedCurrentVideoMetadatas.length);
      setVideoMetadatas(shrunkenVideoMetadatas);
      setVideoIndexIdealStateCache(video_feed_type, startingVideoIndexIdealState);
      setVideoMetadatasCache(video_feed_type, shrunkenVideoMetadatas);

      if (shrunkenVideoMetadatas.length < NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE) {
        await fetchNewVideos();
      }
    } else {
      await fetchNewVideos();
    }
    await setCheckedCache(true);
  }


  const keepUnSeenVideoMetadatas = async (videoMetadatas) => {
    const seenVideoMetadatas = await getSeenVideoMetadatasCache();
    const seenVideoIds = new Set(seenVideoMetadatas.map(v => v.videoId));
    
    const unseenVideos = videoMetadatas.filter(video => !seenVideoIds.has(video.videoId));
    
    if (unseenVideos.length < videoMetadatas.length) {
      console.debug(`Filtered out ${videoMetadatas.length - unseenVideos.length} already-seen videos`);
    }
    
    return unseenVideos;
  }

  const filterBlockedContent = async (videos) => {
    const blocked = await getBlockedUsers();
    if (blocked.length === 0) return videos;
    return videos.filter(video => {
      const uploaderId = video.videoId.split('-')[0];
      return !blocked.includes(uploaderId);
    });
  }

  const providerHandleBlockUser = async (uploaderId) => {
    // Remove blocked user's videos from feed instantly
    const filtered = videoMetadatas.filter(video => {
      const id = video.videoId.split('-')[0];
      return id !== uploaderId;
    });
    setVideoMetadatas(filtered);
    await setVideoMetadatasCache(video_feed_type, filtered);
    
    if (videoIndexExternalView >= filtered.length) {
      await triggerVideoIndex(Math.max(0, filtered.length - 1), true, 'blockUser');
    }
  }

  const fetchNewVideos = async (isManual = false, setRefreshingVariable = true) => {
    console.log("fetchNewVideos:: isManual:", isManual, "videoMetadatas", videoMetadatas.length, "videoIndexExternalView", videoIndexExternalView);
    setError("");

    if (setRefreshingVariable) { // in the case of automatic refresh, we don't want to show the spinner
      setRefreshing(true);
    }

    // Only apply rate limiting for manual refreshes (pull-to-refresh)
    // Automatic fetches when reaching end of feed should always proceed
    if (isManual) {
      if (!lastTimeRefreshed || (new Date() - lastTimeRefreshed) > VIDEO_REFRESH_PERIOD_SECONDS) {
        setLastTimeRefreshed(new Date());
      } else {
        setTimeout(() => setRefreshing(false), 1000);
        console.debug("Manual refresh too soon");
        const minutes = Math.floor((VIDEO_REFRESH_PERIOD_SECONDS - (new Date() - lastTimeRefreshed)) / 60000);
        setTemporaryWarning(`Wait ${minutes} minutes before refreshing again`);
        setTimeout(() => setTemporaryWarning(""), 2000);
        return;
      }
    }

    let videoMetadataBatch = [];
    try {
      const fetchFeedWithBackoff = backoff(fetchFeed, 2, 1000, 10000);
      const response = await fetchFeedWithBackoff({
        video_feed_type: video_feed_type,
        user_id: await getUUIDCache(),
        limit: NUM_VIDEOS_TO_REQUEST,
      });

      if (!response.video_feed || !Array.isArray(response.video_feed) || response.video_feed.length === 0) {
        setRefreshing(false);
        return;
      }
      videoMetadataBatch = response.video_feed.map(videoRawMetadata => new VideoMetadata(videoRawMetadata));
      
      // Debug: Log the video IDs being fetched
      console.log("Fetched video IDs:", videoMetadataBatch.map(v => v.videoId));
      
      // Cross-feed deduplication: Remove videos that exist in the other feed type
      videoMetadataBatch = await deduplicateAcrossFeeds(videoMetadataBatch, video_feed_type);
    } catch (err) {
      console.error("Error fetching videos:", err);
      setError(err.message);
    }

    let unSeenVideoMetadatasBatch = await keepUnSeenVideoMetadatas(videoMetadataBatch);
    unSeenVideoMetadatasBatch = await filterBlockedContent(unSeenVideoMetadatasBatch);

    if (unSeenVideoMetadatasBatch.length === 0) {
      setRefreshing(false);
      setError("No new videos found");
      return;
    }

    if (isManual) {
      await setVideoMetadatas(unSeenVideoMetadatasBatch);
      await triggerVideoIndex(0, true, "fetchNewVideos");
    } else {
      const updatedVideoMetadatas = [...videoMetadatas, ...unSeenVideoMetadatasBatch];
      await setVideoMetadatas(updatedVideoMetadatas);
      await triggerVideoIndex(videoIndexExternalView, true, "fetchNewVideos");
    }

    await setVideoMetadatasCache(video_feed_type, isManual ? unSeenVideoMetadatasBatch : videoMetadatas);
    await updateSeenVideoMetadatasCache(video_feed_type, unSeenVideoMetadatasBatch);

    setRefreshing(false);
  };


  useEffect(() => {
    let retryFetch;

    if (checkedCache && videoMetadatas.length === 0 && reAttemptFetchingFeedInterval < MAX_REATTEMPT_FETCHING_FEED_INTERVAL) {
      console.log(`Retrying fetch in ${reAttemptFetchingFeedInterval}ms`);

      retryFetch = setTimeout(async () => {
        await fetchNewVideos(true);
        setreAttemptFetchingFeedInterval(Math.min(reAttemptFetchingFeedInterval * 2, MAX_REATTEMPT_FETCHING_FEED_INTERVAL));
      }, reAttemptFetchingFeedInterval);
    }

    return () => clearTimeout(retryFetch); // Cleanup function
  }, [videoMetadatas, reAttemptFetchingFeedInterval]);

  useEffect(() => {
    if (!videoError) return;

    setTemporaryWarning(videoError);

    const timeout = setTimeout(() => {
      setTemporaryWarning("");
      setVideoError("");
      setVideoMetadatas([]); // Will trigger a refetch of new feed
    }, 3000);

    return () => clearTimeout(timeout); // Cleanup function to avoid memory leaks
  }, [videoError]);

  // Set the current index
  const triggerVideoIndex = async (index, scrollList = true, caller = "none", animated = false) => {
    // Check if the list is empty
    console.log("Caller: ", caller, "index", index, videoMetadatas.length, !videoMetadatas)
    const currentVideoSlideVideoRef = videoSlideVideoRefs.current[index];
    if (currentVideoSlideVideoRef) {
      await currentVideoSlideVideoRef.setPositionAsync(0);
    }

    setVideoIndexIdealState(index);
    if (scrollList && videoMetadatas.length){
      console.log("caller", caller, "scrollList", scrollList, "index", index, "animated", animated);
      videoSlideFlatListRef.current?.scrollToIndex({index: index, animated: animated});
    }
    await setVideoIndexIdealStateCache(video_feed_type, index);
  };
  // Initialize data and load videos
  useEffect(() => {
    checkVideoCache();
    setPaused(!isFocused)
  }, [isFocused]);

  // Update global feed length for weighted distribution across feeds
  useEffect(() => {
    updateGlobalFeedLength(video_feed_type, videoMetadatas.length);
  }, [videoMetadatas.length, video_feed_type]);

  const providerHandleMutedPress = () => {
    setMuted((prev) => !prev);
  };

  const providerHandleLikePress = async () => {
    const currentLikedStatus = isLiked;
    setLiked(!currentLikedStatus);
    await calculateAndUpdateConfidenceScoreCache(video_feed_type, videoMetadatas[videoIndexExternalView].hashtags, {onLike: !currentLikedStatus});
  };

  const providerHandleBackArrowPress = async () => {
    if (videoIndexExternalView > 0) {
      const previousVideoIndex = videoIndexExternalView - 1;
      await triggerVideoIndex(previousVideoIndex, true, 'providerHandleBackArrowPress', true);
    }
  };

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50, // Item is considered viewable if 50% of it is visible
  });

  const onViewableItemsChanged = async ({viewableItems}) => {
    if (viewableItems.length > 0) {
      console.debug(viewableItems, "videoIndexExternalView", videoIndexExternalView, "videoMetadatas", videoMetadatas.length);
      const percentageSeenOfVideo = await videoSlideVideoRefs.current[videoIndexExternalView].getStatusAsync().then((status) => {
        return status.positionMillis / status.durationMillis ;
      });
      if (percentageSeenOfVideo > 0) { // Can be 0 because when video resets it goes to 0, so we'll handle this in providerHandlePlaybackStatusUpdate
        await calculateAndUpdateConfidenceScoreCache(video_feed_type, videoMetadatas[videoIndexExternalView].hashtags,
            {percentageSeenOfVideo: percentageSeenOfVideo});
      }
      setVideoIndexExternalView(viewableItems[0].index);
      await setVideoIndexIdealStateCache(video_feed_type, viewableItems[0].index);
      setMuted(video_feed_type === VideoFeedType.VIDEO_FOCUSED_FEED);
      setPaused(false);
      setLiked(false);
    }
  }

  const providerHandlePausePress = () => {
    setPaused((prev) => !prev);
  };

  const providerHandlePlaybackStatusUpdate = async ({ didJustFinish }) => {

    if (didJustFinish) {
      // Reset the video (in case we are the last video or we return to this video)
      const currentVideoSlideVideoRef = videoSlideVideoRefs.current[videoIndexExternalView];
      if (currentVideoSlideVideoRef) {
        await currentVideoSlideVideoRef.setPositionAsync(0);
      }

      await calculateAndUpdateConfidenceScoreCache(video_feed_type, videoMetadatas[videoIndexExternalView].hashtags, {percentageSeenOfVideo: 1});

      if (videoIndexExternalView < videoMetadatas.length - 1) {
        const nextIndex = videoIndexExternalView + 1;
        // Update the current video index
        await triggerVideoIndex(nextIndex, true, "providerHandlePlaybackStatusUpdate", true);
      }
    }
  }

  if (!checkedCache) {
    return (
        <View style={{justifyContent: "center", alignItems: "center", top: 150 }}>
          <ActivityIndicator size="large" color="yellow" />
          <Text style={{ marginTop: 20, color: "white" }}>Loading videos</Text>
        </View>
    );
  }

  if (videoMetadatas.length === 0) {
    return (
        <View style={{justifyContent: "center", alignItems: "center", top: 150 }}>
          <ActivityIndicator size="large" color="yellow" />
          {reAttemptFetchingFeedInterval <= MAX_REATTEMPT_FETCHING_FEED_INTERVAL && <Text style={{ marginTop: 20, color: "white" }}>Attempting to fetch videos in {reAttemptFetchingFeedInterval/1000} seconds</Text>}
          {reAttemptFetchingFeedInterval > MAX_REATTEMPT_FETCHING_FEED_INTERVAL && <Text style={{ marginTop: 20, color: "white" }}>Failed to fetch videos</Text>}
          {error && <Text style={{ color: 'red' }}>{error}</Text>}
          <TemporaryWarningBanner temporaryWarning={temporaryWarning} setTemporaryWarning={setTemporaryWarning} />
        </View>
    );
  }

  return (
      <View>
      <VideoContext.Provider value={{
        // VideoSlideController/VideoSlide information
        isMuted,
        isLiked,
        isPaused,
        isRefreshing,
        setPaused,
        providerHandleMutedPress,
        providerHandleLikePress,
        providerHandleBackArrowPress,
        providerHandlePausePress,

        // Video Error Seen
        videoError,
        setVideoError,

        // VideoSlide information
        videoIndexExternalView,
        videoMetadatas,
        providerHandlePlaybackStatusUpdate,
        videoSlideFlatListRef,
        videoSlideVideoRefs,
        viewabilityConfig,
        onViewableItemsChanged,
        fetchNewVideos,
        video_feed_type,
        providerHandleBlockUser,
      }}>
        {children}
      </VideoContext.Provider>
      <TemporaryWarningBanner temporaryWarning={temporaryWarning} setTemporaryWarning={setTemporaryWarning} />
    </View>
  );
};

VideoProvider.propTypes = {
  children: PropTypes.node, video_feed_type: PropTypes.oneOf(Object.values(VideoFeedType)),
};

export default VideoProvider;