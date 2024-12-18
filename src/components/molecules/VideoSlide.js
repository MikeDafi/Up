import React, {useContext} from 'react';
import {Dimensions, FlatList, TouchableOpacity, View} from 'react-native';
import {Video} from 'expo-av';
import {VideoContext} from './VideoProvider';
import {COMPRESSED_S3_BUCKET, NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE} from "../atoms/constants";

const VideoSlide = () => {
    const {
        isMuted,
        isPaused,
        providerHandlePausePress,
        providerHandlePlaybackStatusUpdate,
      videoIndexExternalView,
        videoIds,
        videoIdtoRef,
        videoSlideFlatListRef,
        viewabilityConfig,
        onViewableItemsChanged,
        fetchNewVideosOnEndReached
    } = useContext(VideoContext);


    return (
        <View>
          <FlatList
              ref={videoSlideFlatListRef}
              data={videoIds}
              horizontal
              pagingEnabled
              keyExtractor={(item, index) => `${item}-${index}`} // Stable keys to avoid re-renders
              viewabilityConfig={viewabilityConfig.current}
              onViewableItemsChanged={onViewableItemsChanged}
              onEndReached={fetchNewVideosOnEndReached} // Trigger fetch on reaching the end
              onEndReachedThreshold={NUM_VIDEOS_LEFT_BEFORE_FETCHING_MORE}
              showsHorizontalScrollIndicator={false}
              getItemLayout={(data, index) => ({
                length: Dimensions.get('window').width, // Fixed width of each video
                offset: Dimensions.get('window').width * index, // Position of each item
                index,
              })}
              initialNumToRender={3} // Render only 3 videos initially
              maxToRenderPerBatch={2} // Render 2 additional videos while scrolling
              windowSize={3} // Only keep 3 viewports of items rendered
              renderItem={({ item, index }) => (
                  <TouchableOpacity onPress={providerHandlePausePress} style={{ flex: 1 }}>
                    <Video
                        ref={(ref) => (videoIdtoRef.current[item] = ref)}
                        source={{ uri: `${COMPRESSED_S3_BUCKET}/${item}` }}
                        style={{ width: Dimensions.get('window').width, height: '100%' }}
                        resizeMode={Video.RESIZE_MODE_COVER}
                        isMuted={isMuted}
                        shouldPlay={!isPaused && index === videoIndexExternalView}
                        useNativePlaybackControls
                        onPlaybackStatusUpdate={providerHandlePlaybackStatusUpdate}
                    />
                  </TouchableOpacity>
              )}
              style={{ paddingBottom: '28.5%', height: '130%' }}
          />
        </View>
    );
};

export default VideoSlide;