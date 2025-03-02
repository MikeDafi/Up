import React, {useContext} from 'react';
import {Image, StyleSheet, TouchableOpacity, View} from 'react-native';
import {VideoContext} from '../atoms/contexts';

const VideoSlideController = () => {
    const {isMuted, isLiked, providerHandleMutedPress, providerHandleLikePress, providerHandleBackArrowPress} = useContext(VideoContext);

    return (
        <View style={styles.container}>
            <TouchableOpacity onPress={providerHandleLikePress} style={styles.iconContainer}>
                <Image
                    source={isLiked ? require('@assets/icons/like_video/post_like_video.png') : require('@assets/icons/like_video/pre_like_video.png')}
                    style={styles.icon}
                />
            </TouchableOpacity>
            <TouchableOpacity onPress={providerHandleBackArrowPress} style={styles.iconContainer}>
                <Image source={require('@assets/icons/back_arrow.png')} style={styles.icon}/>
            </TouchableOpacity>
            <TouchableOpacity onPress={providerHandleMutedPress} style={styles.soundContainer}>
                <Image
                    source={isMuted ? require('@assets/icons/sound/sound_off.png') : require('@assets/icons/sound/sound_on.png')}
                    style={styles.icon}
                />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '50',
        position: 'absolute',
        bottom: 0,
        right: 0,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconContainer: {
        width: 50,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    soundContainer: {
        width: 35,
        height: 35,
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