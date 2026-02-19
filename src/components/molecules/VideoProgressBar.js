import React, {useState, useContext, useEffect, useMemo} from "react";
import {View, StyleSheet, Dimensions, Text, ScrollView} from "react-native";
import {VideoContext} from "../atoms/contexts";
import Slider from "@react-native-community/slider";
import {RIGHT_PADDING_FOR_CONTROLLERS} from "../atoms/constants";

const {width} = Dimensions.get("window");
const COLLAPSED_HEIGHT = 44;
const EXPANDED_HEIGHT = COLLAPSED_HEIGHT * 5;

const VideoProgressBar = () => {
  const {
    videoIndexExternalView, videoSlideVideoRefs, setPaused, isPaused,
    videoMetadatas,
  } = useContext(VideoContext);

  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const description = useMemo(() => {
    if (!Array.isArray(videoMetadatas) || videoMetadatas.length === 0) return '';
    const meta = videoMetadatas[videoIndexExternalView];
    return meta ? (meta.description || '').trim() : '';
  }, [videoMetadatas, videoIndexExternalView]);

  // Collapse when switching videos
  useEffect(() => {
    setIsExpanded(false);
  }, [videoIndexExternalView]);

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

  // rAF polling — stops when paused or dragging
  useEffect(() => {
    let rafId;
    let lastUpdate = 0;
    let cancelled = false;

    const poll = (timestamp) => {
      if (cancelled) return;
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
    } else if (isPaused && !isDragging) {
      const currentPlayer = videoSlideVideoRefs.current[videoIndexExternalView];
      if (currentPlayer && currentPlayer.status === 'readyToPlay') {
        setProgress(currentPlayer.currentTime);
      }
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
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

  return (
    <View
      style={[
        styles.progressBarContainer,
        isExpanded && styles.progressBarExpanded,
      ]}
      pointerEvents="box-none"
    >
      {isExpanded && description.length > 0 && (
        <ScrollView style={styles.descriptionScroll} contentContainerStyle={styles.descriptionContent}>
          <Text style={styles.descriptionText}>{description}</Text>
        </ScrollView>
      )}
      <Slider
          style={styles.slider}
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
  );
};

const styles = StyleSheet.create({
  progressBarContainer: {
    position: "absolute",
    bottom: -21,
    width: width - RIGHT_PADDING_FOR_CONTROLLERS,
    left: 0,
    height: COLLAPSED_HEIGHT,
    justifyContent: 'flex-end',
  },
  progressBarExpanded: {
    height: EXPANDED_HEIGHT,
    bottom: -21 - (EXPANDED_HEIGHT - COLLAPSED_HEIGHT),
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  slider: {
    height: COLLAPSED_HEIGHT,
  },
  descriptionScroll: {
    flex: 1,
    marginTop: 8,
  },
  descriptionContent: {
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  descriptionText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
});

export default VideoProgressBar
