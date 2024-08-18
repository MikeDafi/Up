import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import VideoSlide from './VideoSlide';
import VideoProvider from './VideoProvider';
import VideoSlideController from './VideoSlideController';
import PropTypes from 'prop-types';
import { VideoFeedType } from '../atoms/constants';


const VideoWrapper = ({video_feed_type}) => {

    return (
        <View style={styles.wrapper}>
            <VideoProvider video_feed_type={video_feed_type}>
                <VideoSlide />
                <VideoSlideController />
            </VideoProvider>
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        borderWidth: 2,
        flex: 1,
        borderColor: 'white', // Change this to the color you want
    },
    container: {
        flex: 1,
        backgroundColor: '#123',
    },
});

export default VideoWrapper;