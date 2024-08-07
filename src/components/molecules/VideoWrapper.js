import React from 'react';
import { View, StyleSheet } from 'react-native';

const VideoWrapper = ({ children }) => {
    return (
        <View style={styles.wrapper}>
            {children}
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        borderWidth: 2,
        flex: 1,
        borderColor: 'white', // Change this to the color you want
    },
});

export default VideoWrapper;