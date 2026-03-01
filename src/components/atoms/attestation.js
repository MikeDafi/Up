import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { cacheData, retrieveCachedData } from './videoCacheStorage';
import {
  ATTESTATION_CHALLENGE_URL,
  ATTESTATION_VERIFY_URL,
  SESSION_TOKEN_KEY,
  ATTESTED_KEY_ID_KEY,
} from './constants';

// ---------------------------------------------------------------------------
// Session token cache
// ---------------------------------------------------------------------------

let _cachedSessionToken = null;
let _cachedSessionExpiry = 0;

// Mutex: only one attestation flow runs at a time. Concurrent callers
// wait for the in-flight attempt and share the result.
let _attestationInFlight = null;

/**
 * Get a valid session token, performing attestation if needed.
 *
 * Returns a JWT string on success, or null if attestation is unavailable
 * (e.g. simulator, non-iOS). Concurrent callers share a single in-flight
 * attestation via mutex.
 */
export async function getSessionToken() {
  if (_cachedSessionToken && Date.now() < _cachedSessionExpiry) {
    return _cachedSessionToken;
  }

  const persisted = await retrieveCachedData(SESSION_TOKEN_KEY, null);
  if (persisted && persisted.token && Date.now() < persisted.expiry) {
    _cachedSessionToken = persisted.token;
    _cachedSessionExpiry = persisted.expiry;
    return persisted.token;
  }

  if (_attestationInFlight) {
    return _attestationInFlight;
  }
  _attestationInFlight = _performAttestation().finally(() => {
    _attestationInFlight = null;
  });
  return _attestationInFlight;
}

/**
 * Clear the session token (e.g., on logout or when the server returns 403).
 */
export async function clearSessionToken() {
  _cachedSessionToken = null;
  _cachedSessionExpiry = 0;
  await cacheData(SESSION_TOKEN_KEY, null);
}

// ---------------------------------------------------------------------------
// Core attestation flow
// ---------------------------------------------------------------------------

/**
 * Perform attestation and exchange it for a session JWT immediately.
 *
 * Instead of piggybacking the attestation on a business API request, we
 * send it to a dedicated verification endpoint and get a JWT back. If the
 * server rejects a stale assertion, we clear the key and retry with full
 * attestation — all before any business request is made.
 */
async function _performAttestation(forceFullAttestation = false) {
  if (Platform.OS !== 'ios') {
    console.warn('Attestation only supported on iOS');
    return null;
  }

  const nonce = await _fetchChallenge();

  let attestationPayload;
  try {
    attestationPayload = await _getAppleAttestation(nonce, forceFullAttestation);
  } catch (e) {
    console.warn('[Attestation] Failed, clearing state:', e.message);
    await cacheData(ATTESTED_KEY_ID_KEY, null);
    await clearSessionToken();
    return null;
  }

  // Exchange attestation for JWT via the verification endpoint
  return _exchangeAttestationForJWT(attestationPayload);
}

/**
 * Send attestation to the verification endpoint and return the JWT.
 * If the server rejects a stale assertion (403), clears the key and
 * retries once with full attestation using a fresh nonce.
 */
