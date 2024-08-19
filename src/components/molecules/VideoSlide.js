import React, {useContext, useRef} from 'react';
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
        setCurrentVideoIndex,
        video_paths
    } = useContext(VideoContext);
    const videoRefs = useRef([]);


    const flatListRef = useRef(null);
    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50 // Item is considered viewable if 50% of it is visible
    });

    const onViewableItemsChanged = useRef(({viewableItems}) => {
        if (viewableItems.length > 0) {
            setCurrentVideoIndex(viewableItems[0].index);
        }
    });

    return (
        <VideoContext.Provider value={{
            // ... existing values ...
            flatListRef,
        }}>
            <View>
                <FlatList
                    ref={flatListRef}
                    data={video_paths}
                    horizontal
                    pagingEnabled
                    viewabilityConfig={viewabilityConfig.current}
                    onViewableItemsChanged={onViewableItemsChanged.current}
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
                />
            </View>
        </VideoContext.Provider>
    );
};

export default VideoSlide;