import React, { useContext } from 'react';
import { StyleSheet, TouchableOpacity, Text, View } from 'react-native';
import { VideoScreenContext } from '../atoms/contexts';

const TutorialButton = () => {
  const {setVideoScreenTutorialEnabled } = useContext(VideoScreenContext);

  const handlePress = () => {
    setVideoScreenTutorialEnabled(true);
  };

  return (
      <View style={styles.button}>
        <TouchableOpacity onPress={handlePress} activeOpacity={0.3}>
          <Text style={styles.buttonText}>
            Tutorial
          </Text>
        </TouchableOpacity>
      </View>
  );
};

const styles = StyleSheet.create({
  button: {
    left: 10,
    zIndex:1,
    backgroundColor:"black",
    borderRadius:10,
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default TutorialButton