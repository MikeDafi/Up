import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import VideoFocusedFeed from "../components/organisms/VideoFocusedFeed";
import VideowAudioFeed from "../components/organisms/VideowAudioFeed";
import { ENV_NAME } from '@env';
import { VideoScreenContext } from '../components/atoms/contexts';
import {HEIGHT_VIDEO_W_AUDIO_FEED} from "../components/atoms/constants";
import VideoScreenTutorial from "../components/organisms/VideoScreenTutorial";
import {getAndSetVideoScreenTutorialSeenCache} from "../components/atoms/videoCacheStorage";


const VideosScreen = () => {
    const [videoScreenTutorialEnabled, setVideoScreenTutorialEnabled] = React.useState(false);

    useEffect(() => {
        const loadTutorialState = async () => {
            const seenTutorial = await getAndSetVideoScreenTutorialSeenCache();
            setVideoScreenTutorialEnabled(!seenTutorial);
        };
        loadTutorialState();
    }, []);

    return (
        <VideoScreenContext.Provider value={{
            videoScreenTutorialEnabled,
            setVideoScreenTutorialEnabled,
        }}>
            <View style={styles.videosScreenContainer}>
                <View style={styles.videotimelinesContainer}>
                    <View style={styles.videofocusedFeedContainer}>
                        <VideoFocusedFeed />
                    </View>
                    <View style={styles.videowaudioFeedContainer}>
                        <VideowAudioFeed />
                    </View>
                    <VideoScreenTutorial />
                </View>
            </View>
        </VideoScreenContext.Provider>
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
        backgroundColor:"transparent",
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