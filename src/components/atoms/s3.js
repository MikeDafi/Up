import {S3_API_URL} from "./constants";
import * as FileSystem from "expo-file-system";
import {Buffer} from "buffer";

export const getPresignedUrl = async (fileName, contentType) => {
  const response = await fetch(`${S3_API_URL}/getPresignedUrl?fileName=${fileName}&contentType=${contentType}`);
  const data = await response.json();
  return data.url;
};

export const uploadVideo = async (file, presignedUrl) => {
  try {
    const fileContent = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binaryData = Buffer.from(fileContent, 'base64');
    const response = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: binaryData,
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to upload video: ${error}`);
    }
    // return id of the video
    return true;
  } catch (error) {
    console.error('Error uploading video:', error);
    return false;
  }
};

// TODO: Implement the deleteVideo function in case of orphan blobs during upload to DynamoDB