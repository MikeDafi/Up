// src/components/organisms/VideoFocusedFeed.js
import React from 'react';
import {StyleSheet} from 'react-native';
import VideoSlide from '../molecules/VideoSlide';
import VideoWrapper from '../molecules/VideoWrapper';
const videos = [
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    'https://gist.github.com/jsturgis/3b19447b304616f18657?permalink_comment_id=3814125#:~:text=http%3A//commondatastorage.googleapis.com/gtv%2Dvideos%2Dbucket/sample/VolkswagenGTIReview.mp4',
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
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