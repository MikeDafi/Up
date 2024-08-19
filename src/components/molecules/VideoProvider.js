import React, {useContext, useState} from 'react';
import {VideoFeedType} from '../atoms/constants';
import PropTypes from 'prop-types';

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

    const {flatListRef} = useContext(VideoContext);

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
        if (flatListRef.current && currentVideoIndex > 0) {
            flatListRef.current.scrollToIndex({index: currentVideoIndex - 1, animated: true});
        }
    };

    const providerHandlePausePress = () => {
        setPaused(!isPaused);
    }

    const providerHandlePlaybackStatusUpdate = ({didJustFinish}) => {
        if (didJustFinish && currentVideoIndex < video_paths.length - 1) {
            setCurrentVideoIndex(currentVideoIndex + 1);
        }
        if (flatListRef.current) {
            flatListRef.current.scrollToIndex({index: currentVideoIndex, animated: true});
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

VideoProvider.propTypes = {
    children: PropTypes.node,
    video_feed_type: PropTypes.oneOf(Object.values(VideoFeedType)),
};

export default VideoProvider;