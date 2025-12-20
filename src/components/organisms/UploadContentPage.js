import React, {useCallback, useState} from 'react';
import {
  Keyboard,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  Alert,
  Dimensions,
  ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {Video} from 'expo-av';
import Modal from 'react-native-modal';
import {VideoMetadata} from '../atoms/VideoMetadata';
import {createVideoMetadata} from '../atoms/dynamodb';
import {getPresignedUrl, uploadVideo} from '../atoms/s3';
import {fetchGeoLocation} from '../atoms/location';
import {MAX_DESCRIPTION_CHARACTERS} from "../atoms/constants";
import {backoff} from "../atoms/utilities";

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SCREEN_WIDTH = Dimensions.get('window').width;

const ErrorType = {
  NO_VIDEO: 'Please select a video before submitting.',
  NO_DESCRIPTION: 'Description is required.',
  NOT_ENOUGH_HASHTAGS: 'At least 3 hashtags are required.',
  TOO_MANY_HASHTAGS: 'Maximum 10 hashtags allowed.',
  HASHTAG_TOO_LONG: 'Hashtags should be less than 15 characters.',
  HASHTAG_DUPLICATE: 'Duplicate hashtags are not allowed.',
  HASHTAG_EMPTY: 'Hashtag cannot be empty.',
  NONE: '',
};

const UploadContentPage = () => {
  const [media, setMedia] = useState(null);
  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [muteByDefault, setMuteByDefault] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [error, setError] = useState('');
  const [isFaqVisible, setIsFaqVisible] = useState(false);
  const [shouldPlay, setShouldPlay] = useState(false); // Allow video to play

  const validateFields = () => {
    if (!media) {
      setError(ErrorType.NO_VIDEO);
      return false;
    }
    if (description.trim().length === 0) {
      setError(ErrorType.NO_DESCRIPTION);
      return false;
    }
    if (hashtags.length < 3) {
      setError(ErrorType.NOT_ENOUGH_HASHTAGS);
      return false;
    }
    setError(ErrorType.NONE);
    return true;
  };

  const getAccess = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied: Camera roll access is required.');
      return false;
    }
    return true;
  };

  const pickMedia = async () => {
    if (!(await getAccess())) return;

    setIsLoadingVideo(true);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      aspect: [1, 1], // Enable cropping (Only works for images)
      quality: 1,
    });

    setIsLoadingVideo(false);
    if (result.canceled) {
      console.log('User cancelled video selection.');
      return;
    }

    setMedia(result.assets[0].uri);
    setError(ErrorType.NONE); // Remove error once video is uploaded
  };

  const removeMedia = () => {
    setMedia(null);
    setShouldPlay(false);
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
    if (!validateFields()) {
      return;
    }

    setIsSubmitting(true);
    setProgress(0.2);
    try {
      const fileName = media.split('/').pop();
      const contentType = 'video/mp4';
      const presignedUrl = await backoff(getPresignedUrl, 2, 1000, 10000)(fileName, contentType);

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

      await backoff(createVideoMetadata, 2, 1000, 15000)(metadata);
      setProgress(1.0); // Completion
      await new Promise((r) => setTimeout(r, 1000));
      resetState();
    } catch (error) {
      console.error('Error submitting media:', error);
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setProgress(0), 1000); // Reset progress after 1 second
    }
  };

  const toggleFaqModal = useCallback(() => {
    setIsFaqVisible((prev) => !prev);
  }, []);


  const addDescription = (text) => {
    const trimmedText = text.trim();
    if (trimmedText.length > MAX_DESCRIPTION_CHARACTERS) setError(ErrorType.DESCRIPTION_TOO_LONG);
    else {
      setDescription(trimmedText);
      setError(ErrorType.NONE);
      return;
    }
    Keyboard.dismiss();
  }

  const removeHashtag = (index) => {
    const updatedHashtags = hashtags.filter((_, i) => i !== index);
    setHashtags(updatedHashtags);
  };

  const addHashtag = () => {
    const trimmedInput = hashtagInput.trim();

    if (hashtags.length >= 10) setError(ErrorType.TOO_MANY_HASHTAGS);
    else if (trimmedInput === '') setError(ErrorType.HASHTAG_EMPTY);
    else if (trimmedInput.length > 15) setError(ErrorType.HASHTAG_TOO_LONG);
    else if (hashtags.includes(trimmedInput)) setError(ErrorType.HASHTAG_DUPLICATE);
    else {
      setHashtags([...hashtags, trimmedInput]);
      setHashtagInput('');
      if (hashtags.length + 1 >= 3) setError(ErrorType.NONE); // Clear error if 3+ hashtags
      return;
    }

    Keyboard.dismiss();
  };

  return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.faqIcon} onPress={toggleFaqModal}>
            <Text style={styles.faqText}>❓</Text>
          </TouchableOpacity>
          <Text style={styles.header}>Upload Photo/Video</Text>

          <TextInput
              style={styles.input}
              placeholder="Enter a description"
              placeholderTextColor="#aaa"
              value={description}
              onChangeText={addDescription}
          />

          <View style={styles.hashtagInputContainer}>
            <TextInput
                style={styles.hashtagInput}
                placeholder="Add hashtags"
                placeholderTextColor="#aaa"
                value={hashtagInput}
                onChangeText={setHashtagInput}
            />
            <TouchableOpacity style={styles.addButton} onPress={addHashtag}>
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.hashtagContainer}>
            {hashtags.map((tag, index) => (
                <View key={index} style={styles.hashtagBox}>
                  <TouchableOpacity onPress={() => removeHashtag(index)} style={styles.removeHashtagButton}>
                    <Text style={styles.removeHashtagText}>✖</Text>
                  </TouchableOpacity>
                  <Text style={styles.hashtagText}>#{tag}</Text>
                </View>
            ))}
          </View>

          <View style={styles.switchContainer}>
            <Text style={styles.switchLabel}>Mute by Default:</Text>
            <Switch value={muteByDefault} onValueChange={setMuteByDefault} />
          </View>

          {/* Dashed Upload Box - Only Show if No Video is Selected */}
          {!media && !isLoadingVideo && (
              <TouchableOpacity style={styles.uploadBox} onPress={pickMedia}>
                <Text style={styles.uploadIcon}>⬆</Text>
                <Text style={styles.uploadText}>Pick a Video</Text>
              </TouchableOpacity>
          )}

          {/* Loader while video is being picked */}
          {isLoadingVideo && <ActivityIndicator size="large" color="#fff" />}

          {/* Video Preview (Takes Remaining Space) */}
          {media ? (
              <View style={styles.videoContainer}>
                <Video
                    source={{ uri: media }}
                    resizeMode="cover"
                    isMuted={muteByDefault}
                    shouldPlay={shouldPlay}
                    useNativeControls
                    style={styles.video}
                />
                {/* Remove Video Button */}
                <View style={styles.buttonContainer}>
                  <TouchableOpacity style={styles.removeButton} onPress={removeMedia}>
                    <Text style={styles.removeButtonText}>❌ Remove</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.submitButton} onPress={submitMedia}>
                    <Text style={styles.submitButtonText}>✅ Submit</Text>
                  </TouchableOpacity>
                </View>
                {error.length > 0 && <Text style={styles.errorText}>{error}</Text>}
              </View>
          ) :
            <>
              {/* Submit Button */}
              <TouchableOpacity style={styles.submitButton} onPress={submitMedia}>
                <Text style={styles.submitButtonText}>✅ Submit</Text>
              </TouchableOpacity>

              {error.length > 0 && <Text style={styles.errorText}>{error}</Text>}
            </>
          }

          {/* FAQ Modal */}
          {isFaqVisible && (
              <Modal isVisible={isFaqVisible} onBackdropPress={() => setIsFaqVisible(false)}>
                <View style={styles.faqModal}>
                  <Text style={styles.faqTitle}>Frequently Asked Questions</Text>
                  <Text style={styles.faqItem}>Q: How do I upload a video?</Text>
                  <Text style={styles.faqAnswer}>A: Click on &quot;Pick a Video&quot; and select a file from your device.</Text>

                  <Text style={styles.faqItem}>Q: What happens if I mute the video?</Text>
                  <Text style={styles.faqAnswer}>A: The video will play without sound by default.</Text>

                  <TouchableOpacity style={styles.closeFaqButton} onPress={() => setIsFaqVisible(false)}>
                    <Text style={styles.closeFaqText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </Modal>
          )}
          {isSubmitting && (
              <View style={styles.uploadOverlay}>
                <Text style={styles.uploadProgressTest}>
                  {progress < 0.7 ? "Uploading Video..." : progress < 0.8 ? "Processing Metadata..." : "Completed! 🎉"}
                </Text>
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
                </View>
              </View>
          )}
        </View>
      </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  header: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: '#444',
    backgroundColor: '#222',
    color: '#fff',
    borderRadius: 8,
    padding: 10,
    marginVertical: 10,
    width: '90%',
  },
  hashtagInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '90%',
  },
  removeHashtagButton: {
    backgroundColor: '#ff4444',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeHashtagText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: 'bold',
  },
  hashtagInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#444',
    backgroundColor: '#222',
    color: '#fff',
    borderRadius: 8,
    padding: 10,
    marginRight: 10,
  },
  addButton: {
    padding: 8,
    backgroundColor: '#333',
    borderRadius: 5,
  },
  addButtonText: {
    color: '#fff',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 15,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '60%',
    marginTop: 10,
  },
  switchLabel: {
    color: '#fff',
    marginRight: 10,
  },
  uploadBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#fff',
    backgroundColor: '#222',
    borderRadius: 10,
    padding: 30,
    alignItems: 'center',
    width: '90%',
    marginTop: 20,
  },
  uploadIcon: {
    fontSize: 30,
    color: '#fff',
  },
  uploadText: {
    color: '#fff',
    marginTop: 10,
  },
  videoContainer: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.4,
    alignItems: 'center',
    marginVertical: 10,
  },
  video: {
    width: SCREEN_WIDTH * 0.9,
    height: '100%',
    borderRadius: 10,
  },
  removeButton: {
    marginTop: 10,
    backgroundColor: '#ff4444',
    padding: 10,
    borderRadius: 5,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  errorText: {
    color: '#ff4444',
    marginTop: 10,
  },
  submitButton: {
    backgroundColor: '#444',
    padding: 12,
    borderRadius: 5,
    marginTop: 10,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  hashtagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    width: '90%',
  },
  hashtagBox: {
    flexDirection: 'row',
    alignItems: 'center',  // ✅ Aligns text & button vertically
    backgroundColor: '#444',
    padding: 5,
    borderRadius: 15,
    margin: 5,
  },
  hashtagText: {
    color: '#fff',
    fontSize: 14,
  },
  faqIcon: {
    padding:16,
    position: 'absolute',
    top: 20,
    right: 20,
  },
  faqText: {
    fontSize: 25,
    color: '#fff',
  },
  faqModal: {
    backgroundColor: '#222',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  faqTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  faqItem: {
    color: '#ddd',
    fontSize: 16,
    marginTop: 10,
  },
  faqAnswer: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 10,
  },
  closeFaqButton: {
    backgroundColor: '#444',
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  closeFaqText: {
    color: '#fff',
    fontSize: 16,
  },
  uploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  uploadProgressTest: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  progressBarContainer: {
    width: '80%',
    height: 10,
    backgroundColor: '#444',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#0f0',
  }
});

export default UploadContentPage;