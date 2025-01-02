import React, {useState, useContext, useEffect, useRef} from "react";
import {View, StyleSheet, Dimensions, TouchableWithoutFeedback} from "react-native";
import {VideoContext} from "./VideoProvider";
import Slider from "@react-native-community/slider";
import {RIGHT_PADDING_FOR_CONTROLLERS} from "../atoms/constants";

const {width} = Dimensions.get("window");

const VideoProgressBar = () => {
  const {
    videoIndexExternalView, videoSlideVideoRefs, setPaused, isPaused,
  } = useContext(VideoContext);

  const [progress, setProgress] = useState(0); // Current playback position
  const [duration, setDuration] = useState(0); // Video duration
  const [isDragging, setIsDragging] = useState(false);

  const lastUpdateTimeRef = useRef(Date.now());

  // Update video progress periodically
  const initializeVideo = async () => {
    const currentVideoRef = videoSlideVideoRefs.current[videoIndexExternalView];
    if (!currentVideoRef) {
      setProgress(0);
      setDuration(0);
    }

    const status = await currentVideoRef.getStatusAsync();
    if (status.isLoaded) {
      setProgress(status.positionMillis); // Sync slider progress with video
      setDuration(status.durationMillis); // Sync duration
    }
  };

  // Dynamically interpolate progress as the video plays
  useEffect(() => {
    const interpolate = async () => {
      if (isPaused || isDragging) {
        return;
      } // Skip interpolation when paused or dragging

      const currentVideoRef = videoSlideVideoRefs.current[videoIndexExternalView];
      if (!currentVideoRef) {
        return;
      }

      const now = Date.now();
      const elapsedTime = now - lastUpdateTimeRef.current;
      lastUpdateTimeRef.current = now;

      const status = await currentVideoRef.getStatusAsync();
      if (status.isLoaded) {
        const videoPosition = status.positionMillis;
        const diff = Math.abs(videoPosition - progress);

        // Adjust interpolation speed based on the difference between the video position and the current progress
        const CATCHUP_TIME_SECONDS = 2000; // Time to catch up to real-time
        const newProgress = progress + (videoPosition - progress) * (diff < 500 ? 1 : (elapsedTime > 100 ? 1
            / CATCHUP_TIME_SECONDS : elapsedTime / CATCHUP_TIME_SECONDS));
        if (newProgress >= progress) {
          setProgress(newProgress); // Update slider progress
        }
        setDuration(status.durationMillis); // Sync duration
      }
    };

    const interval = setInterval(interpolate, 1); // Approx. 60 FPS
    return () => clearInterval(interval); // Cleanup on unmount
  }, [progress, isPaused, isDragging]);

  // Periodically fetch the video status
  useEffect(() => {
    initializeVideo();
  }, [videoIndexExternalView]);

  // Handle slider value change during drag
  const handleValueChange = (value) => {
    setProgress(value); // Update progress in real-time
  };

  // Handle start of dragging
  const handleSlidingStart = () => {
    setPaused(true); // Pause video
    setIsDragging(true);
  };

  // Handle end of dragging
  const handleSlidingComplete = async (value) => {
    setIsDragging(false);

    const currentVideoRef = videoSlideVideoRefs.current[videoIndexExternalView];
    if (currentVideoRef) {
      await currentVideoRef.setPositionAsync(value); // Update video position
      currentVideoRef.playAsync(); // Resume video playback
    }

    setPaused(false); // Resume video playback
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
            onValueChange={handleValueChange} // Update progress during drag
            onSlidingStart={handleSlidingStart} // Pause video during drag
            onSlidingComplete={handleSlidingComplete} // Resume video after drag
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