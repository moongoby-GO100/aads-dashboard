/**
 * 채팅창 주소에서 세션 ID 를 꺼낸다.
 *
 * 2026-09-17 대표님 지시 — "주도가 등록 안 되어 있으면 내가 직접 세션링크를
 * 등록할 수 있게 해줘". 후보 목록은 이미 붙어 있는 세션이 있어야 채워지므로
 * 담당 0명인 목표는 목록이 비고 붙일 길이 없다. 주소를 그대로 받으면
 * 그 막다른 길이 사라진다.
 *
 * 서버 `app/routers/goals.py::resolve_session_ref` 와 **같은 규칙**이다.
 * 여기서 한 번 걸러 두는 이유는 오타를 서버까지 보내지 않기 위해서다 —
 * 잘못된 주소는 입력칸 옆에서 바로 알려 주는 편이 왕복 한 번보다 빠르다.
 * 규칙이 갈라지면 화면은 통과시키고 서버가 400 을 내는 상태가 되므로,
 * 한쪽을 고치면 반드시 다른 쪽도 같이 고쳐라.
 *
 * 받는 형태 — 대표님이 주소창에서 복사하시는 것 전부:
 *   https://aads.newtalk.kr/chat#<세션ID>
 *   https://aads.newtalk.kr/chat?session=<세션ID>
 *   /chat/<세션ID>
 *   <세션ID>
 */
const SESSION_UUID_RE =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

/**
 * 찾으면 소문자 세션 ID, 못 찾으면 빈 문자열.
 *
 * 맨 뒤 UUID 를 쓴다 — 워크스페이스 id 가 함께 붙는 주소에서도 세션 id 가
 * 뒤에 오기 때문이다(서버와 동일).
 */
export function extractSessionId(ref: string): string {
  const found = (ref || "").trim().match(SESSION_UUID_RE);
  if (!found || found.length === 0) return "";
  return found[found.length - 1].toLowerCase();
}

/** 입력칸 아래에 그대로 띄우는 안내문. 비어 있으면 통과. */
export const SESSION_REF_HINT =
  "링크에서 세션 ID를 찾지 못했습니다. 예: https://aads.newtalk.kr/chat#0a1b2c3d-…";
