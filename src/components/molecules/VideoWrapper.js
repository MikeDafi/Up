import React from 'react';
import {StyleSheet, View} from 'react-native';
import VideoSlide from './VideoSlide';
import VideoProvider from './VideoProvider';
import VideoSlideController from './VideoSlideController';
import VideoDescriptionSlide from './VideoDescriptionSlide';
import PropTypes from 'prop-types';
import VideoProgressBar from "./VideoProgressBar";

const VideoWrapper = ({video_feed_type}) => {

    return (
        <View style={styles.wrapper}>
            <VideoProvider video_feed_type={video_feed_type}>
                <VideoSlide/>
                <VideoDescriptionSlide/>
                <VideoProgressBar/>
                <VideoSlideController/>
            </VideoProvider>
        </View>
    );
};

VideoWrapper.propTypes = {
    video_feed_type: PropTypes.string.isRequired,
};

const styles = StyleSheet.create({
    wrapper: {
        borderBottomWidth: 2,
        flex: 1,
        borderColor: 'white', // Change this to the color you want
    },
    container: {
        flex: 1,
        backgroundColor: '#123',
    },
});

export default VideoWrapper;