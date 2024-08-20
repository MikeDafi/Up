import React, {useContext} from 'react';
import {Dimensions, FlatList, TouchableOpacity, View} from 'react-native';
import {Video} from 'expo-av';
import {VideoContext} from './VideoProvider';

const VideoSlide = () => {
    const {
        isMuted,
        isPaused,
        providerHandlePausePress,
        providerHandlePlaybackStatusUpdate,
        currentVideoIndex,
        video_paths,
        videoSlideFlatListRef,
        viewabilityConfig,
        onViewableItemsChanged,
        videoRefs
    } = useContext(VideoContext);


    return (
        <View>
            <FlatList
                ref={videoSlideFlatListRef}
                data={video_paths}
                horizontal
                pagingEnabled
                viewabilityConfig={viewabilityConfig.current}
                onViewableItemsChanged={onViewableItemsChanged}
                showsHorizontalScrollIndicator={false}
                renderItem={({item, index}) => (<TouchableOpacity onPress={providerHandlePausePress} style={{flex: 1}}>
                    <Video
                        ref={ref => videoRefs.current[index] = ref}
                        source={item}
                        style={{width: Dimensions.get('window').width, height: '100%'}}
                        resizeMode={Video.RESIZE_MODE_COVER}
                        isMuted={isMuted}
                        shouldPlay={!isPaused && index === currentVideoIndex}
                        useNativePlaybackControls
                        onPlaybackStatusUpdate={providerHandlePlaybackStatusUpdate}
                    />
                </TouchableOpacity>)}
                keyExtractor={(item, index) => index.toString()}
                style={{paddingBottom: '28.5%', height: '130%'}}
            />
        </View>
    );
};

export default VideoSlide;