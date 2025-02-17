import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, Text, View } from 'react-native';

const TemporaryWarningBanner = ({ temporaryWarning, setTemporaryWarning, timeout = 5000 }) => {
  useEffect(() => {
    if (temporaryWarning) {
      const timer = setTimeout(() => setTemporaryWarning(""), timeout); // Auto-hide after 3 seconds
      return () => clearTimeout(timer); // Cleanup on unmount
    }
  }, [temporaryWarning]);

  if (!temporaryWarning) return null; // Hide if there's no warning

  return (
      <View style={styles.bannerContainer}>
        <TouchableOpacity onPress={() => setTemporaryWarning("")} activeOpacity={0.7} style={styles.banner}>
          <Text style={styles.warningText}>{temporaryWarning}</Text>
        </TouchableOpacity>
      </View>
  );
};

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'absolute',
    top: 150,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  banner: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)', // Semi-transparent white background
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  warningText: {
    color: 'yellow',
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export default TemporaryWarningBanner;