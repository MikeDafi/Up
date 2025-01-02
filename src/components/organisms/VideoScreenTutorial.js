import React, { useState, useContext } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { VideoScreenContext } from '../../screens/VideosScreen';

const VideoScreenTutorial = () => {
  const { setVideoScreenTutorialEnabled, videoScreenTutorialEnabled } = useContext(VideoScreenContext);
  const [tutorialStage, setTutorialStage] = useState(1); // State to track the tutorial stage

  const handleNextStage = () => {
      setVideoScreenTutorialEnabled(false);
      setTutorialStage(1); // Reset the tutorial stage
  };

  if (!videoScreenTutorialEnabled) {
    return null;
  }

  return (
      <View style={styles.overlay}>
        {tutorialStage === 1 && (
            <>
              <View style={styles.videowaudioFeedContainer}>
                <Text style={styles.boxText}>Video w/ Audio Feed</Text>
                <Text style={styles.subText}>e.g. Music Videos, Podcasts, Interviews, News</Text>
              </View>
              <View style={styles.videofocusedFeedContainer}>
                <Text style={styles.boxText}>Video Focused Feed</Text>
                <Text style={styles.subText}>e.g. Sports Highlights, Timelapses, Art, Scenery, Gameplay</Text>
              </View>
            </>
        )}


        <TouchableOpacity style={styles.finishButtonContainer} onPress={handleNextStage}>
          <Text style={styles.finishButtonText}>
            Finish
          </Text>
        </TouchableOpacity>
      </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // Semi-transparent background
    zIndex: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videowaudioFeedContainer: {
    position: 'absolute',
    top: 0,
    left: 5,
    right: 5,
    height: '50%',
    borderWidth: 4,
    borderRadius: 10,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videofocusedFeedContainer: {
    position: 'absolute',
    top: '50%',
    left: 5,
    right: 5,
    height: '50%',
    borderWidth: 4,
    borderRadius: 10,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stageTwoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  boxText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subText: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
  },
  finishButtonContainer: {
    position: 'absolute',
    bottom: 30,
    padding: 10,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // Slightly transparent button
  },
  finishButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default VideoScreenTutorial;