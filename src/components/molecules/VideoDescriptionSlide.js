import React, { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native';
import { VideoContext } from "./VideoProvider";

const VideoDescriptionSlide = () => {
  const { videoMetadatas, videoIndexExternalView } = useContext(VideoContext);
  const slidingAnimation = useRef(new Animated.Value(0)).current;

  const windowWidth = Dimensions.get('window').width;

  const getDescription = () => {
    if (videoMetadatas.length === 0) {
      return '';
    }
    return videoMetadatas[videoIndexExternalView]?.description || '';
  };
  // generate a video description
  const [textWidth, setTextWidth] = useState(0);

  // Start the sliding animation
  useEffect(() => {
    if (textWidth > 0) {
      const distance = textWidth + windowWidth; // Total distance to move
      const duration = (distance / 75) * 1000; // Convert to milliseconds
      slidingAnimation.setValue(windowWidth); // Start fully off-screen
      Animated.loop(
          Animated.timing(slidingAnimation, {
            toValue: -textWidth, // Slide off-screen to the left
            duration: duration, // Adjust speed
            easing: Easing.linear,
            useNativeDriver: true,
          })
      ).start();
    }
  }, [textWidth, windowWidth]);

  const handleTextLayout = (event) => {
    const { width } = event.nativeEvent.layout;
    setTextWidth(width); // Measure text width
  };

  if (!getDescription()) {
    return null;
  }

  return (
      <View>
        <View style={styles.overflowContainer}>
          <Animated.View
              style={[
                styles.slidingTextWrapper,
                { transform: [{ translateX: slidingAnimation }] },
              ]}
          >
            {/* Remove `numberOfLines` to avoid truncation */}
            <Text style={styles.text} onLayout={handleTextLayout}>
              {getDescription()}
            </Text>
          </Animated.View>
        </View>
      </View>
  );
};

const styles = StyleSheet.create({
  overflowContainer: {
    overflow: 'hidden',
    height: '100%',
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
    paddingRight: 20, // Add spacing between repeated text
  },
});

export default VideoDescriptionSlide;