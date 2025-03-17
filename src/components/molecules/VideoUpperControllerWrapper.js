import React, {useContext} from 'react';
import {StyleSheet, View} from 'react-native';
import {VideoContext} from "../atoms/contexts";
import {VideoFeedType} from "../atoms/constants";
import TutorialButton from "./TutorialButton";

const VideoUpperControllerWrapper = () => {
  const {video_feed_type} = useContext(VideoContext);

  return (
      <View style={video_feed_type === VideoFeedType.VIDEO_FOCUSED_FEED ? styles.videofocusedFeedContainer: styles.videowaudioFeedContainer}>
        {video_feed_type === VideoFeedType.VIDEO_AUDIO_FEED && <TutorialButton/>}
      </View>
  );
};

const styles = StyleSheet.create({
  videowaudioFeedContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  videofocusedFeedContainer: {
    top: 'absolute',
    left: 0,
    right: 0,
  },

});

export default VideoUpperControllerWrapper;