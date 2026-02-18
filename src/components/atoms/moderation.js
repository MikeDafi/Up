import AsyncStorage from '@react-native-async-storage/async-storage';

const EULA_ACCEPTED_KEY = 'eula_accepted';
const EULA_ACCEPTED_VERSION_KEY = 'eula_accepted_version';
const BLOCKED_USERS_KEY = 'blocked_users';

// Current EULA version - increment when terms change significantly
export const CURRENT_EULA_VERSION = '1.0.0';

/**
 * Check if user has accepted the current EULA version
 */
export const hasAcceptedEULA = async () => {
  try {
    const accepted = await AsyncStorage.getItem(EULA_ACCEPTED_KEY);
    const acceptedVersion = await AsyncStorage.getItem(EULA_ACCEPTED_VERSION_KEY);
    return accepted === 'true' && acceptedVersion === CURRENT_EULA_VERSION;
  } catch (error) {
    console.error('Error checking EULA acceptance:', error.message);
    return false;
  }
};

/**
 * Mark EULA as accepted with current version
 */
export const acceptEULA = async () => {
  try {
    await AsyncStorage.setItem(EULA_ACCEPTED_KEY, 'true');
    await AsyncStorage.setItem(EULA_ACCEPTED_VERSION_KEY, CURRENT_EULA_VERSION);
    return true;
  } catch (error) {
    console.error('Error accepting EULA:', error.message);
    return false;
  }
};

/**
 * Get list of blocked user IDs
 */
export const getBlockedUsers = async () => {
  try {
    const blocked = await AsyncStorage.getItem(BLOCKED_USERS_KEY);
    return blocked ? JSON.parse(blocked) : [];
  } catch (error) {
    console.error('Error getting blocked users:', error.message);
    return [];
  }
};

/**
 * Block a user
 */
export const blockUser = async (uploaderId) => {
  try {
    const blocked = await getBlockedUsers();
    if (!blocked.includes(uploaderId)) {
      blocked.push(uploaderId);
      await AsyncStorage.setItem(BLOCKED_USERS_KEY, JSON.stringify(blocked));
    }
    return true;
  } catch (error) {
    console.error('Error blocking user:', error.message);
    return false;
  }
};

/**
 * Check if a user is blocked
 */
export const isUserBlocked = async (uploaderId) => {
  const blocked = await getBlockedUsers();
  return blocked.includes(uploaderId);
};
