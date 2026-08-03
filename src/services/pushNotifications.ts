const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";

export type PushNotificationStatus =
  | "unsupported"
  | "not_configured"
  | "default"
  | "granted"
  | "denied"
  | "error";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("aads_token");
  if (token) return token;
  const cookieToken = document.cookie
    .split("; ")
    .find((row) => row.startsWith("aads_token="))
    ?.split("=")[1];
  return cookieToken ? decodeURIComponent(cookieToken) : null;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

async function fetchVapidPublicKey(): Promise<{ configured: boolean; public_key: string }> {
  const response = await fetch(`${BASE_URL}/notifications/vapid-public-key`, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!response.ok) return { configured: false, public_key: "" };
  return response.json();
}

export function getBrowserPushPermission(): PushNotificationStatus {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  return Notification.permission as PushNotificationStatus;
}

export async function registerOhvisPushNotifications(options?: {
  requestPermission?: boolean;
  sendTest?: boolean;
}): Promise<PushNotificationStatus> {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }

  let permission = Notification.permission;
  if (permission === "default" && options?.requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return permission as PushNotificationStatus;

  const keyInfo = await fetchVapidPublicKey();
  if (!keyInfo.configured || !keyInfo.public_key) return "not_configured";

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToArrayBuffer(keyInfo.public_key),
  });

  const saveResponse = await fetch(`${BASE_URL}/notifications/push-subscriptions`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!saveResponse.ok) return "error";

  if (options?.sendTest) {
    await fetch(`${BASE_URL}/notifications/push-test`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders(),
    }).catch(() => undefined);
  }
  return "granted";
}

export function showLocalCompletionNotification(body = "응답이 완료되었습니다."): void {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!document.hidden) return;
  try {
    const notification = new Notification("오비스", {
      body,
      tag: "ohvis-chat-complete",
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      data: { url: window.location.pathname + window.location.search + window.location.hash },
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Browser denied runtime Notification construction; server push still covers installed apps.
  }
}
