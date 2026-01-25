import React, {useContext, useState} from 'react';
import {Image, StyleSheet, TouchableOpacity, View, Text} from 'react-native';
import {VideoContext} from '../atoms/contexts';
import VideoActionMenu from './VideoActionMenu';

const VideoSlideController = () => {
    const {
        isMuted,
        isLiked,
        providerHandleMutedPress,
        providerHandleLikePress,
        providerHandleBackArrowPress,
        videoMetadatas,
        videoIndexExternalView,
        providerHandleBlockUser,
    } = useContext(VideoContext);

    const [showActionMenu, setShowActionMenu] = useState(false);

    const currentVideo = videoMetadatas?.[videoIndexExternalView];
    const currentVideoId = currentVideo?.videoId;

    const handleBlockComplete = (uploaderId) => {
        if (providerHandleBlockUser) {
            providerHandleBlockUser(uploaderId);
        }
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity onPress={() => setShowActionMenu(true)} style={styles.moreContainer}>
                <Text style={styles.moreIcon}>•••</Text>
            </TouchableOpacity>
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

            <VideoActionMenu
                isVisible={showActionMenu}
                onClose={() => setShowActionMenu(false)}
                videoId={currentVideoId}
                onBlockComplete={handleBlockComplete}
            />
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
    moreContainer: {
        width: 50,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
    },
    moreIcon: {
        fontSize: 18,
        color: '#fff',
        fontWeight: 'bold',
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 3,
    },
    icon: {
        width: '100%',
        height: '100%',
        resizeMode: 'contain',
    },
});

export default VideoSlideController;
