export type VoiceAlertKind = "completed" | "interrupted";

const STORAGE_KEY = "aads-chat-voice-alerts";
const lastSpokenAtByKey = new Map<string, number>();

export function getVoiceAlertsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setVoiceAlertsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Storage may be unavailable in private/webview contexts. Keep in-memory UI state.
  }
}

export function isVoiceAlertSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function warmUpVoiceAlerts(): void {
  if (!isVoiceAlertSupported()) return;
  try {
    window.speechSynthesis.resume();
    window.speechSynthesis.getVoices();
  } catch {
    // Best-effort user gesture warm-up for mobile browsers.
  }
}

function defaultVoiceText(kind: VoiceAlertKind): string {
  return kind === "completed"
    ? "응답이 완료되었습니다."
    : "응답이 중단되었습니다. 이어서 생성할 수 있습니다.";
}

function findKoreanVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => voice.lang.toLowerCase().startsWith("ko")) || null;
}

export function speakChatAlert(
  kind: VoiceAlertKind,
  options: { text?: string; dedupeKey?: string; enabled?: boolean } = {},
): void {
  if (options.enabled === false) return;
  if (!isVoiceAlertSupported()) return;

  const key = `${kind}:${options.dedupeKey || options.text || ""}`;
  const now = Date.now();
  if (now - (lastSpokenAtByKey.get(key) || 0) < 5000) return;
  lastSpokenAtByKey.set(key, now);

  try {
    const utterance = new SpeechSynthesisUtterance(options.text || defaultVoiceText(kind));
    utterance.lang = "ko-KR";
    utterance.rate = 1;
    utterance.pitch = 1;
    const koreanVoice = findKoreanVoice();
    if (koreanVoice) utterance.voice = koreanVoice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    // Browser speech output is best-effort and may be blocked until a user gesture.
  }
}

export function cancelVoiceAlerts(): void {
  if (!isVoiceAlertSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignore unsupported runtime cancellation.
  }
}
