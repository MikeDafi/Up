import React, { useContext, useRef } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Video } from 'expo-av';
import { VideoContext } from './VideoProvider';
import {
  COMPRESSED_S3_BUCKET,
  HEIGHT_VIDEO_W_AUDIO_VIDEO_IN_VIDEO_SLIDE,
  NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE,
  PADDING_VIDEO_W_AUDIO_FEED,
  VideoFeedType,
} from '../atoms/constants';

const VideoSlide = () => {
  const {
    isMuted,
    isPaused,
    isRefreshing,
    providerHandlePausePress,
    providerHandlePlaybackStatusUpdate,
    videoIndexExternalView,
    videoMetadatas,
    videoSlideVideoRefs,
    videoSlideFlatListRef,
    video_feed_type,
    viewabilityConfig,
    onViewableItemsChanged,
    fetchNewVideosOnEndReached,
    fetchNewVideosManually,
  } = useContext(VideoContext);

  const scrollViewRef = useRef(null);

  const handleScroll = (event) => {
    const currentScrollPosition = event.nativeEvent.contentOffset.y;

    // Prevent upward scrolling past the top
    if (currentScrollPosition > 0) {
      scrollViewRef.current.scrollTo({
        y: 0,
        animated: false,
      });
    }
  };

  const windowWidth = Dimensions.get('window').width;

  const getOnEndThreshold = () => {
    if (!videoMetadatas || videoMetadatas.length === 0) return 0.1;
    return 1 - NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE / videoMetadatas.length;
  };

  const renderItem = ({ item, index }) => {
    const videoStyle = {
      width: windowWidth,
      height:
          video_feed_type !== VideoFeedType.VIDEO_FOCUSED_FEED
              ? HEIGHT_VIDEO_W_AUDIO_VIDEO_IN_VIDEO_SLIDE
              : '100%',
    };

    return (
        <TouchableOpacity onPress={providerHandlePausePress} style={{ flex: 1 }}>
          <Video
              source={{ uri: `${COMPRESSED_S3_BUCKET}/${item.videoId}` }}
              style={videoStyle}
              ref={(ref) => (videoSlideVideoRefs.current[index] = ref)}
              resizeMode={Video.RESIZE_MODE_COVER}
              isMuted={isMuted}
              shouldPlay={!isPaused && index === videoIndexExternalView}
              useNativePlaybackControls
              downloadFirst
              onPlaybackStatusUpdate={providerHandlePlaybackStatusUpdate}
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
        <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={fetchNewVideosManually}
                  tintColor="#fff"
                  style={{ zIndex: 10 }}
              />
            }
            onScroll={handleScroll}
            scrollEventThrottle={16} // Optimize scroll event frequency
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
              keyExtractor={(item, index) => `${item.videoId}-${index}`}
              viewabilityConfig={viewabilityConfig.current}
              onViewableItemsChanged={onViewableItemsChanged}
              onEndReached={() => fetchNewVideosOnEndReached(false)}
              onEndReachedThreshold={getOnEndThreshold()}
              showsHorizontalScrollIndicator={false}
              getItemLayout={(data, index) => ({
                length: windowWidth,
                offset: windowWidth * index,
                index,
              })}
              initialNumToRender={3}
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