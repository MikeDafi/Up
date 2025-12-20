import React, { useContext, useEffect, useRef, useMemo, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View, TouchableWithoutFeedback, ScrollView } from 'react-native';
import { VideoContext } from '../atoms/contexts';

const windowWidth = Dimensions.get('window').width;
const BASE_WIDTH = 55; // Base width for initial padding or margins
const CHARACTER_WIDTH = 11; // Approximate width per character for text
const EXPANDED_HEIGHT = 100; // Height of the expanded view

const VideoDescriptionSlide = () => {
  const { videoMetadatas = [], videoIndexExternalView = 0 } = useContext(VideoContext);
  const slidingAnimation = useRef(new Animated.Value(0)).current;
  const [isExpanded, setIsExpanded] = useState(false); // State to toggle between expanded and sliding view

  const description = useMemo(() => {
    if (!Array.isArray(videoMetadatas) || videoMetadatas.length === 0) return '';

    const videoMetadata = videoMetadatas[videoIndexExternalView];
    if (!videoMetadata) return ''; // Prevent accessing undefined

    // Combine description with hashtags for display
    const descText = videoMetadata.description || '';
    const hashtags = videoMetadata.hashtags || [];
    const hashtagText = hashtags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ');
    
    // Return combined text, trimmed
    return [descText, hashtagText].filter(Boolean).join(' ').trim();
  }, [videoMetadatas, videoIndexExternalView]);

  useEffect(() => {
    if (!isExpanded && description.length > 0) {
      const textWidth = BASE_WIDTH + CHARACTER_WIDTH * description.length;
      const distance = textWidth + windowWidth;
      const duration = (distance / 90) * 1000; // Speed control
      slidingAnimation.setValue(windowWidth);

      const animation = Animated.loop(
          Animated.timing(slidingAnimation, {
            toValue: -textWidth,
            duration: duration,
            easing: Easing.linear,
            useNativeDriver: true,
          })
      );

      animation.start();

      return () => animation.stop();
    }
  }, [description, isExpanded]);

  if (description === '') {
    return null;
  }

  return (
      <TouchableWithoutFeedback onPress={() => setIsExpanded(!isExpanded)}>
        <View style={[styles.overflowContainer, isExpanded && styles.expandedContainer]}>
          {isExpanded ? (
              <ScrollView>
                <Text style={[styles.text, styles.expandedText]}>{description}</Text>
              </ScrollView>
          ) : (
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
          )}
        </View>
      </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  overflowContainer: {
    position: 'absolute',
    bottom: 0,
    width: windowWidth - 25, // Restricts visible area
    left: 0,
    height: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    overflow: 'hidden', // Ensures text outside this container is clipped
  },
  expandedContainer: {
    height: EXPANDED_HEIGHT, // Expanded view height
    overflow: 'scroll', // Allow scrolling in expanded view
  },
  slidingTextWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
  },
  text: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    paddingRight: 20, // Add spacing between repeated text if needed
  },
  expandedText: {
    padding: 10, // Add padding for readability in expanded view
    fontSize: 14, // Slightly smaller font in expanded view
  },
});

export default VideoDescriptionSlide;