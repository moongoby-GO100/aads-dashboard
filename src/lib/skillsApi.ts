// 스킬 관리 API. 로그인한 사용자 본인 토큰만 보낸다. 권한 판정은 서버(403)가 한다.
import { getAuthHeaders, handle401Redirect } from "@/lib/api";
import type { SkillApiFailure } from "@/lib/skillCatalog";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://aads.newtalk.kr/api/v1";
const ROOT = "/ohvis/harness/skills";

export type SkillCallResult<T> = { ok: true; data: T } | ({ ok: false } & SkillApiFailure);

function failureFrom(status: number, body: unknown): SkillApiFailure {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as { code?: unknown; message?: unknown };
    return { status, code: typeof d.code === "string" ? d.code : "", message: typeof d.message === "string" ? d.message : "" };
  }
  return { status, code: "", message: typeof detail === "string" ? detail : "" };
}

async function skillsCall<T>(path: string, init?: { method?: string; body?: unknown }): Promise<SkillCallResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: init?.method ?? "GET",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return { ok: false, status: 0, code: "network", message: "" };
  }
  if (res.status === 401) {
    handle401Redirect();
    return { ok: false, status: 401, code: "unauthorized", message: "" };
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { ok: false, ...failureFrom(res.status, body) };
  }
  try {
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: res.status, code: "invalid_response", message: "" };
  }
}

const enc = encodeURIComponent;

export const skillsApi = {
  list: () => skillsCall<unknown>(ROOT),
  detail: (skillId: string) => skillsCall<unknown>(`${ROOT}/${enc(skillId)}`),
  execute: (skillId: string, body: unknown) =>
    skillsCall<unknown>(`${ROOT}/${enc(skillId)}/execute`, { method: "POST", body }),
  validate: (skillId: string, version: string) =>
    skillsCall<unknown>(`${ROOT}/${enc(skillId)}/versions/${enc(version)}/validate`, { method: "POST" }),
  promote: (skillId: string, version: string, body: unknown) =>
    skillsCall<unknown>(`${ROOT}/${enc(skillId)}/versions/${enc(version)}/promote`, { method: "POST", body }),
  rollback: (skillId: string, body: unknown) =>
    skillsCall<unknown>(`${ROOT}/${enc(skillId)}/rollback`, { method: "POST", body }),
  disable: (skillId: string) => skillsCall<unknown>(`${ROOT}/${enc(skillId)}`, { method: "DELETE" }),
};
