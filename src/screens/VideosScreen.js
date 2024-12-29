import React from 'react';
import { StyleSheet, View } from 'react-native';
import VideoFocusedFeed from "../components/organisms/VideoFocusedFeed";
import VideowAudioFeed from "../components/organisms/VideowAudioFeed";
import { ENV_NAME } from '@env';
import {HEIGHT_VIDEO_W_AUDIO_FEED} from "../components/atoms/constants";

const VideosScreen = () => {
    return (
        <View style={styles.videosScreenContainer}>
            <View style={styles.videotimelinesContainer}>
                <View style={styles.videofocusedFeedContainer}>
                    <VideoFocusedFeed />
                </View>
                <View style={styles.videowaudioFeedContainer}>
                    <VideowAudioFeed />
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    videosScreenContainer: {
        flex: 1,
        backgroundColor: 'black',
    },
    videotimelinesContainer: {
        marginTop: 50,
        flex: 1,
        position: 'relative', // Enable absolute positioning of children
    },
    videowaudioFeedContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: HEIGHT_VIDEO_W_AUDIO_FEED,
        zIndex: 1, // Ensure it's above the audio feed
    },
    videofocusedFeedContainer: {
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        height: '50%',
        zIndex: 0, // Ensure it's below the focused feed
    }
});

export default VideosScreen;