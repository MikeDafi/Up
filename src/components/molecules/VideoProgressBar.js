import React, {useState, useContext, useEffect} from "react";
import {View, StyleSheet, Dimensions, TouchableWithoutFeedback} from "react-native";
import {VideoContext} from "../atoms/contexts";
import Slider from "@react-native-community/slider";
import {RIGHT_PADDING_FOR_CONTROLLERS} from "../atoms/constants";

const {width} = Dimensions.get("window");

const VideoProgressBar = () => {
  const {
    videoIndexExternalView, videoSlideVideoRefs, setPaused, isPaused,
  } = useContext(VideoContext);

  const [progress, setProgress] = useState(0); // Current playback position (seconds)
  const [duration, setDuration] = useState(0); // Video duration (seconds)
  const [isDragging, setIsDragging] = useState(false);

  const initializeVideo = () => {
    const currentPlayer = videoSlideVideoRefs.current[videoIndexExternalView];
    if (!currentPlayer || currentPlayer.status !== 'readyToPlay') {
      setProgress(0);
      setDuration(0);
      return;
    }

    setProgress(currentPlayer.currentTime);
    setDuration(currentPlayer.duration);
  };

  // rAF + frame-skip: auto-stops when backgrounded, ~20 state updates/sec when playing
  useEffect(() => {
    let rafId;
    let lastUpdate = 0;

    const poll = (timestamp) => {
      if (timestamp - lastUpdate >= 50) {
        const currentPlayer = videoSlideVideoRefs.current[videoIndexExternalView];
        if (currentPlayer && currentPlayer.status === 'readyToPlay') {
          setProgress(currentPlayer.currentTime);
          setDuration(currentPlayer.duration);
        }
        lastUpdate = timestamp;
      }
      rafId = requestAnimationFrame(poll);
    };

    if (!isPaused && !isDragging) {
      rafId = requestAnimationFrame(poll);
    }

    return () => cancelAnimationFrame(rafId);
  }, [isPaused, isDragging, videoIndexExternalView]);

  useEffect(() => {
    setProgress(0);
    setDuration(0);
    initializeVideo();
  }, [videoIndexExternalView]);

  const handleValueChange = (value) => {
    setProgress(value);
  };

  const handleSlidingStart = () => {
    setPaused(true);
    setIsDragging(true);
  };

  const handleSlidingComplete = (value) => {
    setIsDragging(false);

    const currentPlayer = videoSlideVideoRefs.current[videoIndexExternalView];
    if (currentPlayer) {
      currentPlayer.currentTime = value;
      currentPlayer.play();
    }

    setPaused(false);
  };

  return (<View>
    <TouchableWithoutFeedback>
      <View style={styles.progressBarContainer}>
        <Slider
            minimumValue={0}
            maximumValue={duration}
            value={progress}
            minimumTrackTintColor="#FFFFFF"
            maximumTrackTintColor="#CCCCCC"
            onValueChange={handleValueChange}
            onSlidingStart={handleSlidingStart}
            onSlidingComplete={handleSlidingComplete}
        />
      </View>
    </TouchableWithoutFeedback>
  </View>);
};

const styles = StyleSheet.create({
  progressBarContainer: {
    position: "absolute", bottom: -18, width: width - RIGHT_PADDING_FOR_CONTROLLERS, left: 0
  }
});

export default VideoProgressBar