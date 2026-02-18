import React, { useContext, useRef, useEffect, useCallback } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { VideoContext } from '../atoms/contexts';
import {
  COMPRESSED_S3_BUCKET,
  HEIGHT_VIDEO_W_AUDIO_VIDEO_IN_VIDEO_SLIDE,
  NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE,
  PADDING_VIDEO_W_AUDIO_FEED,
  VideoFeedType,
} from '../atoms/constants';

const windowWidth = Dimensions.get('window').width;

// Extracted component so each FlatList item can use the useVideoPlayer hook
const VideoItem = React.memo(({ item, videoStyle, index, isMuted, shouldPlay, onPlayerReady, onPlayToEnd, onError }) => {
  const source = `${COMPRESSED_S3_BUCKET}/${item.videoId}`;

  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
    p.muted = isMuted;
  });

  // Register the player instance with the parent ref array
  useEffect(() => {
    onPlayerReady?.(index, player);
    return () => onPlayerReady?.(index, null);
  }, [player, index, onPlayerReady]);

  // Sync mute state
  useEffect(() => {
    if (player) player.muted = isMuted;
  }, [player, isMuted]);

  // Sync play/pause state
  useEffect(() => {
    if (!player) return;
    if (shouldPlay) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, shouldPlay]);

  // Listen for video end
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('playToEnd', () => {
      onPlayToEnd?.();
    });
    return () => sub.remove();
  }, [player, onPlayToEnd]);

  // Listen for errors via statusChange
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('statusChange', ({ status, error: err }) => {
      if (status === 'error' && err) {
        onError?.(item.videoId, err.message);
      }
    });
    return () => sub.remove();
  }, [player, item.videoId, onError]);

  return (
    <VideoView
      player={player}
      style={videoStyle}
      contentFit="cover"
      nativeControls={false}
      allowsVideoFrameAnalysis={false}
    />
  );
});

VideoItem.displayName = 'VideoItem';

const VideoSlide = () => {
  const {
    isMuted,
    isPaused,
    isRefreshing,
    providerHandlePausePress,
    providerHandlePlayToEnd,
    videoIndexExternalView,
    videoMetadatas,
    videoSlideVideoRefs,
    videoSlideFlatListRef,
    video_feed_type,
    viewabilityConfig,
    onViewableItemsChanged,
    fetchNewVideos,
    setVideoError,
  } = useContext(VideoContext);

  const scrollViewRef = useRef(null);

  const handleScroll = useCallback((event) => {
    const currentScrollPosition = event.nativeEvent.contentOffset.y;

    // Prevent downward scrolling — snap back to top
    if (currentScrollPosition > 0) {
      scrollViewRef.current?.scrollTo({
        y: 0,
        animated: false,
      });
    }
  }, []);

  const handlePlayerReady = useCallback((index, player) => {
    videoSlideVideoRefs.current[index] = player;
  }, [videoSlideVideoRefs]);

  const handleVideoError = useCallback((videoId, error) => {
    console.error('Video playback error');

    if (typeof error === 'string' && error.includes('-1102 and domain "NSURLErrorDomain"')) {
      error = `Failed to load video ${videoId}. Video may not exist in S3 bucket.`;
    }
    setVideoError(error);
  }, [setVideoError]);

  const renderItem = ({ item, index }) => {
    const videoStyle = {
      width: windowWidth,
      height:
          video_feed_type !== VideoFeedType.VIDEO_FOCUSED_FEED
              ? HEIGHT_VIDEO_W_AUDIO_VIDEO_IN_VIDEO_SLIDE
              : '100%',
    };

    return (
        <TouchableOpacity onPress={providerHandlePausePress} style={{ flex: 1 }} activeOpacity={0.8}>
          <VideoItem
              item={item}
              index={index}
              videoStyle={videoStyle}
              isMuted={isMuted}
              shouldPlay={!isPaused && index === videoIndexExternalView}
              onPlayerReady={handlePlayerReady}
              onPlayToEnd={providerHandlePlayToEnd}
              onError={handleVideoError}
          />
        </TouchableOpacity>
    );
  };

  if (!videoMetadatas || videoMetadatas.length === 0) {
    return (
        <View style={styles.emptyContainer}>
          <Text>No videos available</Text>
        </View>
    );
  }

  return (
      <View style={styles.container}>
        {/* Refresh indicator */}
        {isRefreshing && (
          <View style={styles.refreshIndicator}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
        <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={fetchNewVideos}
                  tintColor="#fff"
                  style={{ zIndex: 10 }}
              />
            }
            onScroll={handleScroll}
            scrollEventThrottle={200}
        >
          <FlatList
              ref={videoSlideFlatListRef}
              data={videoMetadatas}
              style={
                video_feed_type === VideoFeedType.VIDEO_FOCUSED_FEED
                    ? styles.videofocusedFeedContainer
                    : styles.videowaudioFeedContainer
              }
              horizontal
              pagingEnabled
              keyExtractor={(item) => item.videoId}
              viewabilityConfig={viewabilityConfig.current}
              onViewableItemsChanged={onViewableItemsChanged}
              onEndReached={() => fetchNewVideos(false, false)}
              onEndReachedThreshold={NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE}
              showsHorizontalScrollIndicator={false}
              getItemLayout={(data, index) => ({
                length: windowWidth,
                offset: windowWidth * index,
                index,
              })}
              initialNumToRender={1}
              maxToRenderPerBatch={2}
              windowSize={5}
              renderItem={renderItem}
          />
        </ScrollView>
      </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    position: 'relative',
  },
  refreshIndicator: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  videowaudioFeedContainer: {
    paddingBottom: PADDING_VIDEO_W_AUDIO_FEED,
    height: '100%',
  },
  videofocusedFeedContainer: {
    paddingBottom: 0,
    height: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    height: '100%',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default VideoSlide;