async function _exchangeAttestationForJWT(attestationPayload) {
  try {
    const response = await fetch(ATTESTATION_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Attestation-Token': JSON.stringify(attestationPayload),
      },
      body: JSON.stringify({}),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.session_token) {
        await _persistSessionToken(data.session_token);
        return data.session_token;
      }
      // Server accepted but returned no token (e.g. BYPASS_ATTESTATION mode)
      return null;
    }

    // Stale assertion key — clear and retry with full attestation
    if (response.status === 403 && attestationPayload.type === 'assertion') {
      console.warn('[Attestation] Assertion rejected by server, re-attesting with fresh key');
      await cacheData(ATTESTED_KEY_ID_KEY, null);
      return _performAttestation(true);
    }

    const errorBody = await response.text().catch(() => '');
    console.warn(`[Attestation] Verification failed (${response.status}): ${errorBody}`);
    return null;
  } catch (e) {
    console.warn('[Attestation] Verification request failed:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Request headers (simplified — JWT is always obtained before business calls)
// ---------------------------------------------------------------------------

/**
 * Get headers for an API request. If a valid JWT exists, it's included
 * as a Bearer token. No piggybacking or gating needed.
 */
export async function getRequestHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = await getSessionToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Handle attestation-related state from an API response.
 * On 403, clears cached credentials so the next request re-attests.
 */
export async function handleAttestationResponse(response, responseBody) {
  if (responseBody && responseBody.session_token) {
    await _persistSessionToken(responseBody.session_token);
  }

  if (response.status === 403) {
    if (_attestationInFlight) {
      await _attestationInFlight.catch(() => {});
      return;
    }

    await clearSessionToken();
    await cacheData(ATTESTED_KEY_ID_KEY, null);
  }
}

// ---------------------------------------------------------------------------
// Challenge nonce
// ---------------------------------------------------------------------------

async function _fetchChallenge() {
  const response = await fetch(ATTESTATION_CHALLENGE_URL, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch attestation challenge: ${response.status}`);
  }

  const data = await response.json();
  return data.nonce;
}

// ---------------------------------------------------------------------------
// Apple App Attest (iOS)
// ---------------------------------------------------------------------------

/**
 * Generate an Apple App Attest assertion (lightweight, if key exists)
 * or full attestation (first time / after key invalidation).
 */
async function _getAppleAttestation(nonce, forceFullAttestation = false) {
  const AppIntegrity = require('@expo/app-integrity');

  if (!AppIntegrity.isSupported) {
    throw new Error('App Attest is not supported on this device.');
  }

  const storedKeyId = forceFullAttestation
    ? null
    : await retrieveCachedData(ATTESTED_KEY_ID_KEY, null);

  if (storedKeyId) {
    try {
      const assertion = await AppIntegrity.generateAssertionAsync(storedKeyId, nonce);
      return {
        platform: 'ios',
        type: 'assertion',
        token: assertion,
        key_id: storedKeyId,
        nonce,
      };
    } catch (e) {
      console.warn('[Attestation] Assertion failed, re-attesting:', e.message);
      await cacheData(ATTESTED_KEY_ID_KEY, null);
    }
  }

  // Full attestation (first time or after assertion failure)
  let keyId;
  try {
    keyId = await AppIntegrity.generateKeyAsync();
  } catch (firstError) {
    console.warn('[Attestation] Key generation failed, retrying once:', firstError.message);
    await new Promise(r => setTimeout(r, 500));
    keyId = await AppIntegrity.generateKeyAsync();
  }

  const attestation = await AppIntegrity.attestKeyAsync(keyId, nonce);
  await cacheData(ATTESTED_KEY_ID_KEY, keyId);

  return {
    platform: 'ios',
    type: 'attestation',
    token: attestation,
    key_id: keyId,
    nonce,
  };
}

// ---------------------------------------------------------------------------
// Token persistence
// ---------------------------------------------------------------------------

async function _persistSessionToken(token) {
  let expiry;
  try {
    const payloadB64 = token.split('.')[1];
    const payload = JSON.parse(atob(payloadB64));
    expiry = payload.exp * 1000;
  } catch (e) {
    expiry = Date.now() + 50 * 60 * 1000;
  }

  _cachedSessionToken = token;
  _cachedSessionExpiry = expiry;

  await cacheData(SESSION_TOKEN_KEY, { token, expiry });
}

// ---------------------------------------------------------------------------
// Device trust check (used by App.js)
// ---------------------------------------------------------------------------

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
    console.warn('Could not check if device is rooted:', err.message);
  }

  return info;
}

export async function isTrustedDevice() {
  if (__DEV__) { // eslint-disable-line no-undef
    return true;
  }

  const attestation = await getAttestationInfo();
  return attestation.isDevice && !attestation.isRooted;
}
