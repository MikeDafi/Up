import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Text} from 'react-native';
import PropTypes from 'prop-types';
import {SEEN_VIDEOS_FETCH_FEED_THRESHOLD_PERCENTAGE, VideoFeedType} from '../atoms/constants';
import {fetchFeed} from '../atoms/dynamodb';
import {backoff} from '../atoms/utilities';
import {
  getCurrentVideoIndexCache,
  getCurrentVideoIdsCache,
  getSeenVideoIdsCache,
  setCurrentVideoIndexCache,
  setCurrentVideoIdsCache,
  updateSeenVideoIds
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
  const [currentVideoIndex, setCurrentVideoIndexState] = useState(0);
  const [loading, setLoading] = useState(false);
  const [checkedCache, setCheckedCache] = useState(false);
  const [error, setError] = useState(null);

  // Initialize data from storage
  const checkVideoCache = useCallback(async () => {

    if (checkedCache) {
      return;
    }
    const cachedIndex = await getCurrentVideoIndexCache(video_feed_type);
    await setCurrentVideoIndexState(cachedIndex);
    const cachedCurrentVideoIds = await getCurrentVideoIdsCache(video_feed_type);
    if (cachedCurrentVideoIds) {
      await setVideoIds(cachedCurrentVideoIds);
    }
    setCheckedCache(true);
  }, []);

  // Fetch new videos, avoiding previously seen IDs
  const fetchNewVideos = useCallback(async () => {
    // Fetch new videos only if we have seen a certain percentage of the videos
    console.log('currentVideoIndex:', currentVideoIndex, 'videoIds.length:', videoIds.length, VideoFeedType.VIDEO_FOCUSED_FEED);
    if (!checkedCache || (currentVideoIndex < videoIds.length * SEEN_VIDEOS_FETCH_FEED_THRESHOLD_PERCENTAGE)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const seenVideoIds = await getSeenVideoIdsCache(video_feed_type);
      const videoIdBatch = await backoff(fetchFeed, 3, 1000, 10000)({
        video_feed_type: VideoFeedType.VIDEO_FOCUSED_FEED, exclude_ids: seenVideoIds,
      });
      // keep 10 before the current video index and append the videoIdBatch
      const numVideosToRemove = Math.max(0, currentVideoIndex - 10);
      const oldNewVideoIds = [...videoIds.slice(numVideosToRemove), ...videoIdBatch];
      setVideoIds(oldNewVideoIds);
      // Update the current video index to the new index
      const newIndex = currentVideoIndex - numVideosToRemove;
      // Update the cache
      console.log("newIndex:", newIndex);
      await setCurrentVideoIdsCache(video_feed_type, oldNewVideoIds);
      // await setCurrentVideoIndex(newIndex);
      await updateSeenVideoIds(video_feed_type, videoIdBatch);
    } catch (err) {
      console.error('Error fetching videos:', err);
      setError('Failed to load videos. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [checkedCache, currentVideoIndex]);

  // Set the current index
  const setCurrentVideoIndex = async (index) => {
    setCurrentVideoIndexState(index);
    await setCurrentVideoIndexCache(video_feed_type, index);
  };

  // Initialize data and load videos
  useEffect(() => {
    const init = async () => {
      await checkVideoCache();
      await fetchNewVideos();
    };
    init();
  }, [checkVideoCache, fetchNewVideos]);
  const providerHandleMutedPress = () => {
    setMuted((prev) => !prev);
  };

  const providerHandleLikePress = () => {
    setLiked((prev) => !prev);
  };

  const providerHandleBackArrowPress = () => {
    if (currentVideoIndex > 0) {
      const previousVideoIndex = currentVideoIndex - 1;
      setCurrentVideoIndex(previousVideoIndex);
      if (videoSlideFlatListRef.current) {
        videoSlideFlatListRef.current.scrollToIndex({index: previousVideoIndex, animated: true});
      }
    }
  };

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50, // Item is considered viewable if 50% of it is visible
  });

  const onViewableItemsChanged = useCallback(async ({viewableItems}) => {
    await fetchNewVideos();
    if (viewableItems.length > 0) {
      console.log("onViewableItemsChanged viewableItems:", viewableItems);
      setCurrentVideoIndex(viewableItems[0].index);
      setMuted(video_feed_type !== VideoFeedType.VIDEO_FOCUSED_FEED);
      setPaused(false);
    }
  }, []);

  const providerHandlePausePress = () => {
    setPaused((prev) => !prev);
  };

  const providerHandlePlaybackStatusUpdate = useCallback(async ({didJustFinish}) => {
    if (didJustFinish && currentVideoIndex < videoIds.length - 1) {
      const previousVideoId = videoIds[currentVideoIndex];

      // Reset the previous video to the start position
      if (videoIdtoRef.current[previousVideoId]) {
        try {
          await videoIdtoRef.current[previousVideoId].setPositionAsync(0); // Reset video to 0
        } catch (error) {
          console.error(`Error resetting video ${previousVideoId}:`, error);
        }
      }

      videoIdtoRef.current[previousVideoId]?.setPositionAsync(0);
      const nextIndex = currentVideoIndex + 1;

      videoSlideFlatListRef.current?.scrollToIndex({index: nextIndex, animated: true});
    }
  }, []);

  if (loading) {
    return <Text>Loading videos...</Text>;
  }

  if (error) {
    return <Text>{error}</Text>;
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
        currentVideoIndex,
        setCurrentVideoIndex,
        videoIds,
        videoIdtoRef,
        providerHandlePlaybackStatusUpdate,
        videoSlideFlatListRef,
        viewabilityConfig,
        onViewableItemsChanged,
      }}>
        {children}
      </VideoContext.Provider>);
};

VideoProvider.propTypes = {
  children: PropTypes.node, video_feed_type: PropTypes.oneOf(Object.values(VideoFeedType)),
};

export default VideoProvider;