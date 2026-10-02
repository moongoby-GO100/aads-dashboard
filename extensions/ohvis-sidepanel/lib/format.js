import { BASE_URL } from "./api.js";

export const POLL_BASE_MS = 10_000;
export const POLL_MAX_MS = 60_000;

export function nextPollDelay(failures) {
  if (!failures || failures < 1) return POLL_BASE_MS;
  return Math.min(POLL_BASE_MS * 2 ** failures, POLL_MAX_MS);
}

const TASK_STATUS = {
  queued: "대기 중",
  running: "진행 중",
  completed: "완료",
  failed: "실패",
  cancelled: "취소됨",
  approval_required: "승인 필요",
  auth_required: "대상 사이트 로그인 필요",
};

const TASK_TONE = {
  queued: "info",
  running: "info",
  completed: "ok",
  failed: "bad",
  cancelled: "muted",
  approval_required: "warn",
  auth_required: "warn",
};

const RISK = { low: "낮음", medium: "보통", high: "높음", critical: "매우 높음" };

export function taskStatusLabel(status) {
  return TASK_STATUS[status] || "알 수 없음";
}

export function taskStatusTone(status) {
  return TASK_TONE[status] || "muted";
}

export function canRetry(status) {
  return status === "failed" || status === "cancelled" || status === "completed";
}

export function riskLabel(level) {
  return RISK[String(level || "").toLowerCase()] || "확인 필요";
}

export function describePermission(req) {
  const what = (req.action_summary || "").trim() || (req.action_type || "").trim() || "브라우저 작업";
  const where = (req.origin || "").trim() || "사이트 정보 없음";
  const why = `${riskLabel(req.risk_level)} 위험도 작업이라 사용자 승인이 필요합니다.`;
  return { what, where, why };
}

export function isExpired(req, now = Date.now()) {
  if (!req.expires_at) return false;
  const t = Date.parse(req.expires_at);
  return Number.isFinite(t) && t <= now;
}

export function sortByUpdatedDesc(tasks) {
  return [...tasks].sort((a, b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0));
}

export function formatTime(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatDateTime(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function connectionMessage(error, nextDelayMs) {
  const retry = nextDelayMs ? ` ${Math.round(nextDelayMs / 1000)}초 후 다시 확인합니다.` : "";
  switch (error?.kind) {
    case "auth":
      return { state: "login", text: "로그인이 필요합니다." };
    case "forbidden":
      return { state: "error", text: `이 계정에는 브라우저 작업을 볼 권한이 없습니다.${retry}` };
    case "server":
      return { state: "error", text: `OHVIS 서버에 일시적인 문제가 있습니다.${retry}` };
    case "network":
      return { state: "error", text: `네트워크에 연결할 수 없습니다.${retry}` };
    default:
      return { state: "error", text: `알 수 없는 오류가 발생했습니다.${retry}` };
  }
}

export function actionErrorMessage(error, action) {
  if (error?.kind === "auth") return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
  if (error?.kind === "forbidden") return `${action} 권한이 없는 계정입니다.`;
  if (error?.kind === "not_found") return "이미 처리되었거나 만료된 요청입니다.";
  if (error?.kind === "conflict") return "승인 또는 로그인이 먼저 필요한 작업이라 다시 시도할 수 없습니다.";
  if (error?.kind === "network") return "네트워크 오류로 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  return `${action} 중 오류가 발생했습니다.`;
}

export function frameImageSrc(frame) {
  if (!frame) return "";
  const media = String(frame.media_type || "image/jpeg").toLowerCase();
  const b64 = typeof frame.frame_base64 === "string" ? frame.frame_base64 : "";
  if (b64 && /^image\/(jpeg|png|webp)$/.test(media) && /^[A-Za-z0-9+/=\s]+$/.test(b64)) {
    return `data:${media};base64,${b64.replace(/\s+/g, "")}`;
  }
  const url = typeof frame.frame_url === "string" ? frame.frame_url : "";
  if (url.startsWith(`${BASE_URL}/`)) return url;
  return "";
}
