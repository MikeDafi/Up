import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Text, View, Alert, ActivityIndicator} from 'react-native';
import PropTypes from 'prop-types';

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
  getSeenVideoMetadatasCache,
  setVideoIndexIdealStateCache,
  setVideoMetadatasCache,
  updateSeenVideoMetadatasCache,
  getUUIDCache, getHashtagConfidenceScoresCache
} from '../atoms/videoCacheStorage';
import {VideoMetadata} from '../atoms/VideoMetadata';
import {calculateAndUpdateConfidenceScoreCache} from "../atoms/confidencescores";
import TemporaryWarningBanner from "./TemporaryWarningBanner";

export const VideoContext = React.createContext();

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
  const [videoIndexIdealState, setVideoIndexIdealState] = useState(0);
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
    if (cachedCurrentVideoMetadatas) {
      const shrunkenVideoMetadatas = cachedCurrentVideoMetadatas.slice(startingVideoIndexIdealState, cachedCurrentVideoMetadatas.length);
      setVideoMetadatas(shrunkenVideoMetadatas);
      setVideoIndexIdealStateCache(video_feed_type, startingVideoIndexIdealState);
      setVideoMetadatasCache(video_feed_type, shrunkenVideoMetadatas);

      if (shrunkenVideoMetadatas.length < NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE) {
        await fetchNewVideosOnEndReached();
      }
    } else {
      await fetchNewVideosOnEndReached();
    }
    await setCheckedCache(true);
  }


  const keepUnSeenVideoMetadatas = (videoMetadatas) => {
    const seenVideoMetadatas = getSeenVideoMetadatasCache(video_feed_type);
    const seenVideoIds = seenVideoMetadatas.map((videoMetadata) => videoMetadata.videoId);
    return videoMetadatas.filter((videoMetadata) => !seenVideoIds.includes(videoMetadata.videoId));
  }

  const fetchNewVideosManually = async () => {
    setError("");
    setRefreshing(true);

    if (!lastTimeRefreshed || (new Date() - lastTimeRefreshed) > VIDEO_REFRESH_PERIOD_SECONDS) {
      setLastTimeRefreshed(new Date());
    }else{
      console.log("lastTimeRefreshed", lastTimeRefreshed);
      // wait 2 seconds before refreshing again
      setTimeout(() => {
        setRefreshing(false);
      }, 1000);
      return;
    }


    let videoMetadataBatch = [];
    try {
      const fetchFeedWithBackoff = backoff(fetchFeed, 2, 1000, 10000); // Create backoff function
      const videoRawMetadataBatch = await fetchFeedWithBackoff({
        video_feed_type: video_feed_type,
        user_id: await getUUIDCache(),
        limit: NUM_VIDEOS_TO_REQUEST,
      })

      if (typeof videoRawMetadataBatch === 'string') { // Check if error passed up from fetchFeed
        setTemporaryWarning(videoRawMetadataBatch);
        setTimeout(() => {
          setTemporaryWarning("");
        }, 3000);
      }

      if (!Array.isArray(videoRawMetadataBatch) || videoRawMetadataBatch.length === 0) {
        setError(`No more videos found in ${video_feed_type} feed`);
        setRefreshing(false);
        return;
      }
      videoMetadataBatch = videoRawMetadataBatch.map(videoRawMetadata => new VideoMetadata(videoRawMetadata));
    } catch (err) {
      console.error('Error fetching videos:', err);
      setError(err.message, error.status);
    }

    const unSeenVideoMetadatasBatch = keepUnSeenVideoMetadatas(videoMetadataBatch);
    if (unSeenVideoMetadatasBatch.length !== videoMetadataBatch.length) {
      console.warn("Some videos were already seen, removing them from the batch. videoMetadataBatch", videoMetadataBatch.length, "unSeenVideoMetadatasBatch", unSeenVideoMetadatasBatch.length);
    }

    await setVideoMetadatas(unSeenVideoMetadatasBatch);
    await triggerVideoIndex(0, true, "fetchNewVideosManually");

    // Update cache
    await setVideoMetadatasCache(video_feed_type, videoMetadatas);
    await updateSeenVideoMetadatasCache(video_feed_type, unSeenVideoMetadatasBatch);

    setRefreshing(false);
  }


  useEffect(() => {
    let retryFetch;

    if (videoMetadatas.length === 0 && reAttemptFetchingFeedInterval < MAX_REATTEMPT_FETCHING_FEED_INTERVAL) {
      console.log(`Retrying fetch in ${reAttemptFetchingFeedInterval}ms`);

      retryFetch = setTimeout(async () => {
        await fetchNewVideosManually();
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
      triggerVideoIndex(videoIndexExternalView + 1, true, "videoIndexToErrorTriggerForward");
    }, 3000);

    return () => clearTimeout(timeout); // Cleanup function to avoid memory leaks
  }, [videoError]);

  // Fetch new videos, avoiding previously seen IDs
  const fetchNewVideosOnEndReached = async (setRefreshingVariable = true) => {
    console.log("fetchNewVideosOnEndReached:: ", setRefreshingVariable, "videoMetadatas", videoMetadatas.length, "videoIndexExternalView", videoIndexExternalView);
    setError("");
    if (setRefreshingVariable) { // in the case of automatic refresh, we don't want to show the spinner
      setRefreshing(true);
    }

    let videoMetadataBatch = [];
    try {
      const fetchFeedWithBackoff = backoff(fetchFeed, 2, 1000, 10000); // Create backoff function
      const response = await fetchFeedWithBackoff({
        video_feed_type: video_feed_type,
        user_id: await getUUIDCache(),
        limit: NUM_VIDEOS_TO_REQUEST,
      });

      if (typeof response === 'string') { // Check if error passed up from fetchFeed
        setTemporaryWarning(response);
        setTimeout(() => {
          setTemporaryWarning("");
        }, 3000);
      }

      const videoRawMetadataBatch = response["video_feed"];
      if (!Array.isArray(videoRawMetadataBatch) || videoRawMetadataBatch.length === 0) {
        setError(`No more videos found in ${video_feed_type} feed`);
        setRefreshing(false);
        return;
      }

      videoMetadataBatch = videoRawMetadataBatch.map(videoRawMetadata => new VideoMetadata(videoRawMetadata));
    } catch (err) {
      console.error('Error fetching videos:', err);
      // show stack trace
      setError(err.message, error.status);
    }


    // Remove older videos to keep the list manageable
    const updatedVideoMetadatas = [...videoMetadatas, ...videoMetadataBatch];
    console.log("updatedVideoMetadatas", updatedVideoMetadatas);
    // Update state
    await setVideoMetadatas(updatedVideoMetadatas);

    await triggerVideoIndex(videoIndexExternalView, true, "fetchNewVideosOnEndReached");

    // Update cache
    await setVideoMetadatasCache(video_feed_type, updatedVideoMetadatas);
    await updateSeenVideoMetadatasCache(video_feed_type, videoMetadataBatch);

    setRefreshing(false);
  };

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

  if (videoMetadatas.length === 0) {
    return (
        <View style={{justifyContent: "center", alignItems: "center", top: 150 }}>
          <ActivityIndicator size="large" color="yellow" />
          {reAttemptFetchingFeedInterval <= MAX_REATTEMPT_FETCHING_FEED_INTERVAL && <Text style={{ marginTop: 20, color: "white" }}>Attempting to fetch videos in {reAttemptFetchingFeedInterval/1000} seconds</Text>}
          {reAttemptFetchingFeedInterval > MAX_REATTEMPT_FETCHING_FEED_INTERVAL && <Text style={{ marginTop: 20, color: "white" }}>Failed to fetch videos</Text>}
          {error && <Text style={{ color: 'red' }}>{error}</Text>}
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
        fetchNewVideosOnEndReached,
        fetchNewVideosManually,
        video_feed_type
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