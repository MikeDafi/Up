import {CREATE_VIDEO_METADATA_URL, GET_FEED_URL, UPDATE_USER_DATA_URL} from "./constants";
import { handleResponse } from "./utilities";
import { getRequestHeaders, handleAttestationResponse } from "./attestation";
import { getUUIDCache } from "./videoCacheStorage";

export const updateUserData = async (payload) => {
  try {
    const headers = await getRequestHeaders();
    const response = await fetch(UPDATE_USER_DATA_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    // Handle attestation state (clear stale keys on 403) BEFORE handleResponse throws
    if (response.status === 403) {
      await handleAttestationResponse(response, null);
    }

    await handleResponse(response, "Failed to update user data");

    // Cache session token if server returned one (first attestation)
    try {
      const clonedResponse = response.clone();
      const responseBody = await clonedResponse.json();
      await handleAttestationResponse(response, responseBody);
    } catch (e) {
      // Response may not be JSON or may not have session_token — that's fine
    }

    return true; // Return success if no error is thrown
  } catch (error) {
    console.error('Error updating user data:', error.message);
    return false;
  }
}

export const createVideoMetadata = async (metadata) => {
  console.debug("Creating video metadata");
  try {
    const userId = await getUUIDCache();
    const headers = await getRequestHeaders();
    const response = await fetch(CREATE_VIDEO_METADATA_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...metadata.toJSON(), user_id: userId }),
    });

    // Handle attestation state (clear stale keys on 403) BEFORE handleResponse throws
    if (response.status === 403) {
      await handleAttestationResponse(response, null);
    }

    await handleResponse(response, "Failed to save video metadata");

    try {
      const clonedResponse = response.clone();
      const responseBody = await clonedResponse.json();
      await handleAttestationResponse(response, responseBody);
    } catch (e) {
      // Response may not be JSON — that's fine
    }

    return true; // Return success if no error is thrown
  } catch (error) {
    console.error('Error saving metadata:', error.message);
    return false;
  }
};

export const fetchFeed = async (payload) => {
  try {
    const headers = await getRequestHeaders();
    // Send the payload as the body of the POST request
    const response = await fetch(GET_FEED_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload), // Directly use the provided dictionary
    });

    // Handle attestation state (clear stale keys on 403) BEFORE handleResponse throws
    if (response.status === 403) {
      await handleAttestationResponse(response, null);
    }

    const processedResponse = await handleResponse(response, "Video feed");
    const data = await processedResponse.json();

    console.debug('[Feed] Response status:', response.status,
      '| video_feed count:', data?.video_feed?.length ?? 0);

    // Cache session token if present
    await handleAttestationResponse(response, data);

    return data;
  } catch (error) {
    if (error.message.includes("Too many new feed requests")) {
      console.warn('Too many new feed requests', error.message);
      return error;
    }
    console.error('Error fetching feed:', error.message);
    throw error; // Re-throw to allow the caller to handle it
  }
};
