import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import PropTypes from 'prop-types';
import { blockUser, isUserBlocked } from '../atoms/moderation';

const VideoActionMenu = ({ isVisible, onClose, videoId, onBlockComplete, onReportComplete }) => {
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  if (!isVisible) return null;

  const uploaderId = videoId ? videoId.split('-')[0] : '';

  const handleReport = () => {
    const subject = encodeURIComponent(`Content Report - Video ${videoId}`);
    const body = encodeURIComponent(
      `I am reporting the following video:\n\nVideo ID: ${videoId}\n\nReason:\n[Please describe the issue]\n\n---\nSent from Splytt app`
    );
    Linking.openURL(`mailto:maskndafi@gmail.com?subject=${subject}&body=${body}`);
    onClose();

    if (onReportComplete) {
      onReportComplete(videoId);
    }
    
    Alert.alert('Video Reported', 'Thank you for your report. This video has been removed from your feed.');
  };

  const handleBlockPress = async () => {
    const alreadyBlocked = await isUserBlocked(uploaderId);
    if (alreadyBlocked) {
      Alert.alert('Already Blocked', 'You have already blocked this user.');
      onClose();
      return;
    }
    setShowBlockConfirm(true);
  };

  const handleBlockConfirm = async () => {
    await blockUser(uploaderId);
    setShowBlockConfirm(false);
    onClose();


    const subject = encodeURIComponent(`User Blocked - ${uploaderId}`);
    const body = encodeURIComponent(
      `A user has been blocked.\n\nBlocked User ID: ${uploaderId}\nVideo ID: ${videoId}\n\n---\nSent from Splytt app`
    );
    Linking.openURL(`mailto:maskndafi@gmail.com?subject=${subject}&body=${body}`);
    
    if (onBlockComplete) {
      onBlockComplete(uploaderId);
    }
  };

  if (showBlockConfirm) {
    return (
      <Modal visible={isVisible} transparent animationType="fade" onRequestClose={() => setShowBlockConfirm(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowBlockConfirm(false)}>
          <Pressable style={styles.confirmContainer} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.confirmIcon}>🚫</Text>
            <Text style={styles.confirmTitle}>Block This User?</Text>
            <Text style={styles.confirmText}>
              Their videos will be removed from your feed immediately.
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={() => setShowBlockConfirm(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.blockButton} onPress={handleBlockConfirm}>
                <Text style={styles.blockButtonText}>Block</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
            <Text style={styles.menuIcon}>🚩</Text>
            <Text style={styles.menuLabel}>Report</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleBlockPress}>
            <Text style={styles.menuIcon}>🚫</Text>
            <Text style={styles.menuLabel}>Block User</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelMenuItem} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#1a1a24',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 34,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#252530',
    marginBottom: 8,
  },
  menuIcon: {
    fontSize: 22,
    marginRight: 14,
  },
  menuLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: '#fff',
  },
  cancelMenuItem: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#333',
    alignItems: 'center',
    marginTop: 4,
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#fff',
  },
  confirmContainer: {
    backgroundColor: '#1a1a24',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  confirmIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  confirmText: {
    fontSize: 15,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 24,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#333',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  blockButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
  },
  blockButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

VideoActionMenu.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  videoId: PropTypes.string,
  onBlockComplete: PropTypes.func,
  onReportComplete: PropTypes.func,
};

export default VideoActionMenu;

