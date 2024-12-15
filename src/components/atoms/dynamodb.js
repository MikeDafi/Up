import {CREATE_VIDEO_METADATA_URL, GET_FEED_URL} from "./constants";
import { handleResponse } from "./utilities";

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
export const fetchFeed = async (args) => {
  try {
    // Construct query parameters from the args object
    const queryParams = new URLSearchParams(args).toString();
    const urlWithParams = `${GET_FEED_URL}?${queryParams}`;

    const response = await fetch(urlWithParams, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const processedResponse = await handleResponse(response, "Failed to fetch video feed");
    const data = await processedResponse.json();
    console.debug('Fetched feed:', data);

    if (!Array.isArray(data)) {
      throw new Error('Unexpected response format: Expected an array');
    }

    return data;
  } catch (error) {
    console.error('Error fetching feed:', error.message);
    throw error; // Re-throw to allow the caller to handle it
  }
};