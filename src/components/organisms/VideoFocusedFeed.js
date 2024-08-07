// src/components/organisms/VideoFocusedFeed.js
import React from 'react';
import {StyleSheet} from 'react-native';
import VideoSlide from '../molecules/VideoSlide';
import VideoWrapper from '../molecules/VideoWrapper';

const videos = [
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
];

const VideoFocusedFeed = () => {
    return (
        <VideoWrapper>
            <VideoSlide
                style={styles.container}
                videos={videos}
            />
        </VideoWrapper>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#123',
    },
});

export default VideoFocusedFeed;