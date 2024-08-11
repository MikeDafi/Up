import React, { useState, useRef } from 'react';
import {FlatList, Dimensions, TouchableOpacity, View, Button} from 'react-native';
import { Video } from 'expo-av';

const VideoSlide = ({ videos, onEnd }) => {
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const videoRefs = useRef([]);

    const togglePause = () => {
        setIsPaused(!isPaused);
    };

    const toggleMute = () => {
        setIsMuted(!isMuted);
    };

    const handleEnd = (index) => {
        if (index === videos.length - 1) {
            onEnd();
        } else {
            setCurrentVideoIndex(index + 1);
        }
    };

    return (
        <View style={{ }}>
            <FlatList
                data={videos}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                renderItem={({ item, index }) => (
                    <TouchableOpacity onPress={togglePause} style={{ flex: 1 }}>
                        <Video
                            ref={ref => videoRefs.current[index] = ref}
                            source={{ uri: item }}
                            style={{ width: Dimensions.get('window').width, height: '100%' }}
                            resizeMode={Video.RESIZE_MODE_COVER}
                            onEnd={() => handleEnd(index)}
                            isMuted={isMuted}
                            shouldPlay={!isPaused && index === currentVideoIndex}
                            useNativePlaybackControls
                        />
                    </TouchableOpacity>
                )}
                keyExtractor={(item, index) => index.toString()}
                onMomentumScrollEnd={ev => {
                    const newIndex = Math.floor(ev.nativeEvent.contentOffset.x / Dimensions.get('window').width);
                    setCurrentVideoIndex(newIndex);
                }}
            />
            <Button title={isMuted ? "Unmute" : "Mute"} onPress={toggleMute} style={{ position: 'absolute', top: 10, right: 10 }} />
        </View>
    );
};

export default VideoSlide;