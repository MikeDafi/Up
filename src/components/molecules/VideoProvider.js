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

  const checkVideoCache = async () => {
    if (checkedCache) {
      return;
    }
    const cachedCurrentVideoMetadatas = await getVideoMetadatasCache(video_feed_type);
    const cachedIndex = await getVideoIndexIdealStateCache(video_feed_type);
    const startingVideoIndexIdealState = cachedIndex + 1;
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
    setCheckedCache(true);
  }


  const keepUnSeenVideoMetadatas = async (candidateVideos) => {
    const seenVideoMetadatas = await getSeenVideoMetadatasCache();
    const seenVideoIds = new Set(seenVideoMetadatas.map(v => v.videoId));
    return candidateVideos.filter(video => !seenVideoIds.has(video.videoId));
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
      if (!lastTimeRefreshed || (new Date() - lastTimeRefreshed) > VIDEO_REFRESH_PERIOD_SECONDS) {
        setLastTimeRefreshed(new Date());
      } else {
        setTimeout(() => setRefreshing(false), 1000);
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
      videoMetadataBatch = deduplicateAcrossFeeds(videoMetadataBatch, video_feed_type);
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
      setVideoMetadatas(unSeenVideoMetadatasBatch);
      await triggerVideoIndex(0);
    } else {
      const updatedVideoMetadatas = [...currentVideoMetadatas, ...unSeenVideoMetadatasBatch];
      setVideoMetadatas(updatedVideoMetadatas);
      await triggerVideoIndex(currentVideoIndex);
    }

    await setVideoMetadatasCache(video_feed_type, isManual ? unSeenVideoMetadatasBatch : currentVideoMetadatas);
    await updateSeenVideoMetadatasCache(video_feed_type, unSeenVideoMetadatasBatch);

    setRefreshing(false);
  };


  useEffect(() => {
    let retryFetch;

    if (checkedCache && videoMetadatas.length === 0 && reAttemptFetchingFeedInterval < MAX_REATTEMPT_FETCHING_FEED_INTERVAL) {
      retryFetch = setTimeout(async () => {
        await fetchNewVideos(true);
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
      setVideoMetadatas([]);
    }, 3000);

    return () => clearTimeout(timeout);
  }, [videoError]);

  const triggerVideoIndex = async (index, scrollList = true, animated = false) => {
    const currentMetadatas = videoMetadatasRef.current;
    const currentVideoSlideVideoRef = videoSlideVideoRefs.current[index];
    if (currentVideoSlideVideoRef) {
      await currentVideoSlideVideoRef.setPositionAsync(0);
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

  const onViewableItemsChanged = async ({viewableItems}) => {
    if (viewableItems.length > 0) {
      const currentIndex = videoIndexExternalViewRef.current;
      const currentMetadatas = videoMetadatasRef.current;
      const currentVideoRef = videoSlideVideoRefs.current[currentIndex];
      if (currentVideoRef && currentMetadatas[currentIndex]) {
        const status = await currentVideoRef.getStatusAsync();
        const percentageSeenOfVideo = status.durationMillis
            ? status.positionMillis / status.durationMillis
            : 0;
        if (percentageSeenOfVideo > 0) {
          await calculateAndUpdateConfidenceScoreCache(video_feed_type, currentMetadatas[currentIndex].hashtags,
              {percentageSeenOfVideo: percentageSeenOfVideo});
        }
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
      const currentIndex = videoIndexExternalViewRef.current;
      const currentMetadatas = videoMetadatasRef.current;
      const currentVideoSlideVideoRef = videoSlideVideoRefs.current[currentIndex];
      if (currentVideoSlideVideoRef) {
        await currentVideoSlideVideoRef.setPositionAsync(0);
      }

      if (currentMetadatas[currentIndex]) {
        await calculateAndUpdateConfidenceScoreCache(video_feed_type, currentMetadatas[currentIndex].hashtags, {percentageSeenOfVideo: 1});
      }

      if (currentIndex < currentMetadatas.length - 1) {
        const nextIndex = currentIndex + 1;
        await triggerVideoIndex(nextIndex, true, true);
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
        providerHandlePlaybackStatusUpdate,
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