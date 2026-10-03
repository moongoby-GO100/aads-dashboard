// /chat 주소의 hash 는 세션 ID 이고, 목표 패널 딥링크는 아래 두 형식을 받는다.
//   /chat?goal=<uuid>#<session_id>
//   /chat#<session_id>?goal=<uuid>
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function asGoalUuid(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return UUID_RE.test(v) ? v : null;
}

export function parseChatHash(hash: string): { sessionId: string; goalId: string | null } {
  const raw = (hash ?? "").replace(/^#/, "");
  const q = raw.indexOf("?");
  const sessionId = (q < 0 ? raw : raw.slice(0, q)).trim();
  const goalId = q < 0 ? null : asGoalUuid(new URLSearchParams(raw.slice(q + 1)).get("goal"));
  return { sessionId, goalId };
}

export function chatHashSessionId(hash: string): string {
  return parseChatHash(hash).sessionId;
}

// query 의 goal 이 우선하고, 없으면 hash 안의 goal 을 쓴다. 잘못된 값은 null.
export function parseGoalDeepLink(search: string, hash: string): string | null {
  const fromQuery = asGoalUuid(new URLSearchParams(search ?? "").get("goal"));
  return fromQuery ?? parseChatHash(hash).goalId;
}

// goal 파라미터만 제거한 pathname+search+hash. 바뀔 것이 없으면 null.
export function stripGoalFromUrl(pathname: string, search: string, hash: string): string | null {
  const params = new URLSearchParams(search ?? "");
  const hadQueryGoal = params.has("goal");
  params.delete("goal");

  const rawHash = (hash ?? "").replace(/^#/, "");
  const q = rawHash.indexOf("?");
  let nextHash = rawHash;
  let hadHashGoal = false;
  if (q >= 0) {
    const hashParams = new URLSearchParams(rawHash.slice(q + 1));
    hadHashGoal = hashParams.has("goal");
    hashParams.delete("goal");
    const rest = hashParams.toString();
    nextHash = rawHash.slice(0, q) + (rest ? `?${rest}` : "");
  }
  if (!hadQueryGoal && !hadHashGoal) return null;

  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${nextHash ? `#${nextHash}` : ""}`;
}
