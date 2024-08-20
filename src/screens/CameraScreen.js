import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import MediaUploader from '../components/organisms/UploadContentPage';

const CameraScreen = () => {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Upload Photo/Video</Text>
            <MediaUploader />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
    },
});

export default CameraScreen;
