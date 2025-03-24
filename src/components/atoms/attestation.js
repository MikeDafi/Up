// attestation.js
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
    // Experimental: root/jailbreak detection (may not be reliable)
    info.isRooted = await Device.isRootedExperimentalAsync();
  } catch (err) {
    console.warn('⚠️ Could not check if device is rooted:', err);
  }

  return info;
}

/**
 * Simple temporary trust check.
 * Returns true if:
 * - It's a real device (not simulator/emulator)
 * - It's not rooted/jailbroken (as far as we can tell)
 */
export async function isTrustedDevice() {
  const attestation = await getAttestationInfo();

  return attestation.isDevice && !attestation.isRooted;
}