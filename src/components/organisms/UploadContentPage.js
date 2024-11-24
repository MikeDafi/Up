import React, { useState } from 'react';
import {
  Button,
  Keyboard,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import Modal from 'react-native-modal';
import { Buffer } from 'buffer';
import { S3_API_URL, VIDEO_METADATA_API_URL } from '../atoms/constants';
import { VideoMetadata } from '../atoms/VideoMetadata';
import { fetchGeoLocation } from '../atoms/utilities';

const getPresignedUrl = async (fileName, contentType) => {
  const response = await fetch(`${S3_API_URL}/getPresignedUrl?fileName=${fileName}&contentType=${contentType}`);
  const data = await response.json();
  return data.url;
};

const uploadVideo = async (file, presignedUrl) => {
  try {
    const fileContent = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binaryData = Buffer.from(fileContent, 'base64');
    const response = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: binaryData,
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to upload video: ${error}`);
    }
    return true;
  } catch (error) {
    console.error('Error uploading video:', error);
    return false;
  }
};

const createVideoMetadata = async (metadata) => {
  const response = await fetch(VIDEO_METADATA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata.toJSON()), // Use the toJSON method of VideoMetadata
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to save metadata: ${error}`);
  }
  return response.ok;
};

const UploadContentPage = () => {
  const [media, setMedia] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [muteByDefault, setMuteByDefault] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false);

  const validateFile = (file) => {
    if (file.type !== 'video') {
      alert('Invalid file: Please select a video file.');
      return false;
    }
    if (file.fileSize > 10000000) {
      alert('Invalid file: Please select a video smaller than 10MB.');
      return false;
    }
    return true;
  };

  const getAccess = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Permission Denied: Camera roll access is required.');
      return false;
    }
    return true;
  };

  const addHashtag = () => {
    if (hashtags.length >= 10) {
      alert('Limit Reached: You can only add up to 10 hashtags.');
      return;
    }
    if (hashtagInput.trim() && hashtagInput.length <= 15 && !hashtags.includes(hashtagInput)) {
      setHashtags([...hashtags, hashtagInput]);
      setHashtagInput('');
    } else if (hashtagInput.length > 15) {
      alert('Too Long: Hashtags cannot exceed 15 characters.');
    }
  };

  const removeHashtag = (index) => {
    setHashtags(hashtags.filter((_, i) => i !== index));
  };

  const pickMedia = async () => {
    if (!await getAccess()) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled) {
      console.log('User cancelled video selection.');
      return;
    }
    const selectedFile = result.assets[0];
    if (!validateFile(selectedFile)) return;

    setMedia(selectedFile.uri);
    setMediaType(selectedFile.type);
  };

  const resetState = () => {
    setMedia(null);
    setMediaType(null);
    setDescription('');
    setHashtags([]);
    setHashtagInput('');
    setMuteByDefault(false);
  };

  const getVideoDuration = async (uri) => {
    const video = new Video();
    await video.loadAsync({ uri }, { shouldPlay: false });
    return video.getDurationMillis();
  }

  const submitMedia = async () => {
    if (!media) {
      alert('No Video Selected: Please select a video to upload.');
      return;
    }
    setIsSubmitting(true);
    try {
      const fileName = media.split('/').pop();
      const videoDuration = await getVideoDuration(media);
      const contentType = 'video/mp4';
      const presignedUrl = await getPresignedUrl(fileName, contentType);
      const isUploaded = await uploadVideo({ uri: media, type: contentType }, presignedUrl);
      if (!isUploaded) throw new Error('Video upload failed.');

      const geoLocation = await fetchGeoLocation();
      const metadata = new VideoMetadata({
        title: fileName,
        description,
        hashtags,
        muteByDefault,
        videoId: presignedUrl.split('?')[0].split("/").pop(),
        duration: videoDuration,
        uploadedAt: new Date().toISOString(),
        geoLocation,
      });

      await createVideoMetadata(metadata);
      setIsSubmitting(false);
      setIsSuccessModalVisible(true);
      resetState();
    } catch (error) {
      setIsSubmitting(false);
      console.error('Error submitting media:', error);
    }
  };

  return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <TextInput
              style={styles.input}
              placeholder="Enter a description (max 30 chars)"
              value={description}
              onChangeText={(text) => setDescription(text.slice(0, 30))}
          />
          <View style={styles.hashtagInputContainer}>
            <TextInput
                style={styles.hashtagInput}
                placeholder="Add hashtags"
                value={hashtagInput}
                onChangeText={(text) => setHashtagInput(text.slice(0, 15))}
            />
            <Button title="Add" onPress={addHashtag} />
          </View>
          <View style={styles.hashtagContainer}>
            {hashtags.map((tag, index) => (
                <View key={index} style={styles.hashtagBox}>
                  <Text style={styles.hashtagText}>#{tag}</Text>
                  <TouchableOpacity onPress={() => removeHashtag(index)}>
                    <Text style={styles.removeButton}>x</Text>
                  </TouchableOpacity>
                </View>
            ))}
          </View>
          <View style={styles.switchContainer}>
            <Text style={styles.switchLabel}>Mute by Default:</Text>
            <Switch
                value={muteByDefault}
                onValueChange={setMuteByDefault}
            />
          </View>
          <Button title="Pick a Video" onPress={pickMedia} />
          {media && (
              <Video
                  source={{ uri: media }}
                  rate={1.0}
                  volume={1.0}
                  isMuted={muteByDefault}
                  resizeMode="cover"
                  shouldPlay
                  useNativeControls
                  style={styles.video}
              />
          )}
          <Button title="Submit" onPress={submitMedia} />
          <Modal isVisible={isSubmitting}>
            <View style={styles.modal}>
              <ActivityIndicator size="large" color="#0000ff" />
              <Text style={styles.modalText}>Uploading...</Text>
            </View>
          </Modal>
          <Modal isVisible={isSuccessModalVisible} onBackdropPress={() => setIsSuccessModalVisible(false)}>
            <View style={styles.modal}>
              <Text style={styles.modalText}>🎉 Video Uploaded Successfully! 🎉</Text>
              <Button title="Close" onPress={() => setIsSuccessModalVisible(false)} />
            </View>
          </Modal>
        </View>
      </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20,
  }, video: {
    width: 300, height: 300, marginVertical: 20,
  }, input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10, marginVertical: 10, width: '90%',
  }, charLimit: {
    alignSelf: 'flex-start', marginBottom: 10, color: '#666',
  }, hashtagInputContainer: {
    flexDirection: 'row', alignItems: 'center', marginVertical: 10, width: '90%',
  }, hashtagInput: {
    flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10, marginRight: 10,
  }, hashtagContainer: {
    flexDirection: 'row', flexWrap: 'wrap', marginVertical: 10, width: '90%',
  }, hashtagBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 5,
    margin: 5,
  }, hashtagText: {
    fontSize: 14, color: '#555',
  }, removeButton: {
    marginLeft: 10, color: '#ff0000', fontWeight: 'bold',
  }, switchContainer: {
    flexDirection: 'row', alignItems: 'center', marginVertical: 10,
  }, switchLabel: {
    fontSize: 16, marginRight: 10,
  }, modal: {
    backgroundColor: 'white', padding: 20, borderRadius: 10, alignItems: 'center',
  }, modalText: {
    fontSize: 18, fontWeight: 'bold', marginBottom: 20,
  },
});

export default UploadContentPage;