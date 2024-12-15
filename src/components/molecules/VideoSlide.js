import React, {useContext} from 'react';
import {Dimensions, FlatList, TouchableOpacity, View} from 'react-native';
import {Video} from 'expo-av';
import {VideoContext} from './VideoProvider';
import {COMPRESSED_S3_BUCKET} from "../atoms/constants";

const VideoSlide = () => {
    const {
        isMuted,
        isPaused,
        providerHandlePausePress,
        providerHandlePlaybackStatusUpdate,
        currentVideoIndex,
        videoIds,
        videoIdtoRef,
        videoSlideFlatListRef,
        viewabilityConfig,
        onViewableItemsChanged,
    } = useContext(VideoContext);


    return (
        <View>
            <FlatList
                ref={videoSlideFlatListRef}
                data={videoIds}
                horizontal
                pagingEnabled
                viewabilityConfig={viewabilityConfig.current}
                onViewableItemsChanged={onViewableItemsChanged}
                showsHorizontalScrollIndicator={false}
                renderItem={({item, index}) => (<TouchableOpacity onPress={providerHandlePausePress} style={{flex: 1}}>
                    <Video
                        // convert item to {uri: item} for remote videos
                        ref={(ref) => videoIdtoRef.current[item] = ref}
                        source={{uri: `${COMPRESSED_S3_BUCKET}/${item}`}}
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