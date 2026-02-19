import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { cacheData, retrieveCachedData } from './videoCacheStorage';
import { ATTESTATION_CHALLENGE_URL, SESSION_TOKEN_KEY, ATTESTED_KEY_ID_KEY } from './constants';

// ---------------------------------------------------------------------------
// Session token cache — avoids re-attestation on every request
// ---------------------------------------------------------------------------

let _cachedSessionToken = null;
let _cachedSessionExpiry = 0;

// Mutex: only one attestation flow runs at a time. Concurrent callers
// wait for the in-flight attempt and share the result.
let _attestationInFlight = null;

/**
 * Get a valid session token, performing attestation if needed.
 *
 * Flow:
 *   1. Return cached in-memory token if still valid
 *   2. Return persisted token from AsyncStorage if still valid
 *   3. Otherwise, perform full attestation flow and cache the new token
 *      (serialized — concurrent callers share a single in-flight attempt)
 *
 * Attestation runs on all builds. If the native module is unavailable
 * (e.g. Expo Go / simulator), it gracefully falls back to no-auth.
 */
export async function getSessionToken() {
  // Check in-memory cache first (fastest path)
  if (_cachedSessionToken && Date.now() < _cachedSessionExpiry) {
    return _cachedSessionToken;
  }

  // Check persisted token
  const persisted = await retrieveCachedData(SESSION_TOKEN_KEY, null);
  if (persisted && persisted.token && Date.now() < persisted.expiry) {
    _cachedSessionToken = persisted.token;
    _cachedSessionExpiry = persisted.expiry;
    return persisted.token;
  }

  // No valid token — perform attestation (serialized via mutex)
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

async function _performAttestation() {
  // Step 1: Get a challenge nonce from the server
  const nonce = await _fetchChallenge();

  // Step 2: Get the iOS attestation token
  if (Platform.OS !== 'ios') {
    console.warn('Attestation only supported on iOS');
    return null;
  }

  let attestationPayload;
  try {
    attestationPayload = await _getAppleAttestation(nonce);
  } catch (e) {
    // Attestation failed entirely (e.g. corrupt native key state after rebuild).
    // Clear all stored attestation state so the next attempt starts fresh.
    console.warn('[Attestation] Full attestation failed, clearing state and falling back:', e.message);
    await cacheData(ATTESTED_KEY_ID_KEY, null);
    await clearSessionToken();
    _pendingAttestation = null;
    return null; // Proceed without auth — server will reject if it requires attestation
  }

  // The attestation token is sent with the first real API request.
  // The server verifies it and returns a session JWT in the response body.
  // We store the attestation payload so getAttestationHeaders() can use it.
  _pendingAttestation = attestationPayload;

  return null; // No session token yet — it comes back from the first API response
}

// Pending attestation to be sent with the next request
let _pendingAttestation = null;

// Gate so concurrent callers wait while the first request exchanges the
// attestation token for a session JWT.
let _sessionTokenGate = null;
let _sessionTokenGateResolve = null;

/**
 * Get headers for the next API request.
 * If there's a pending attestation (no session token yet), the FIRST caller
 * consumes it. Concurrent callers wait until the session JWT comes back.
 */
export async function getRequestHeaders() {
  const headers = { 'Content-Type': 'application/json' };

  // If another request is already carrying the attestation token, wait for it
  if (_sessionTokenGate) {
    await _sessionTokenGate;
    const token = await getSessionToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      return headers;
    }
    // Gate released but no token (e.g. first request got 403).
    // Fall through to re-trigger attestation below.
  }

  // Try to get a session token first (may trigger attestation which sets _pendingAttestation)
  const token = await getSessionToken();

  // Re-check: another concurrent caller may have consumed _pendingAttestation
  // and set the gate while we were awaiting getSessionToken()
  if (_sessionTokenGate) {
    await _sessionTokenGate;
    const freshToken = await getSessionToken();
    if (freshToken) {
      headers['Authorization'] = `Bearer ${freshToken}`;
    }
    return headers;
  }

  // If attestation just ran, consume it — only ONE request carries the nonce
  if (_pendingAttestation) {
    headers['X-Attestation-Token'] = JSON.stringify(_pendingAttestation);
    _pendingAttestation = null;

    // Block concurrent callers until the session token arrives
    _sessionTokenGate = new Promise((resolve) => {
      _sessionTokenGateResolve = resolve;
    });

    return headers;
  }

  // Otherwise use the cached session JWT
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Process the response from an API call.
 * If it contains a session_token, cache it and unblock waiting callers.
 * If it returned 403, clear the session and re-attest.
 */
export async function handleAttestationResponse(response, responseBody) {
  // Cache any new session token from the response
  if (responseBody && responseBody.session_token) {
    await _persistSessionToken(responseBody.session_token);
    _pendingAttestation = null; // Attestation was accepted
    _releaseSessionTokenGate();
  }

  // If 403, the session/key is invalid — clear everything and force full re-attestation
  if (response.status === 403) {
    await clearSessionToken();
    await cacheData(ATTESTED_KEY_ID_KEY, null); // Clear stale attestation key
    _pendingAttestation = null;
    _releaseSessionTokenGate();

    // Proactively re-attest so subsequent/waiting callers pick up a fresh token
    getSessionToken().catch(e =>
      console.warn('[Attestation] Background re-attestation failed:', e.message)
    );
  }
}

function _releaseSessionTokenGate() {
  if (_sessionTokenGateResolve) {
    _sessionTokenGateResolve();
    _sessionTokenGate = null;
    _sessionTokenGateResolve = null;
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
 * Perform Apple App Attest.
 *
 * Uses the native DCAppAttestService via a native module.
 * Requires: react-native-app-integrity or a custom native bridge.
 *
 * Flow:
 *   - First time: generateKey() → attestKey(keyId, nonceHash) → full attestation
 *   - Subsequent: generateAssertion(storedKeyId, nonceHash) → lightweight assertion
 */
async function _getAppleAttestation(nonce) {
  const AppIntegrity = require('@expo/app-integrity');

  if (!AppIntegrity.isSupported) {
    throw new Error('App Attest is not supported on this device. A real iOS device with a dev-client build is required.');
  }

  // Clear any stale cached key from previous installs/builds
  const storedKeyId = await retrieveCachedData(ATTESTED_KEY_ID_KEY, null);

  if (storedKeyId) {
    // Lightweight assertion with existing key
    try {
      const assertion = await AppIntegrity.generateAssertionAsync(storedKeyId, nonce);
      return {
        platform: 'ios',
        type: 'assertion',
        token: assertion, // base64-encoded CBOR assertion
        key_id: storedKeyId,
        nonce,
      };
    } catch (e) {
      console.warn('[Attestation] Assertion failed, re-attesting');
      await cacheData(ATTESTED_KEY_ID_KEY, null); // Clear invalid key
    }
  }

  // Full attestation (first time or after assertion failure)
  let keyId;
  try {
    keyId = await AppIntegrity.generateKeyAsync();
  } catch (firstError) {
    // Native key state may be corrupt (e.g. after app rebuild).
    // Wait briefly and retry once — the first call can clear stale state.
    console.warn('[Attestation] Key generation failed, retrying once:', firstError.message);
    await new Promise(r => setTimeout(r, 500));
    try {
      keyId = await AppIntegrity.generateKeyAsync();
    } catch (retryError) {
      console.error('[Attestation] Key generation failed on retry');
      throw retryError;
    }
  }

  let attestation;
  try {
    attestation = await AppIntegrity.attestKeyAsync(keyId, nonce);
  } catch (e) {
    console.error('[Attestation] Key attestation failed');
    throw e;
  }

  // Persist the key ID for future assertions
  await cacheData(ATTESTED_KEY_ID_KEY, keyId);

  return {
    platform: 'ios',
    type: 'attestation',
    token: attestation, // base64-encoded CBOR attestation object
    key_id: keyId,
    nonce,
  };
}

// ---------------------------------------------------------------------------
// Token persistence
// ---------------------------------------------------------------------------

async function _persistSessionToken(token) {
  // Decode the JWT payload to get expiry (without verification — server already verified)
  let expiry;
  try {
    const payloadB64 = token.split('.')[1];
    const payload = JSON.parse(atob(payloadB64));
    expiry = payload.exp * 1000; // Convert to milliseconds
  } catch (e) {
    // Default to 50 minutes if we can't decode (safe margin under the 1hr server TTL)
    expiry = Date.now() + 50 * 60 * 1000;
  }

  _cachedSessionToken = token;
  _cachedSessionExpiry = expiry;

  await cacheData(SESSION_TOKEN_KEY, { token, expiry });
}

// ---------------------------------------------------------------------------
// Legacy exports (for backward compatibility with App.js isTrustedDevice check)
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

// Returns true for real, non-rooted devices. Bypasses in __DEV__ for simulators.
export async function isTrustedDevice() {
  if (__DEV__) { // eslint-disable-line no-undef
    return true;
  }

  const attestation = await getAttestationInfo();
  return attestation.isDevice && !attestation.isRooted;
}
