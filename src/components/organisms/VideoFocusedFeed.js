import React from 'react';
import VideoWrapper from '../molecules/VideoWrapper';
import {VideoFeedType} from '../atoms/constants';

const VideoFocusedFeed = () => {
    return (
        <VideoWrapper video_feed_type={VideoFeedType.VIDEO_FOCUSED_FEED}/>
    );
};

export default VideoFocusedFeed;