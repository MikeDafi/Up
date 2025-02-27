import { updateUserData } from "./dynamodb";
import { LAST_LOGIN_UPDATE_INTERVAL_MS } from "./constants";
import {getLastLoginUpdateTimestamp, getUUIDCache, setLastLoginUpdateTimestamp} from "./videoCacheStorage";

export async function updateLastLoginTimestamp() {
  try {
    const lastLoginUpdateTimestamp = await getLastLoginUpdateTimestamp();
    const now = Date.now();

    if (lastLoginUpdateTimestamp && now - lastLoginUpdateTimestamp < LAST_LOGIN_UPDATE_INTERVAL_MS) {
      return;
    }

    const timestamp = new Date(now).toISOString(); // Convert numeric timestamp to ISO string
    const payload = {
      user_id: await getUUIDCache(),
      last_login: timestamp,
    };
    await updateUserData(payload);
    await setLastLoginUpdateTimestamp(now);
  } catch (error) {
    console.error("Failed to update last login timestamp:", error);
  }
}