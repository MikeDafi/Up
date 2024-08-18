// src/components/organisms/VideoFocusedFeed.js
import React from 'react';
import {StyleSheet} from 'react-native';
import VideoWrapper from '../molecules/VideoWrapper';
import {VideoFeedType} from '../atoms/constants';

const VideoFocusedFeed = () => {
    return (
        <VideoWrapper video_feed_type={VideoFeedType.VIDEO_FOCUSED_FEED}/>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#123',
    },
});

export default VideoFocusedFeed;