import * as Device from 'expo-device';

export async function getAttestationInfo() {
  const info = {
    isDevice: Device.isDevice,
    osName: Device.osName,
    osVersion: Device.osVersion,
    manufacturer: Device.manufacturer,
    modelName: Device.modelName,
    deviceYearClass: Device.deviceYearClass,
    isRooted: false,
  };

  try {
    info.isRooted = await Device.isRootedExperimentalAsync();
  } catch (err) {
    console.warn('Could not check if device is rooted:', err);
  }

  return info;
}

// Returns true for real, non-rooted devices. Bypasses in __DEV__ for simulators.
export async function isTrustedDevice() {
  if (__DEV__) { // eslint-disable-line no-undef
    return true;
  }

  const attestation = await getAttestationInfo();
  return attestation.isDevice && !attestation.isRooted;
}