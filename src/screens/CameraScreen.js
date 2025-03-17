import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import MediaUploader from '../components/organisms/UploadContentPage';

const CameraScreen = () => {
    return (
        <View style={styles.container}>
            <MediaUploader />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginTop: 50,
    },
});

export default CameraScreen;
