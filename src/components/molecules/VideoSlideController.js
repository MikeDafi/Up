import React, {useState, useContext} from 'react';
import {StyleSheet, TouchableOpacity, View, Image} from 'react-native';
import {VideoContext} from './VideoProvider';

const VideoSlideController = () => {
    const { isMuted, isLiked, providerHandleMutedPress, providerHandleLikePress, providerHandleArrowPress } = useContext(VideoContext);

    return (
        <View style={styles.container}>
            <TouchableOpacity onPress={providerHandleMutedPress} style={styles.iconContainer}>
                <Image
                    source={isMuted ? require('@assets/icons/sound/sound_on.png') : require('@assets/icons/sound/sound_off.png')}
                    style={styles.icon}
                />
            </TouchableOpacity>
            <TouchableOpacity onPress={providerHandleLikePress} style={styles.iconContainer}>
                <Image
                    source={isLiked ? require('@assets/icons/like_video/post_like_video.png') : require('@assets/icons/like_video/pre_like_video.png')}
                    style={styles.icon}
                />
            </TouchableOpacity>
            <TouchableOpacity onPress={providerHandleArrowPress} style={styles.iconContainer}>
                <Image source={require('@assets/icons/back_arrow.png')} style={styles.icon} />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '50',
        height: '100%',
        borderColor: 'red',
        borderWidth: 2,
        position: 'absolute',
        bottom: 0,
        right: 0,
        flexDirection: 'column',
    },
    iconContainer: {
        width: 50,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    icon: {
        width: '100%',
        height: '100%',
        resizeMode: 'contain',
    },
});

export default VideoSlideController;