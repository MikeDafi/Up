import React, {useState} from 'react';
import {Button, Image, View, Alert} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {Video} from 'expo-av';

const UploadContentPage = () => {
    const [media, setMedia] = useState(null);
    const [mediaType, setMediaType] = useState(null);

    const pickMedia = async () => {
        // Ask for permission to access the media library
        const {status} = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Cant use Media Library', 'Sorry, we need camera roll permissions to make this work!');
            return;
        }

        // Let the user pick an image or video
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.All, // Allow both images and videos
            allowsEditing: true,
            aspect: [4, 3],
            quality: 1,
        });

        if (!result.canceled) {
            setMedia(result.assets[0].uri);
            setMediaType(result.assets[0].type);
        }
    };

    return (
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
            <Button title="Pick a photo or video" onPress={pickMedia}/>

            {media && mediaType === 'image' && (
                <Image source={{uri: media}} style={{width: 200, height: 200, marginTop: 20}}/>
            )}

            {media && mediaType === 'video' && (
                <Video
                    source={{uri: media}}
                    rate={1.0}
                    volume={1.0}
                    isMuted={false}
                    resizeMode="cover"
                    shouldPlay
                    useNativeControls
                    style={{width: 300, height: 300, marginTop: 20}}
                />
            )}
        </View>
    );
}

export default UploadContentPage;