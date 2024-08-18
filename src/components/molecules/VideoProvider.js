import React, {useState} from 'react';
import {StyleSheet} from 'react-native';
import {VideoFeedType} from '../atoms/constants';
export const VideoContext = React.createContext();

const video_focused_feed = [
    require('../../../assets/test_videos/visual_feed_1.mov'),
    {uri: 'https://gist.github.com/jsturgis/3b19447b304616f18657?permalink_comment_id=3814125#:~:text=http%3A//commondatastorage.googleapis.com/gtv%2Dvideos%2Dbucket/sample/VolkswagenGTIReview.mp4'},
    {uri: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4'},
];

const video_w_sound_feed = [
    require('../../../assets/test_videos/sound_feed_1.mov'),
    {uri: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4'},
    {uri: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'},
];


const VideoProvider = ({children, video_feed_type}) => {
    const [isMuted, setMuted] = useState(true);
    const [isLiked, setLiked] = useState(false);
    const [isPaused, setPaused] = useState(false);
    const [isBackArrowPressed, setBackArrowPressed] = useState(false);

    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    // temporary solution to get the video paths until we have a backend
    const video_paths = video_feed_type === VideoFeedType.VIDEO_FOCUSED_FEED ? video_focused_feed : video_w_sound_feed;

    const providerHandleMutedPress = () => {
        setMuted(!isMuted);
    };

    const providerHandleLikePress = () => {
        setLiked(!isLiked);
    };

    const providerHandleArrowPress = () => {
        // Define your arrow press handler here
    };

    const providerHandlePausePress = () => {
        setPaused(!isPaused);
    }

    const providerHandlePlaybackStatusUpdate = ({didJustFinish}) => {
        if (didJustFinish && currentVideoIndex < video_paths.length - 1) {
            setCurrentVideoIndex(currentVideoIndex + 1);
        }
    };

    return (
        <VideoContext.Provider value={{
            // VideoSlideController/VideoSlide information
            isMuted,
            isLiked,
            isPaused,
            providerHandleMutedPress,
            providerHandleLikePress,
            providerHandleArrowPress,
            providerHandlePausePress,

            // VideoSlide information
            currentVideoIndex,
            setCurrentVideoIndex,
            video_paths,
            providerHandlePlaybackStatusUpdate,
        }}>
            {children}
        </VideoContext.Provider>
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

export default VideoProvider;