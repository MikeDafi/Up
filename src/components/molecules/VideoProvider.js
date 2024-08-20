import React, {useCallback, useRef, useState} from 'react';
import {VideoFeedType} from '../atoms/constants';
import PropTypes from 'prop-types';

export const VideoContext = React.createContext();

const video_w_sound_feed = [
    require('../../../assets/test_videos/visual_feed_1.mov'),
    {uri: 'https://gist.github.com/jsturgis/3b19447b304616f18657?permalink_comment_id=3814125#:~:text=http%3A//commondatastorage.googleapis.com/gtv%2Dvideos%2Dbucket/sample/VolkswagenGTIReview.mp4'},
    {uri: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4'},
];

const video_focused_feed = [
    require('../../../assets/test_videos/sound_feed_1.mov'),
    {uri: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4'},
    {uri: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'},
];


const VideoProvider = ({children, video_feed_type}) => {
    const [isMuted, setMuted] = useState(video_feed_type === VideoFeedType.VIDEO_FOCUSED_FEED ? false : true);
    const [isLiked, setLiked] = useState(false);
    const [isPaused, setPaused] = useState(false);

    const videoSlideFlatListRef = useRef(null);

    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    // temporary solution to get the video paths until we have a backend
    const video_paths = video_feed_type === VideoFeedType.VIDEO_FOCUSED_FEED ? video_focused_feed : video_w_sound_feed;
    const videoRefs = useRef([]);


    const providerHandleMutedPress = () => {
        setMuted(!isMuted);
    };

    const providerHandleLikePress = () => {
        setLiked(!isLiked);
    };

    const providerHandleBackArrowPress = async () => {
        if (currentVideoIndex === 0) { // if we are at the first video, do nothing
            return;
        }
        const previousVideoIndex = currentVideoIndex - 1;
        setCurrentVideoIndex(previousVideoIndex);
        if (videoSlideFlatListRef.current) {
            videoSlideFlatListRef.current.scrollToIndex({index: previousVideoIndex, animated: true});
        }
    };

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50 // Item is considered viewable if 50% of it is visible
    });

    const onViewableItemsChanged = useCallback(({viewableItems}) => {
        if (viewableItems.length > 0) {
            setCurrentVideoIndex(viewableItems[0].index);
            setMuted(video_feed_type === VideoFeedType.VIDEO_FOCUSED_FEED ? false : true);
            setPaused(false);
        }
    }, [setCurrentVideoIndex]);

    const providerHandlePausePress = () => {
        setPaused(!isPaused);
    }

    const providerHandlePlaybackStatusUpdate = ({didJustFinish}) => {
        if (didJustFinish && currentVideoIndex < video_paths.length - 1) {
            const nextVideoIndex = currentVideoIndex + 1;
            setCurrentVideoIndex(nextVideoIndex);
            if (videoSlideFlatListRef.current) {
                videoSlideFlatListRef.current.scrollToIndex({index: nextVideoIndex, animated: true});
            }
            if (videoRefs.current[currentVideoIndex]) {
                videoRefs.current[currentVideoIndex].setPositionAsync(0);
            }
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
            providerHandleBackArrowPress,
            providerHandlePausePress,

            // VideoSlide information
            currentVideoIndex,
            setCurrentVideoIndex,
            video_paths,
            providerHandlePlaybackStatusUpdate,
            videoSlideFlatListRef,
            viewabilityConfig,
            onViewableItemsChanged,
            videoRefs
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