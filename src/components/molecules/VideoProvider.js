import React, {useEffect, useRef, useState} from 'react';
import {Text, View, ActivityIndicator, AppState} from 'react-native';
import PropTypes from 'prop-types';
import {VideoContext} from '../atoms/contexts';

import {
  MAX_REATTEMPT_FETCHING_FEED_INTERVAL, NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE,
  NUM_VIDEOS_TO_REQUEST,
  REATTEMPT_FETCHING_FEED_INTERVAL,
  VIDEO_REFRESH_PERIOD_MS,
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
import {calculateAndUpdateConfidenceScoreCache, flushConfidenceScores} from "../atoms/confidencescores";
import TemporaryWarningBanner from "./TemporaryWarningBanner";
import {getBlockedUsers} from '../atoms/moderation';

// Track video→feed assignments to prevent cross-feed duplicates
const globalVideoAssignments = {};
const MAX_GLOBAL_ASSIGNMENTS = 500;

const cleanupOldAssignments = () => {
  const assignmentKeys = Object.keys(globalVideoAssignments);
  if (assignmentKeys.length > MAX_GLOBAL_ASSIGNMENTS) {
    const toRemove = Math.floor(assignmentKeys.length * 0.25);
    assignmentKeys.slice(0, toRemove).forEach(key => delete globalVideoAssignments[key]);
  }
};

// Deterministic feed assignment via djb2 hash — consistent regardless of processing order
const getPreferredFeed = (videoId) => {
  let hash = 5381;
  for (let i = 0; i < videoId.length; i++) {
    hash = ((hash << 5) + hash + videoId.charCodeAt(i)) | 0;
  }
  return (hash & 1) === 0
    ? VideoFeedType.VIDEO_AUDIO_FEED
    : VideoFeedType.VIDEO_FOCUSED_FEED;
};

// Assigns each video to exactly one feed via hash. Caps at ceil(N/2) per feed
// to prevent starvation when the video pool is small.
const deduplicateAcrossFeeds = (newVideos, currentFeedType) => {
  cleanupOldAssignments();

  const otherFeedType = currentFeedType === VideoFeedType.VIDEO_AUDIO_FEED
    ? VideoFeedType.VIDEO_FOCUSED_FEED
    : VideoFeedType.VIDEO_AUDIO_FEED;

  const alreadyMine = [];
  const firstSeenMine = [];
  const firstSeenOther = [];

  for (const video of newVideos) {
    const existingAssignment = globalVideoAssignments[video.videoId];

    if (existingAssignment) {
      if (existingAssignment === currentFeedType) {
        alreadyMine.push(video);
      }
      continue;
    }

    if (getPreferredFeed(video.videoId) === currentFeedType) {
      firstSeenMine.push(video);
    } else {
      firstSeenOther.push(video);
    }
  }

  const totalFirstSeen = firstSeenMine.length + firstSeenOther.length;
  const maxForCurrent = Math.ceil(totalFirstSeen / 2);
  const kept = [...alreadyMine];

  const fromMine = firstSeenMine.slice(0, maxForCurrent);
  for (const video of fromMine) {
    globalVideoAssignments[video.videoId] = currentFeedType;
    kept.push(video);
  }

  for (const video of firstSeenMine.slice(maxForCurrent)) {
    globalVideoAssignments[video.videoId] = otherFeedType;
  }

  const remaining = maxForCurrent - fromMine.length;
  const fromOther = firstSeenOther.slice(0, remaining);
  for (const video of fromOther) {
    globalVideoAssignments[video.videoId] = currentFeedType;
    kept.push(video);
  }

  for (const video of firstSeenOther.slice(remaining)) {
    globalVideoAssignments[video.videoId] = otherFeedType;
  }

  return kept;
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
  const videoMetadatasRef = useRef(videoMetadatas);
  const [, setVideoIndexIdealState] = useState(0);
  const [videoError, setVideoError] = useState("");
  const [videoIndexExternalView, setVideoIndexExternalView] = useState(0);
  const videoIndexExternalViewRef = useRef(videoIndexExternalView);
  const [checkedCache, setCheckedCache] = useState(false);
  const [temporaryWarning, setTemporaryWarning] = useState("");
  const [error, setError] = useState("");
  const [reAttemptFetchingFeedInterval, setreAttemptFetchingFeedInterval] = useState(REATTEMPT_FETCHING_FEED_INTERVAL);

  useEffect(() => { videoMetadatasRef.current = videoMetadatas; }, [videoMetadatas]);
  useEffect(() => { videoIndexExternalViewRef.current = videoIndexExternalView; }, [videoIndexExternalView]);

  // Flush in-memory confidence scores to AsyncStorage when app goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        flushConfidenceScores();
      }
    });
    return () => subscription.remove();
  }, []);

  const checkVideoCache = async () => {
    if (checkedCache) {
      return;
    }
    // Parallel cache reads — both are independent AsyncStorage.getItem calls
    const [cachedCurrentVideoMetadatas, cachedIndex] = await Promise.all([
      getVideoMetadatasCache(video_feed_type),
      getVideoIndexIdealStateCache(video_feed_type),
    ]);
    const startingVideoIndexIdealState = cachedIndex + 1;
    if (cachedCurrentVideoMetadatas && cachedCurrentVideoMetadatas.length > 0) {
      const shrunkenVideoMetadatas = cachedCurrentVideoMetadatas.slice(startingVideoIndexIdealState, cachedCurrentVideoMetadatas.length);
      setVideoMetadatas(shrunkenVideoMetadatas);
      setCheckedCache(true);
      // Fire-and-forget: persist trimmed cache + fetch more if running low
      setVideoIndexIdealStateCache(video_feed_type, startingVideoIndexIdealState);
      setVideoMetadatasCache(video_feed_type, shrunkenVideoMetadatas);

      if (shrunkenVideoMetadatas.length < NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE) {
        fetchNewVideos();
      }
    } else {
      // No cache — mark checked immediately so UI transitions to retry state, then fetch
      setCheckedCache(true);
      fetchNewVideos();
    }
  }


  const filterUnseenAndUnblocked = async (candidateVideos) => {
    const [seenVideoMetadatas, blocked] = await Promise.all([
      getSeenVideoMetadatasCache(),
      getBlockedUsers(),
    ]);
    const seenVideoIds = new Set(seenVideoMetadatas.map(v => v.videoId));
    const blockedSet = new Set(blocked);
    return candidateVideos.filter(video => {
      if (seenVideoIds.has(video.videoId)) return false;
      if (blockedSet.size > 0) {
        const uploaderId = video.videoId.split('-')[0];
        if (blockedSet.has(uploaderId)) return false;
      }
      return true;
    });
  }

  const providerHandleBlockUser = async (uploaderId) => {
    const filtered = videoMetadatas.filter(video => {
      const id = video.videoId.split('-')[0];
      return id !== uploaderId;
    });
    setVideoMetadatas(filtered);
    await setVideoMetadatasCache(video_feed_type, filtered);
    
    if (videoIndexExternalView >= filtered.length) {
      await triggerVideoIndex(Math.max(0, filtered.length - 1));
    }
  }

  const providerHandleReportVideo = async (videoId) => {
    const filtered = videoMetadatas.filter(video => video.videoId !== videoId);
    setVideoMetadatas(filtered);
    await setVideoMetadatasCache(video_feed_type, filtered);
    
    if (videoIndexExternalView >= filtered.length) {
      await triggerVideoIndex(Math.max(0, filtered.length - 1));
    }
  }

  const fetchNewVideos = async (isManual = false, setRefreshingVariable = true) => {
    const currentVideoMetadatas = videoMetadatasRef.current;
    const currentVideoIndex = videoIndexExternalViewRef.current;
    setError("");

    if (setRefreshingVariable) {
      setRefreshing(true);
    }

    if (isManual) {
      if (!lastTimeRefreshed || (new Date() - lastTimeRefreshed) > VIDEO_REFRESH_PERIOD_MS) {
        setLastTimeRefreshed(new Date());
      } else {
        setTimeout(() => setRefreshing(false), 1000);
        const minutes = Math.floor((VIDEO_REFRESH_PERIOD_MS - (new Date() - lastTimeRefreshed)) / 60000);
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
      videoMetadataBatch = deduplicateAcrossFeeds(videoMetadataBatch, video_feed_type);
    } catch (err) {
      console.error("Error fetching videos:", err.message);
      setError(err.message);
    }

    let unSeenVideoMetadatasBatch = await filterUnseenAndUnblocked(videoMetadataBatch);

    if (unSeenVideoMetadatasBatch.length === 0) {
      setRefreshing(false);
      setError("No new videos found");
      return;
    }

    let videosToCache;
    if (isManual) {
      videosToCache = unSeenVideoMetadatasBatch;
      setVideoMetadatas(videosToCache);
      await triggerVideoIndex(0);
    } else {
      videosToCache = [...currentVideoMetadatas, ...unSeenVideoMetadatasBatch];
      setVideoMetadatas(videosToCache);
      await triggerVideoIndex(currentVideoIndex);
    }

    setRefreshing(false);

    // Fire-and-forget: parallel cache writes don't affect rendered state
    Promise.all([
      setVideoMetadatasCache(video_feed_type, videosToCache),
      updateSeenVideoMetadatasCache(video_feed_type, unSeenVideoMetadatasBatch),
    ]).catch(err => console.warn('Cache write failed:', err.message));
  };


  useEffect(() => {
    let retryFetch;

    if (checkedCache && videoMetadatas.length === 0 && reAttemptFetchingFeedInterval < MAX_REATTEMPT_FETCHING_FEED_INTERVAL) {
      retryFetch = setTimeout(async () => {
        await fetchNewVideos(false);
        setreAttemptFetchingFeedInterval(Math.min(reAttemptFetchingFeedInterval * 2, MAX_REATTEMPT_FETCHING_FEED_INTERVAL));
      }, reAttemptFetchingFeedInterval);
    }

    return () => clearTimeout(retryFetch);
  }, [videoMetadatas, reAttemptFetchingFeedInterval]);

  useEffect(() => {
    if (!videoError) return;

    setTemporaryWarning(videoError);

    const timeout = setTimeout(() => {
      setTemporaryWarning("");
      setVideoError("");

      // Remove only the broken video instead of wiping the entire feed
      const currentIndex = videoIndexExternalViewRef.current;
      const currentMetadatas = videoMetadatasRef.current;
      const filtered = currentMetadatas.filter((_, i) => i !== currentIndex);

      if (filtered.length > 0) {
        setVideoMetadatas(filtered);
        setVideoMetadatasCache(video_feed_type, filtered);
        const nextIndex = Math.min(currentIndex, filtered.length - 1);
        triggerVideoIndex(nextIndex);
      } else {
        // All videos are broken — clear and let the retry useEffect re-fetch
        setVideoMetadatas([]);
      }
    }, 3000);

    return () => clearTimeout(timeout);
  }, [videoError]);

  const triggerVideoIndex = async (index, scrollList = true, animated = false) => {
    const currentMetadatas = videoMetadatasRef.current;
    const currentPlayer = videoSlideVideoRefs.current[index];
    if (currentPlayer) {
      currentPlayer.currentTime = 0;
    }

    setVideoIndexIdealState(index);
    if (scrollList && currentMetadatas.length) {
      videoSlideFlatListRef.current?.scrollToIndex({index: index, animated: animated});
    }
    await setVideoIndexIdealStateCache(video_feed_type, index);
  };
  // Initialize data and load videos
  useEffect(() => {
    checkVideoCache();
  }, []);
  
  useEffect(() => {
    if (checkedCache) {
      setPaused(!isFocused);
    }
  }, [isFocused, checkedCache]);


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
      await triggerVideoIndex(previousVideoIndex, true, true);
    }
  };

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  });

  const onViewableItemsChanged = ({viewableItems}) => {
    if (viewableItems.length > 0) {
      const previousIndex = videoIndexExternalViewRef.current;
      const newIndex = viewableItems[0].index;

      // Immediate state updates — unblocks video playback transition
      setVideoIndexExternalView(newIndex);
      setMuted(video_feed_type === VideoFeedType.VIDEO_FOCUSED_FEED);
      setPaused(false);
      setLiked(false);

      // Deferred: analytics for previous video + cache write (fire-and-forget)
      const currentMetadatas = videoMetadatasRef.current;
      const previousPlayer = videoSlideVideoRefs.current[previousIndex];
      (async () => {
        try {
          if (previousPlayer && currentMetadatas[previousIndex]) {
            const percentageSeenOfVideo = previousPlayer.duration > 0
                ? previousPlayer.currentTime / previousPlayer.duration
                : 0;
            if (percentageSeenOfVideo > 0) {
              await calculateAndUpdateConfidenceScoreCache(video_feed_type, currentMetadatas[previousIndex].hashtags,
                  {percentageSeenOfVideo: percentageSeenOfVideo});
            }
          }
          await setVideoIndexIdealStateCache(video_feed_type, newIndex);
        } catch (err) {
          console.warn('Deferred viewability analytics failed:', err.message);
        }
      })();
    }
  }

  const providerHandlePausePress = () => {
    setPaused((prev) => !prev);
  };

  const providerHandlePlayToEnd = async () => {
    const currentIndex = videoIndexExternalViewRef.current;
    const currentMetadatas = videoMetadatasRef.current;
    const currentPlayer = videoSlideVideoRefs.current[currentIndex];
    if (currentPlayer) {
      currentPlayer.currentTime = 0;
    }

    if (currentMetadatas[currentIndex]) {
      await calculateAndUpdateConfidenceScoreCache(video_feed_type, currentMetadatas[currentIndex].hashtags, {percentageSeenOfVideo: 1});
    }

    if (currentIndex < currentMetadatas.length - 1) {
      const nextIndex = currentIndex + 1;
      await triggerVideoIndex(nextIndex, true, true);
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
        isMuted,
        isLiked,
        isPaused,
        isRefreshing,
        setPaused,
        providerHandleMutedPress,
        providerHandleLikePress,
        providerHandleBackArrowPress,
        providerHandlePausePress,
        videoError,
        setVideoError,
        videoIndexExternalView,
        videoMetadatas,
        providerHandlePlayToEnd,
        videoSlideFlatListRef,
        videoSlideVideoRefs,
        viewabilityConfig,
        onViewableItemsChanged,
        fetchNewVideos,
        video_feed_type,
        providerHandleBlockUser,
        providerHandleReportVideo,
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