import React, { useState, useContext, useEffect, useRef } from "react";
import { View, StyleSheet, Dimensions, TouchableWithoutFeedback, Image } from "react-native";
import { VideoContext } from './VideoProvider';
import Slider from "@react-native-community/slider";

const { width } = Dimensions.get("window");

const VideoProgressBar = () => {
  const {
    videoIndexExternalView,
    videoSlideVideoRefs,
    setPaused,
    isPaused, // From context to determine if the video is paused
  } = useContext(VideoContext);

  const [progress, setProgress] = useState(0); // Current playback position
  const [duration, setDuration] = useState(0); // Video duration (default to avoid division by 0)
  const [isDragging, setIsDragging] = useState(false);

  const lastProgress = useRef(0); // Store the last known progress from video status
  const lastTimestamp = useRef(0); // Store the last timestamp when progress was updated
  const playbackRate = useRef(1); // Store the playback rate (default 1.0)

  // Fetch video status periodically
  const updateProgress = async () => {
    const currentVideoRef = videoSlideVideoRefs.current[videoIndexExternalView];
    if (!currentVideoRef) {
      return
    }
    const status = await currentVideoRef.getStatusAsync();
    if (status.isLoaded) {
      if (!isDragging) {
        setProgress(status.positionMillis); // Update UI progress
      }
      setDuration(status.durationMillis); // Update video duration
      lastProgress.current = status.positionMillis; // Store last progress
      playbackRate.current = status.rate; // Store playback rate
      lastTimestamp.current = Date.now(); // Record the timestamp
    }
  };

  // Interpolate progress for finer updates
  useEffect(() => {
    const interval = setInterval(async () => {
      if (duration === 0) {
        return;
      }

      const currentVideoRef = videoSlideVideoRefs.current[videoIndexExternalView];
      if (!currentVideoRef) {
        return
      }
      const status = await currentVideoRef.getStatusAsync();
      if (!isDragging && !isPaused && status.isLoaded) { // Only interpolate if video is not paused
        const now = Date.now();
        const elapsedTime = now - lastTimestamp.current; // Time since last video status update
        const interpolatedProgress =
            lastProgress.current + elapsedTime * playbackRate.current; // Estimate progress
        setProgress(Math.min(interpolatedProgress, status.durationMillis)); // Ensure progress doesn't exceed duration
      }
    }, 16); // Update every ~16ms (approx. 60 FPS)

    return () => clearInterval(interval); // Cleanup interval on unmount
  }, [isDragging, isPaused, duration]);

  // Fetch video status every 500ms
  useEffect(() => {
    const interval = setInterval(updateProgress, 500); // Fetch video status every 500ms
    return () => clearInterval(interval); // Cleanup interval on unmount
  }, [videoIndexExternalView, isDragging]);

  // Handle slider value change in real-time
  const handleValueChange = async (value) => {
    setProgress(value);
    const currentVideoRef = videoSlideVideoRefs.current[videoIndexExternalView];
    if (currentVideoRef) {
      await currentVideoRef.setPositionAsync(value); // Update video position in real-time
    }
    setPaused(true); // Pause video during dragging
    setIsDragging(true);
  };

  // Handle slider release
  const handleSlidingComplete = () => {
    setPaused(false); // Resume video after dragging
    setIsDragging(false);
  };

  return (
      <View >
        <TouchableWithoutFeedback>
          <View style={styles.progressBarContainer}>
            <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={duration}
                value={progress}
                minimumTrackTintColor="#FFFFFF"
                maximumTrackTintColor="#CCCCCC"
                onValueChange={handleValueChange} // Update video position during drag
                onSlidingComplete={handleSlidingComplete} // Resume video after drag
            />
          </View>
        </TouchableWithoutFeedback>
      </View>
  );
};

const styles = StyleSheet.create({
  progressBarContainer: {
    position: "absolute",
    bottom: 99,
    width: width - 50,
    left: 0
  },
  slider: {
    width: "100%",
    height: 30,
  },
});

export default VideoProgressBar;