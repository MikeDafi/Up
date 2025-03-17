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
  await setLastLoginUpdateTimestamp(now);
  return payload;
}

export async function uploadSeenVideoIdsChecksums() {
  const seenVideoIdsChecksumUpdateTimestamp = await getSeenVideoIdsChecksumUpdateTimestamp();
  const now = Date.now();

  console.log("seenVideoIdsChecksumUpdateTimestamp", now - seenVideoIdsChecksumUpdateTimestamp);
  if (seenVideoIdsChecksumUpdateTimestamp && (now - seenVideoIdsChecksumUpdateTimestamp) < SEEN_VIDEO_IDS_CHECKSUM_UPDATE_INTERVAL_MS) {
    return {};
  }

  const seenVideoMetadatas = await getSeenVideoMetadatasCache();
  const seenVideoIdsChecksums = seenVideoMetadatas
      .slice(0, SEEN_VIDEO_IDS_CHECKSUM_UPLOAD_SIZE_LIMIT)
      .map(video => video.videoId.substring(0, 8));

  await setSeenVideoIdsChecksumUpdateTimestamp(now);
  return {"seen_video_ids_checksum": seenVideoIdsChecksums};
}

export async function aggregateUpdateUserData() {
  const payload = {"user_id": await getUUIDCache(), "preferences": {...await uploadLastLoginTimestamp(), ...await uploadHashtagConfidenceScores(), ...await uploadSeenVideoIdsChecksums()}}
  if (Object.keys(payload.preferences).length === 0) {
    console.debug("No user data to upload.");
    return;
  }
  console.log("Uploading user data:", payload);
  try {
    await updateUserData(payload);
  } catch (error) {
    console.error("Failed to update user data:", error);
  }
}