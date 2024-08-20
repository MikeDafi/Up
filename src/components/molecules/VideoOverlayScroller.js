import React, { useEffect, useRef } from 'react';
import { View, PanResponder, Dimensions } from 'react-native';

const VideoOverlayScroller = () => {
    const panResponder = useRef(null);

    useEffect(() => {
        panResponder.current = PanResponder.create({
            onStartShouldSetPanResponder: (evt, gestureState) => Math.abs(gestureState.dx) > 5,
            onMoveShouldSetPanResponder: (evt, gestureState) => Math.abs(gestureState.dx) > 5,
            onPanResponderRelease: (evt, gestureState) => {
                const screenWidth = Dimensions.get('window').width;
                const releasedPosition = gestureState.moveX;
                console.log('releasedPosition', releasedPosition);
                if ((releasedPosition / screenWidth) * 100 <= 70) {
                    console.log('Function 1 called');
                } else {
                    console.log('Function 2 called');
                }
            },
        });
    }, []);

    return (
        <View
            style={{ position: 'absolute', width: '100%', height: '100%'}}
            {...panResponder.current?.panHandlers}
        />
    );
};

export default VideoOverlayScroller;