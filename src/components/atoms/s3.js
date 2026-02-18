import {S3_API_URL} from "./constants";
import * as FileSystem from "expo-file-system";
import { getRequestHeaders, handleAttestationResponse } from "./attestation";

/**
 * Request a pre-signed POST from the backend.
 * Returns { url, fields, key, maxSizeBytes } — everything needed to upload directly to S3.
 */
export const getPresignedPost = async (fileName, contentType) => {
  const headers = await getRequestHeaders();
  const response = await fetch(
    `${S3_API_URL}/getPresignedUrl?fileName=${encodeURIComponent(fileName)}&contentType=${encodeURIComponent(contentType)}`,
    { headers }
  );

  // Handle attestation state (clear stale keys on 403) before reading body
  if (response.status === 403) {
    await handleAttestationResponse(response, null);
    throw new Error(`Pre-signed URL request rejected: ${response.status}`);
  }

  const data = await response.json();

  // Cache session token if present
  await handleAttestationResponse(response, data);

  // { url, fields, key, maxSizeBytes }
  return data;
};

/**
 * Upload a video to S3 using a pre-signed POST.
 * @param {Object} file        – { uri, type }
 * @param {Object} presignedPost – { url, fields, maxSizeBytes } from getPresignedPost()
 */
export const uploadVideo = async (file, presignedPost) => {
  try {
    // Client-side fast-fail: check file size before uploading
    const fileInfo = await FileSystem.getInfoAsync(file.uri, { size: true });
    if (!fileInfo.exists) {
      throw new Error('Video file not found');
    }
    if (presignedPost.maxSizeBytes && fileInfo.size > presignedPost.maxSizeBytes) {
      const maxMB = Math.round(presignedPost.maxSizeBytes / (1024 * 1024));
      throw new Error(`Video exceeds the ${maxMB} MB upload limit`);
    }

    // Stream the file directly to S3 via multipart POST.
    // The pre-signed POST fields include the S3 policy + signature that enforce
    // content-length-range server-side, so even a tampered client can't exceed the limit.
    const response = await FileSystem.uploadAsync(presignedPost.url, file.uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',                // S3 expects the file in a field named "file"
      parameters: presignedPost.fields,  // Policy, signature, key, Content-Type, etc.
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to upload video: ${response.body}`);
    }
    return true;
  } catch (error) {
    console.error('Error uploading video:', error.message);
    throw error; // Re-throw so backoff can retry (or caller can surface the message)
  }
};

// TODO: Implement the deleteVideo function in case of orphan blobs during upload to DynamoDB
