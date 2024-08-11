import React from 'react';
import { StyleSheet, View } from 'react-native';
import VideoFocusedFeed from "../components/organisms/VideoFocusedFeed";
import VideowAudioFeed from "../components/organisms/VideowAudioFeed";
import { ENV_NAME } from '@env';
console.log('ENV_NAME', ENV_NAME);

const VideosScreen = () => {
    return (
        <View style={styles.videosScreenContainer}>
            <View style={styles.videotimelinesContainer}>
                <VideoFocusedFeed/>
                <VideowAudioFeed />
            </View>
            <View style={styles.fixedHeightView}/>
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
        flexDirection: 'column',
    },
    fixedHeightView: {
        height: 50,
        backgroundColor: 'blue',
    },
});

export default VideosScreen;
