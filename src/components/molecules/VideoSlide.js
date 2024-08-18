import React, {useContext, useRef, useState} from 'react';
import {Button, Dimensions, FlatList, TouchableOpacity, View} from 'react-native';
import {Video} from 'expo-av';
import {VideoContext} from './VideoProvider';

const VideoSlide = ({videos}) => {
    const {
        isMuted,
        isPaused,
        isLiked,
        providerHandleMutedPress,
        providerHandleLikePress,
        providerHandleArrowPress,
        providerHandlePausePress,
        providerHandlePlaybackStatusUpdate,
        currentVideoIndex,
        setCurrentVideoIndex,
        video_paths
    } = useContext(VideoContext);
    const videoRefs = useRef([]);


    const flatListRef = useRef(null);
    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50 // Item is considered viewable if 50% of it is visible
    });

    const onViewableItemsChanged = useRef(({ viewableItems }) => {
        if (viewableItems.length > 0) {
            setCurrentVideoIndex(viewableItems[0].index);
        }
    });

    const handlePlaybackStatusUpdate = ({didJustFinish}) => {
        providerHandlePlaybackStatusUpdate({didJustFinish});
        if (flatListRef.current) {
            flatListRef.current.scrollToIndex({index: currentVideoIndex, animated: true});
        }
    }

    return (
        <View>
            <FlatList
                ref={flatListRef}
                data={video_paths}
                horizontal
                pagingEnabled
                viewabilityConfig={viewabilityConfig.current}
                onViewableItemsChanged={onViewableItemsChanged.current}
                showsHorizontalScrollIndicator={false}
                renderItem={({item, index}) => (
                    <TouchableOpacity onPress={providerHandlePausePress} style={{flex: 1}}>
                        <Video
                            ref={ref => videoRefs.current[index] = ref}
                            source={item}
                            style={{width: Dimensions.get('window').width, height: '100%'}}
                            resizeMode={Video.RESIZE_MODE_COVER}
                            isMuted={isMuted}
                            shouldPlay={!isPaused && index === currentVideoIndex}
                            useNativePlaybackControls
                            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                        />
                    </TouchableOpacity>
                )}
                keyExtractor={(item, index) => index.toString()}
            />
        </View>
    );
};

export default VideoSlide;