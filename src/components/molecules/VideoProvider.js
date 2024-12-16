import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Text} from 'react-native';
import PropTypes from 'prop-types';
import {
  NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE, NUM_VIDEOS_TO_REQUEST,
  VideoFeedType
} from '../atoms/constants';
import {fetchFeed} from '../atoms/dynamodb';
import {backoff} from '../atoms/utilities';
import {
  getVideoIndexIdealStateCache,
  getCurrentVideoIdsCache,
  getSeenVideoIdsCache,
  setVideoIndexIdealStateCache,
  setVideoIdsCache,
  updateSeenVideoIdsCache
} from '../atoms/videoCacheStorage';

export const VideoContext = React.createContext();

const video_w_sound_feed = [require('../../../assets/test_videos/visual_feed_1.mov'),
  {uri: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4'},
  {uri: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4'},];

const VideoProvider = ({children, video_feed_type}) => {
  const [isMuted, setMuted] = useState(video_feed_type !== VideoFeedType.VIDEO_FOCUSED_FEED);
  const [isLiked, setLiked] = useState(false);
  const [isPaused, setPaused] = useState(false);
  const videoSlideFlatListRef = useRef(null);
  const [videoIds, setVideoIds] = useState([]);
  const videoIdtoRef = useRef({});
  const [videoIndexIdealState, setVideoIndexIdealState] = useState(0);
  const [videoIndexExternalView, setVideoIndexExternalView] = useState(0);
  const [loading, setLoading] = useState(false);
  const [checkedCache, setCheckedCache] = useState(false);
  const [error, setError] = useState(null);

  // Initialize data from storage
  const checkVideoCache = async () => {

    if (checkedCache) {
      return;
    }
    const cachedCurrentVideoIds = await getCurrentVideoIdsCache(video_feed_type);
    const cachedIndex = await getVideoIndexIdealStateCache(video_feed_type);
    console.log("cachedIndex", cachedIndex, "cachedCurrentVideoIds", cachedCurrentVideoIds.length);
    const startingVideoIndexIdealState = cachedIndex + 1;
    if (cachedCurrentVideoIds) {
      const shrunkenVideoIds = cachedCurrentVideoIds.slice(startingVideoIndexIdealState, cachedCurrentVideoIds.length);
      console.log("length", shrunkenVideoIds.length);
      await setVideoIds(shrunkenVideoIds);
      setVideoIndexIdealStateCache(video_feed_type, startingVideoIndexIdealState);
      setVideoIdsCache(video_feed_type, shrunkenVideoIds);

      if (shrunkenVideoIds.length < NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE) {
        await fetchNewVideosOnEndReached();
      }
    }
    await setCheckedCache(true);
  }


  // Fetch new videos, avoiding previously seen IDs
  const fetchNewVideosOnEndReached = async () => {
    console.log("fetchNewVideosOnEndReached", !checkedCache, videoIndexExternalView, videoIds.length, NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE);

    setError(null);

    try {
      const seenVideoIds = await getSeenVideoIdsCache(video_feed_type);
      console.log("seenVideoIds", seenVideoIds);
      const videoIdBatch = await backoff(fetchFeed, 3, 1000, 10000)({
        video_feed_type: video_feed_type,
        exclude_video_ids: seenVideoIds,
        limit: NUM_VIDEOS_TO_REQUEST,
      });

      // Remove older videos to keep the list manageable
      const updatedVideoIds = [...videoIds, ...videoIdBatch];
      console.log("updatedVideoIds", updatedVideoIds);
      // Update state
      await setVideoIds(updatedVideoIds);

      await triggerVideoIndex(videoIndexExternalView, true, "fetchNewVideosOnEndReached");

      // Update cache
      await setVideoIdsCache(video_feed_type, updatedVideoIds);
      await updateSeenVideoIdsCache(video_feed_type, videoIdBatch);
    } catch (err) {
      console.error('Error fetching videos:', err);
      setError('Failed to load videos. Please try again later.');
    }
  };

  // Set the current index
  const triggerVideoIndex = async (index, scrollList = true, caller = "none", animated = false) => {
    // Check if the list is empty
    console.log("Caller: ", caller, "index", index, videoIds.length, !videoIds)
    setVideoIndexIdealState(index);
    if (scrollList){
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
    const init = async () => {
      await checkVideoCache();
    };
    init();
  }, []);
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

  const providerHandlePlaybackStatusUpdate = useCallback(async ({ didJustFinish }) => {
    if (didJustFinish && videoIndexExternalView < videoIds.length - 1) {
      const nextIndex = videoIndexExternalView + 1;
      // Update the current video index
      await triggerVideoIndex(nextIndex, true, "providerHandlePlaybackStatusUpdate");
    }
  }, []);

  if (loading) {
    return <Text style={{ color: 'red' }}>Loading videos...</Text>;
  }

  if (error) {
    return <Text style={{ color: 'red' }}>{error}</Text>;
  }

  return (<VideoContext.Provider value={{
        // VideoSlideController/VideoSlide information
        isMuted,
        isLiked,
        isPaused,
        providerHandleMutedPress,
        providerHandleLikePress,
        providerHandleBackArrowPress,
        providerHandlePausePress,

        // VideoSlide information
        videoIndexExternalView,
        videoIds,
        videoIdtoRef,
        providerHandlePlaybackStatusUpdate,
        videoSlideFlatListRef,
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