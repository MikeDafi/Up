import React from 'react';
import VideoWrapper from '../molecules/VideoWrapper';
import {VideoFeedType} from '../atoms/constants';

const VideowAudioFeed = () => {
    return (
        <VideoWrapper video_feed_type={VideoFeedType.VIDEO_AUDIO_FEED}/>
    );
};

export default VideowAudioFeed;