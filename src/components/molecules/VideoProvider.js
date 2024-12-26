import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Text, View, Alert} from 'react-native';
import PropTypes from 'prop-types';
import {
  NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE, NUM_VIDEOS_TO_REQUEST,
  VideoFeedType
} from '../atoms/constants';
import {fetchFeed} from '../atoms/dynamodb';
import {backoff} from '../atoms/utilities';
import { useIsFocused } from "@react-navigation/native";
import {
  getVideoIndexIdealStateCache,
  getVideoMetadatasCache,
  // getSeenVideoMetadatasCache,
  setVideoIndexIdealStateCache,
  setVideoMetadatasCache,
  updateSeenVideoMetadatasCache
} from '../atoms/videoCacheStorage';
import {VideoMetadata} from '../atoms/VideoMetadata';

export const VideoContext = React.createContext();

const VideoProvider = ({children, video_feed_type}) => {
  const isFocused = useIsFocused();
  const [isMuted, setMuted] = useState(video_feed_type !== VideoFeedType.VIDEO_FOCUSED_FEED);
  const [isLiked, setLiked] = useState(false);
  const [isPaused, setPaused] = useState(false);
  const videoSlideFlatListRef = useRef(null);
  const videoSlideVideoRefs = useRef([]);
  const [videoMetadatas, setVideoMetadatas] = useState([]);
  const [videoIndexIdealState, setVideoIndexIdealState] = useState(0);
  const [videoIndexExternalView, setVideoIndexExternalView] = useState(0);
  const [checkedCache, setCheckedCache] = useState(false);
  const [error, setError] = useState(null);

  // Initialize data from storage
  const checkVideoCache = async () => {
    window.alert("checkVideoCache");
    if (checkedCache) {
      return;
    }
    const cachedCurrentVideoMetadatas = await getVideoMetadatasCache(video_feed_type);
    window.alert("cachedCurrentVideoMetadatas", len(cachedCurrentVideoMetadatas));
    console.log("cachedCurrentVideoMetadatas", cachedCurrentVideoMetadatas);
    const cachedIndex = await getVideoIndexIdealStateCache(video_feed_type);
    const startingVideoIndexIdealState = cachedIndex + 1;
    if (cachedCurrentVideoMetadatas) {
      const shrunkenVideoMetadatas = cachedCurrentVideoMetadatas; //.slice(startingVideoIndexIdealState, cachedCurrentVideoMetadatas.length);
      console.log("shrunkenVideoMetadatas", shrunkenVideoMetadatas);
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


  // Fetch new videos, avoiding previously seen IDs
  const fetchNewVideosOnEndReached = async () => {
    console.log("fetchNewVideosOnEndReached", !checkedCache, videoIndexExternalView, videoMetadatas.length, NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE);

    setError(null);

    try {
      // const seenVideoMetadatas = await getSeenVideoMetadatasCache(video_feed_type);
      // const seenVideoIds = seenVideoMetadatas.map((videoMetadata) => videoMetadata.videoId);
      const videoRawMetadataBatch = await backoff(fetchFeed, 3, 1000, 10000)({
        video_feed_type: video_feed_type,
        // exclude_video_ids: seenVideoIds,
        limit: NUM_VIDEOS_TO_REQUEST,
      });
      const videoMetadataBatch = videoRawMetadataBatch.map(videoRawMetadata => new VideoMetadata(videoRawMetadata));


      // Remove older videos to keep the list manageable
      const updatedVideoMetadatas = [...videoMetadatas, ...videoMetadataBatch];
      console.log("updatedVideoMetadatas", updatedVideoMetadatas);
      // Update state
      await setVideoMetadatas(updatedVideoMetadatas);

      await triggerVideoIndex(videoIndexExternalView, true, "fetchNewVideosOnEndReached");

      // Update cache
      await setVideoMetadatasCache(video_feed_type, updatedVideoMetadatas);
      await updateSeenVideoMetadatasCache(video_feed_type, videoMetadataBatch);
    } catch (err) {
      console.error('Error fetching videos:', err);
      setError('Failed to load videos. Please try again later.');
    }
  };

  // Set the current index
  const triggerVideoIndex = async (index, scrollList = true, caller = "none", animated = false) => {
    // Check if the list is empty
    console.log("Caller: ", caller, "index", index, videoMetadatas.length, !videoMetadatas)
    const currentVideoSlideVideoRef = videoSlideVideoRefs.current[index];
    console.log("currentVideoSlideVideoRef", currentVideoSlideVideoRef);
    if (currentVideoSlideVideoRef) {
      await currentVideoSlideVideoRef.setPositionAsync(0);
    }

    setVideoIndexIdealState(index);
    if (scrollList && videoMetadatas.length){
      console.log("caller", caller, "scrollList", scrollList, "index", index, "animated", animated);
      // Assuming there is a list for scrollList to be called
      while (!videoSlideFlatListRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
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

  const providerHandleLikePress = () => {
    setLiked((prev) => !prev);
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

  const onViewableItemsChanged = useCallback(async ({viewableItems}) => {
    if (viewableItems.length > 0) {
      console.debug("onViewableItemsChanged viewableItems:", viewableItems);
      setVideoIndexExternalView(viewableItems[0].index);
      setVideoIndexIdealStateCache(video_feed_type, viewableItems[0].index);
      setMuted(video_feed_type !== VideoFeedType.VIDEO_FOCUSED_FEED);
      setPaused(false);
    }
  }, []);

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

      if (videoIndexExternalView < videoMetadatas.length - 1) {
        const nextIndex = videoIndexExternalView + 1;
        // Update the current video index
        await triggerVideoIndex(nextIndex, true, "providerHandlePlaybackStatusUpdate", true);
      }
    }
  }

  if (error) {
    return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: 'red' }}>{error}</Text>
        </View>
    );
  }

  if (!videoMetadatas.length) {
    return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: "red" }}>No videos you havent seen before exist</Text>
        </View>
    );
  }

  return (<VideoContext.Provider value={{
        // VideoSlideController/VideoSlide information
        isMuted,
        isLiked,
        isPaused,
        setPaused,
        providerHandleMutedPress,
        providerHandleLikePress,
        providerHandleBackArrowPress,
        providerHandlePausePress,

        // VideoSlide information
        videoIndexExternalView,
        videoMetadatas,
        providerHandlePlaybackStatusUpdate,
        videoSlideFlatListRef,
        videoSlideVideoRefs,
        viewabilityConfig,
        onViewableItemsChanged,
        fetchNewVideosOnEndReached
      }}>
        {children}
      </VideoContext.Provider>);
};

VideoProvider.propTypes = {
  children: PropTypes.node, video_feed_type: PropTypes.oneOf(Object.values(VideoFeedType)),
};

export default VideoProvider;