import React, {useContext} from 'react';
import {StyleSheet, View} from 'react-native';
import VideoProvider, {VideoContext} from './VideoProvider';
import VideoSlideController from './VideoSlideController';
import VideoDescriptionSlide from './VideoDescriptionSlide';
import VideoProgressBar from "./VideoProgressBar";
import {PADDING_BOTTOM_CONTROLLER_WRAPPER, VideoFeedType} from "../atoms/constants";

const VideoBottomControllerWrapper = () => {
  const {video_feed_type} = useContext(VideoContext);

  return (
      <View style={video_feed_type === VideoFeedType.VIDEO_FOCUSED_FEED ? styles.videofocusedFeedContainer: styles.videowaudioFeedContainer}>
          <VideoDescriptionSlide />
          <VideoProgressBar />
          <VideoSlideController />
      </View>
  );
};

const styles = StyleSheet.create({
  videowaudioFeedContainer: {
    position: 'absolute',
    bottom: PADDING_BOTTOM_CONTROLLER_WRAPPER,
    left: 0,
    right: 0,
  },
  videofocusedFeedContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },

});

export default VideoBottomControllerWrapper;