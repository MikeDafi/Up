import {CREATE_VIDEO_METADATA_URL, GET_FEED_URL, UPDATE_USER_DATA_URL} from "./constants";
import { handleResponse } from "./utilities";

export const updateUserData = async (payload) => {
  try {
    const response = await fetch(UPDATE_USER_DATA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    await handleResponse(response, "Failed to update user data");
    return true; // Return success if no error is thrown
  } catch (error) {
    console.error('Error updating user data:', error.message);
    return false;
  }
}

export const createVideoMetadata = async (metadata) => {
  console.debug("Creating video metadata:", metadata);
  try {
    const response = await fetch(CREATE_VIDEO_METADATA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata.toJSON()), // Use the toJSON method of VideoMetadata
    });

    await handleResponse(response, "Failed to save video metadata");
    return true; // Return success if no error is thrown
  } catch (error) {
    console.error('Error saving metadata:', error.message);
    return false;
  }
};
export const fetchFeed = async (payload) => {
  try {
    // Send the payload as the body of the POST request
    const response = await fetch(GET_FEED_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload), // Directly use the provided dictionary
    });
    const processedResponse = await handleResponse(response, "Video feed");
    const data = await processedResponse.json();
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