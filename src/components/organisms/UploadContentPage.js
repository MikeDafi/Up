import React, {useState} from 'react';
import {
  Button, Keyboard, StyleSheet, Switch, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View, Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {Video} from 'expo-av';
import Modal from 'react-native-modal';
import * as Progress from 'react-native-progress';
import {VideoMetadata} from '../atoms/VideoMetadata';
import {createVideoMetadata} from '../atoms/dynamodb';
import {getPresignedUrl, uploadVideo} from '../atoms/s3';
import {fetchGeoLocation} from '../atoms/location';
import {backoff} from "../atoms/utilities";

const UploadContentPage = () => {
  const [media, setMedia] = useState(null);
  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [muteByDefault, setMuteByDefault] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0); // Progress state
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false);



  const validateFile = (file) => {
    if (file.type !== 'video') {
      Alert.alert('Invalid file: Please select a video file.');
      return false;
    }
    if (file.fileSize > 50000000) {
      Alert.alert('Invalid file: Please select a video smaller than 50MB.');
      return false;
    }
    return true;
  };

  const getAccess = async () => {
    const {status} = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied: Camera roll access is required.');
      return false;
    }
    return true;
  };

  const addHashtag = () => {
    if (hashtags.length >= 10) {
      Alert.alert('Limit Reached: You can only add up to 10 hashtags.');
      return;
    }
    if (hashtagInput.trim() && hashtagInput.length <= 15 && !hashtags.includes(hashtagInput)) {
      setHashtags([...hashtags, hashtagInput]);
      setHashtagInput('');
    } else if (hashtagInput.length > 15) {
      Alert.alert('Too Long: Hashtags cannot exceed 15 characters.');
    }
  };

  const removeHashtag = (index) => {
    setHashtags(hashtags.filter((_, i) => i !== index));
  };

  const pickMedia = async () => {
    if (!await getAccess()) {
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos, allowsEditing: true, aspect: [1, 1], quality: 1,
    });
    if (result.canceled) {
      console.log('User cancelled video selection.');
      return;
    }
    const selectedFile = result.assets[0];
    if (!validateFile(selectedFile)) {
      return;
    }

    setMedia(selectedFile.uri);
  };

  const resetState = () => {
    setMedia(null);
    setDescription('');
    setHashtags([]);
    setHashtagInput('');
    setMuteByDefault(false);
    setProgress(0); // Reset progress
  };

  const submitMedia = async () => {
    if (!media) {
      Alert.alert('No Video Selected: Please select a video to upload.');
      return;
    }
    setIsSubmitting(true);
    setProgress(0.1); // Start progress
    try {
      const fileName = media.split('/').pop();
      const contentType = 'video/mp4';
      const presignedUrl = await backoff(getPresignedUrl, 3, 1000, 10000)(fileName, contentType);

      // Upload video to S3
      const isUploaded = await backoff(
          await uploadVideo({uri: media, type: contentType}, presignedUrl, (progressEvent) => {
            const percentage = progressEvent.loaded / progressEvent.total;
            setProgress(percentage * 0.7); // Update progress (up to 70% for S3 upload)
          }), 3, 1000, 30000);
      if (!isUploaded) {
        throw new Error('Video upload failed.');
      }
      setProgress(0.8); // After S3 upload, progress to 80%

      // Generate metadata and save to DynamoDB
      const geoLocation = await fetchGeoLocation();
      const metadata = new VideoMetadata({
        videoId: presignedUrl.split('?')[0].split('/').pop(),
        description,
        hashtags,
        muteByDefault,
        uploadedAt: new Date().toISOString(),
        city: geoLocation.city,
        region: geoLocation.region,
        country: geoLocation.country
      });

      await backoff(createVideoMetadata, 3, 1000, 15000)(metadata);
      setProgress(1.0); // Completion
      setIsSuccessModalVisible(true);
      await new Promise((r) => setTimeout(r, 1000));
      resetState();
    } catch (error) {
      console.error('Error submitting media:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
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
            <Button title="Add" onPress={addHashtag}/>
          </View>
          <View style={styles.hashtagContainer}>
            {hashtags.map((tag, index) => (<View key={index} style={styles.hashtagBox}>
                  <Text style={styles.hashtagText}>#{tag}</Text>
                  <TouchableOpacity onPress={() => removeHashtag(index)}>
                    <Text style={styles.removeButton}>x</Text>
                  </TouchableOpacity>
                </View>))}
          </View>
          <View style={styles.switchContainer}>
            <Text style={styles.switchLabel}>Mute by Default:</Text>
            <Switch value={muteByDefault} onValueChange={setMuteByDefault}/>
          </View>
          <Button title="Pick a Video" onPress={pickMedia}/>
          {media && (<Video
                  source={{uri: media}}
                  rate={1.0}
                  volume={1.0}
                  isMuted={muteByDefault}
                  resizeMode="cover"
                  shouldPlay
                  useNativeControls
                  style={styles.video}
              />)}
          <Button title="Submit" onPress={submitMedia}/>
          <Modal
              isVisible={isSubmitting}
              style={styles.progressModal} // Adjust modal to avoid tab bar overlap
          >
            <View style={styles.modal}>
              <Progress.Bar
                  progress={progress}
                  width={200}
                  color="#4caf50"
                  borderColor="#ccc"
                  unfilledColor="#f1f1f1"
              />
              <Text style={styles.modalText}>
                {progress < 1 ? 'Uploading...' : 'Upload Complete'}
              </Text>
            </View>
          </Modal>
          <Modal isVisible={isSuccessModalVisible} onBackdropPress={() => setIsSuccessModalVisible(false)}>
            <View style={styles.modal}>
              <Text style={styles.modalText}>🎉 Video Uploaded Successfully! 🎉</Text>
              <Button title="Close" onPress={() => setIsSuccessModalVisible(false)}/>
            </View>
          </Modal>
        </View>
      </TouchableWithoutFeedback>);
};

const styles = StyleSheet.create({
  container: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20,
  }, video: {
    width: 300, height: 300, marginVertical: 20,
  }, input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10, marginVertical: 10, width: '90%',
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
  }, progressModal: {
    justifyContent: 'flex-end', // Ensures the modal doesn't overlap with the tab bar
    margin: 0, // Removes modal margins
  }, modalText: {
    fontSize: 18, fontWeight: 'bold', marginTop: 20,
  },
});

export default UploadContentPage;