import React, {useContext} from 'react';
import {Dimensions, FlatList, StyleSheet, TouchableOpacity, View, ScrollView, RefreshControl} from 'react-native';
import {Video} from 'expo-av';
import {VideoContext} from './VideoProvider';
import {
  COMPRESSED_S3_BUCKET,
  HEIGHT_VIDEO_W_AUDIO_VIDEO_IN_VIDEO_SLIDE,
  NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE,
  PADDING_VIDEO_W_AUDIO_FEED,
  VideoFeedType
} from "../atoms/constants";

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
    fetchNewVideosManually
  } = useContext(VideoContext);

  return (<View>
        <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl
                refreshing={isRefreshing}
                onRefresh={fetchNewVideosManually}
                tintColor={"#fff"}
                style={{zIndex:10}}
            />}
        >
          <FlatList
              ref={videoSlideFlatListRef}
              data={videoMetadatas}
              style={video_feed_type === VideoFeedType.VIDEO_FOCUSED_FEED ? styles.videofocusedFeedContainer
                  : styles.videowaudioFeedContainer}
              horizontal
              pagingEnabled
              keyExtractor={(item, index) => `${item.videoId}-${index}`} // Stable keys to avoid re-renders
              viewabilityConfig={viewabilityConfig.current}
              onViewableItemsChanged={onViewableItemsChanged}
              onEndReached={() => fetchNewVideosOnEndReached(false)}
              onEndReachedThreshold={NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE}
              showsHorizontalScrollIndicator={false}
              getItemLayout={(data, index) => ({
                length: Dimensions.get('window').width, // Fixed width of each video
                offset: Dimensions.get('window').width * index, // Position of each item
                index,
              })}
              initialNumToRender={3} // Render only 3 videos initially
              maxToRenderPerBatch={1} // Render 2 additional videos while scrolling
              windowSize={3} // Only keep 3 viewports of items rendered
              renderItem={({item, index}) => (
                  <View>
                    <TouchableOpacity onPress={providerHandlePausePress} style={{flex: 1}}>
                      <Video
                          source={{uri: `${COMPRESSED_S3_BUCKET}/${item.videoId}`}}
                          style={{width: Dimensions.get('window').width,
                            height: video_feed_type !== VideoFeedType.VIDEO_FOCUSED_FEED
                                ? HEIGHT_VIDEO_W_AUDIO_VIDEO_IN_VIDEO_SLIDE : '100%'
                          }}
                          ref={(ref) => (videoSlideVideoRefs.current[index] = ref)}
                          resizeMode={Video.RESIZE_MODE_COVER}
                          isMuted={isMuted}
                          shouldPlay={!isPaused && index === videoIndexExternalView}
                          useNativePlaybackControls
                          downloadFirst
                          onPlaybackStatusUpdate={providerHandlePlaybackStatusUpdate}
                      />
                    </TouchableOpacity>
                  </View>)}
          />
        </ScrollView>
        {video_feed_type === VideoFeedType.VIDEO_AUDIO_FEED && (<View style={styles.overlay}/>)}
      </View>);
};

const styles = StyleSheet.create({
  videowaudioFeedContainer: {
    paddingBottom: PADDING_VIDEO_W_AUDIO_FEED, height: '100%',
  }, videofocusedFeedContainer: {
    paddingBottom: 0, height: '100%'
  }, scrollContent: {
    flexGrow: 1, height: '100%',
  }, overlay: {
    position: 'absolute', bottom: 0, height: '20%', width: '100%', backgroundColor: '#000', // Matches your desired background
  },
});

export default VideoSlide;