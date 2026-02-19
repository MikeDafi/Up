import React, { useContext, useEffect, useRef, useMemo, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View, TouchableWithoutFeedback, ScrollView } from 'react-native';
import { VideoContext } from '../atoms/contexts';

const windowWidth = Dimensions.get('window').width;
const BASE_WIDTH = 55; // Base width for initial padding or margins
const CHARACTER_WIDTH = 11; // Approximate width per character for text
const EXPANDED_HEIGHT = 100; // Height of the expanded view

const VideoDescriptionSlide = () => {
  const { videoMetadatas = [], videoIndexExternalView = 0, isPaused } = useContext(VideoContext);
  const slidingAnimation = useRef(new Animated.Value(windowWidth)).current;
  const [isExpanded, setIsExpanded] = useState(false);

  const activeAnimationRef = useRef(null);
  const positionRef = useRef(windowWidth);

  const description = useMemo(() => {
    if (!Array.isArray(videoMetadatas) || videoMetadatas.length === 0) return '';

    const videoMetadata = videoMetadatas[videoIndexExternalView];
    if (!videoMetadata) return '';

    return (videoMetadata.description || '').trim();
  }, [videoMetadatas, videoIndexExternalView]);

  // Continuously track the native-side position via a listener
  useEffect(() => {
    const id = slidingAnimation.addListener(({ value }) => {
      positionRef.current = value;
    });
    return () => slidingAnimation.removeListener(id);
  }, []);

  // Reset expanded state when switching videos
  useEffect(() => {
    setIsExpanded(false);
  }, [videoIndexExternalView]);

  useEffect(() => {
    // Stop any running animation and capture the exact native-side position
    if (activeAnimationRef.current) {
      activeAnimationRef.current.stop();
      activeAnimationRef.current = null;
    }
    // stopAnimation gives the precise value from the native driver
    slidingAnimation.stopAnimation((currentValue) => {
      positionRef.current = currentValue;
    });

    // No description — reset to start
    if (description.length === 0) {
      slidingAnimation.setValue(windowWidth);
      positionRef.current = windowWidth;
      return;
    }

    // When expanded or paused, freeze at the exact current position
    if (isExpanded || isPaused) {
      // positionRef was just updated by stopAnimation above
      slidingAnimation.setValue(positionRef.current);
      return;
    }

    // Playing: resume from tracked position
    const textWidth = BASE_WIDTH + CHARACTER_WIDTH * description.length;
    const totalDistance = textWidth + windowWidth;
    const totalDuration = (totalDistance / 90) * 1000;

    let startPos = positionRef.current;

    // If beyond bounds, start fresh
    if (startPos <= -textWidth || startPos >= windowWidth) {
      startPos = windowWidth;
    }

    slidingAnimation.setValue(startPos);

    const startLoop = () => {
      slidingAnimation.setValue(windowWidth);
      positionRef.current = windowWidth;
      const loop = Animated.loop(
        Animated.timing(slidingAnimation, {
          toValue: -textWidth,
          duration: totalDuration,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      activeAnimationRef.current = loop;
      loop.start();
    };

    // Resuming mid-scroll: finish this pass, then loop
    if (startPos < windowWidth - 1) {
      const remainingDistance = startPos + textWidth;
      const remainingDuration = Math.max((remainingDistance / totalDistance) * totalDuration, 50);

      const finishPass = Animated.timing(slidingAnimation, {
        toValue: -textWidth,
        duration: remainingDuration,
        easing: Easing.linear,
        useNativeDriver: true,
      });

      activeAnimationRef.current = finishPass;
      finishPass.start(({ finished }) => {
        if (finished) {
          startLoop();
        }
      });
    } else {
      startLoop();
    }

    return () => {
      if (activeAnimationRef.current) {
        activeAnimationRef.current.stop();
        activeAnimationRef.current = null;
      }
    };
  }, [description, isExpanded, isPaused]);

  if (description === '') {
    return null;
  }

  if (isExpanded) {
    return (
      <View style={[styles.overflowContainer, styles.expandedContainer]}>
        <ScrollView style={styles.expandedScroll} nestedScrollEnabled>
          <TouchableWithoutFeedback onPress={() => setIsExpanded(false)}>
            <Text style={[styles.text, styles.expandedText]}>{description}</Text>
          </TouchableWithoutFeedback>
        </ScrollView>
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={() => setIsExpanded(true)}>
      <View style={styles.overflowContainer}>
        <View style={{ width: BASE_WIDTH + CHARACTER_WIDTH * description.length }}>
          <Animated.View
              style={[
                styles.slidingTextWrapper,
                { transform: [{ translateX: slidingAnimation }] },
              ]}
          >
            <Text
                style={styles.text}
                accessible={true}
                numberOfLines={1}
                accessibilityRole="text"
                accessibilityLabel={description}
            >
              {description}
            </Text>
          </Animated.View>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  overflowContainer: {
    position: 'absolute',
    bottom: 3,
    width: windowWidth - 25, // Restricts visible area
    left: 0,
    height: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    overflow: 'hidden', // Ensures text outside this container is clipped
    zIndex: 0,
  },
  expandedContainer: {
    height: EXPANDED_HEIGHT,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  collapseBar: {
    paddingVertical: 4,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  collapseHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
  expandedScroll: {
    flex: 1,
  },
  slidingTextWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
  },
  text: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    paddingRight: 20,
  },
  expandedText: {
    fontSize: 14,
    fontWeight: '400',
    padding: 10,
    lineHeight: 20,
  },
});

export default VideoDescriptionSlide;