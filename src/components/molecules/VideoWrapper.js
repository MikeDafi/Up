import React from 'react';
import {View} from 'react-native';
import VideoSlide from './VideoSlide';
import VideoProvider from './VideoProvider';
import PropTypes from 'prop-types';
import VideoBottomControllerWrapper from "./VideoBottomControllerWrapper";
import VideoUpperControllerWrapper from "./VideoUpperControllerWrapper";

const VideoWrapper = ({video_feed_type}) => {

  return (<View>
    <VideoProvider video_feed_type={video_feed_type}>
      <VideoUpperControllerWrapper/>
      <VideoSlide/>
      <VideoBottomControllerWrapper/>
    </VideoProvider>

  </View>);
};

VideoWrapper.propTypes = {
  video_feed_type: PropTypes.string.isRequired,
};

export default VideoWrapper;