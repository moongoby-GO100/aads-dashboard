import { BASE_URL } from "./api.js";

export const AUTH_MESSAGE_TYPE = "ohvis-auth";

export async function sendAuthToFrame({ frameWindow, getToken, targetOrigin = BASE_URL }) {
  if (!frameWindow) return false;
  const token = await getToken();
  if (!token) return false;
  frameWindow.postMessage({ type: AUTH_MESSAGE_TYPE, token }, targetOrigin);
  return true;
}
