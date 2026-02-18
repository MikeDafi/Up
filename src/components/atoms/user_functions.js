import { updateUserData } from "./dynamodb";
import {
  LAST_LOGIN_UPDATE_INTERVAL_MS,
  SEEN_VIDEO_IDS_CHECKSUM_UPDATE_INTERVAL_MS, SEEN_VIDEO_IDS_CHECKSUM_UPLOAD_SIZE_LIMIT,
} from "./constants";
import {
  getLastLoginUpdateTimestamp,
  getSeenVideoIdsChecksumUpdateTimestamp,
  getSeenVideoMetadatasCache,
  getUUIDCache,
  setLastLoginUpdateTimestamp, setSeenVideoIdsChecksumUpdateTimestamp,
} from "./videoCacheStorage";
import {uploadHashtagConfidenceScores} from "./confidencescores";

export async function uploadLastLoginTimestamp() {
  const lastLoginUpdateTimestamp = await getLastLoginUpdateTimestamp();
  const now = Date.now();

  if (lastLoginUpdateTimestamp && now - lastLoginUpdateTimestamp < LAST_LOGIN_UPDATE_INTERVAL_MS) {
    return {}
  }

  const timestamp = new Date(now).toISOString(); // Convert numeric timestamp to ISO string
  const payload = {
    last_login: timestamp
  };
  // Don't set timestamp here — set it after successful upload in aggregateUpdateUserData
  return payload;
}

export async function uploadSeenVideoIdsChecksums() {
  const seenVideoIdsChecksumUpdateTimestamp = await getSeenVideoIdsChecksumUpdateTimestamp();
  const now = Date.now();

  console.debug("Seen checksums age (ms):", now - seenVideoIdsChecksumUpdateTimestamp);
  if (seenVideoIdsChecksumUpdateTimestamp && (now - seenVideoIdsChecksumUpdateTimestamp) < SEEN_VIDEO_IDS_CHECKSUM_UPDATE_INTERVAL_MS) {
    return {};
  }

  const seenVideoMetadatas = await getSeenVideoMetadatasCache();
  const seenVideoIdsChecksums = seenVideoMetadatas
      .slice(0, SEEN_VIDEO_IDS_CHECKSUM_UPLOAD_SIZE_LIMIT)
      .map(video => video.videoId.substring(0, 8));

  // Don't set timestamp here — set it after successful upload in aggregateUpdateUserData
  return {"seen_video_ids_checksum": seenVideoIdsChecksums};
}

export async function aggregateUpdateUserData() {
  // All four calls are independent AsyncStorage reads — run in parallel
  const [userId, loginPayload, scoresPayload, checksumsPayload] = await Promise.all([
    getUUIDCache(),
    uploadLastLoginTimestamp(),
    uploadHashtagConfidenceScores(),
    uploadSeenVideoIdsChecksums(),
  ]);

  const preferences = {...loginPayload, ...scoresPayload, ...checksumsPayload};
  if (Object.keys(preferences).length === 0) {
    console.debug("No user data to upload.");
    return;
  }

  const payload = {"user_id": userId, "preferences": preferences};
  console.debug("Uploading user data, keys:", Object.keys(preferences).join(', '));
  try {
    const success = await updateUserData(payload);
    if (success) {
      // Only mark timestamps as updated AFTER a successful upload
      const now = Date.now();
      if (loginPayload.last_login) {
        await setLastLoginUpdateTimestamp(now);
      }
      if (checksumsPayload.seen_video_ids_checksum) {
        await setSeenVideoIdsChecksumUpdateTimestamp(now);
      }
    }
  } catch (error) {
    console.error("Failed to update user data:", error.message);
    // Timestamps NOT updated — next run will retry the upload
  }
}
