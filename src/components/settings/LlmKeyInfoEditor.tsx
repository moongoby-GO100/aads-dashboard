"use client";
import { useState } from "react";
import { api } from "@/lib/api";

/** LLM 계정 등록정보 편집 — 표시 이름(label)·순위(priority)·메모(notes)만 바꾼다.
 *  키 값(value)은 시크릿이라 이 화면에서 다루지 않는다.
 *  key_name 은 서버 환경변수·로그인 슬롯 이름, provider 는 구독 슬롯의 CLI 회사라
 *  바꾸면 연결·라우팅이 깨지므로 읽기 전용으로 보여 주기만 한다. */

export type KeyInfo = {
  id?: number | null;
  key_name: string;
  provider: string;
  label: string | null;
  priority: number | null;
  notes: string | null;
  kind: "subscription" | "apikey";
};

export type KeyInfoDraft = { label: string; priority: string; notes: string };
export type KeyInfoPatch = Partial<{ label: string; priority: number; notes: string }>;
export type SaveResult = { ok: true } | { ok: false; error: string };

export const KEY_NAME_REASON = "서버 환경변수·로그인 슬롯 이름이라 바꾸면 연결이 끊깁니다";
export const SUBSCRIPTION_PROVIDER_REASON = "로그인한 CLI 회사가 정해서 바꿀 수 없습니다";
export const API_PROVIDER_REASON = "회사 변경은 이 화면에서 지원하지 않습니다";

export const toDraft = (k: Pick<KeyInfo, "label" | "priority" | "notes">): KeyInfoDraft => ({
  label: k.label ?? "", priority: k.priority == null ? "" : String(k.priority), notes: k.notes ?? "",
});

/** 순위 입력 검증. 1 이상 정수만 통과. */
export function parsePriority(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/** 원본과 달라진 필드만 담는다. 이름·메모는 앞뒤 공백을 제거한 값으로 비교·전송한다. */
export function buildKeyInfoPatch(original: KeyInfoDraft, draft: KeyInfoDraft): KeyInfoPatch {
  const patch: KeyInfoPatch = {};
  const label = draft.label.trim();
  if (label !== original.label.trim()) patch.label = label;
  const notes = draft.notes.trim();
  if (notes !== original.notes.trim()) patch.notes = notes;
  const p = parsePriority(draft.priority);
  if (p !== null && p !== parsePriority(original.priority)) patch.priority = p;
  return patch;
}

/** 서버 오류를 한국어 안내로. detail 은 가공하지 않고 그대로 붙인다. */
export function describeSaveError(e: unknown): string {
  const raw = e instanceof Error ? e.message : "";
  const m = /^API error (\d+): ([\s\S]*)$/.exec(raw);
  const status = (e as { status?: number } | null)?.status ?? (m ? Number(m[1]) : undefined);
  let detail = m ? m[2] : raw;
  if (m) {
    try {
      const d = JSON.parse(m[2])?.detail;
      if (typeof d === "string") detail = d;
      else if (d != null) detail = JSON.stringify(d);
    } catch { /* 본문이 JSON 이 아니면 그대로 쓴다 */ }
  }
  if (status === 403) return "CEO 로그인 세션에서만 변경할 수 있습니다";
  if (status === 400 || status === 409) return `저장하지 못했습니다 (순위 중복 등 입력값 확인) — ${detail}`;
  return `저장하지 못했습니다${detail ? ` — ${detail}` : ""}`;
}

/** 검증 → 바뀐 필드만 PUT. 성공/실패를 값으로 돌려줘 화면이 폼 유지 여부를 정한다. */
export async function saveKeyInfo(args: {
  original: KeyInfoDraft;
  draft: KeyInfoDraft;
  resolveId: () => Promise<number>;
  update: (id: number, patch: KeyInfoPatch) => Promise<unknown>;
}): Promise<SaveResult> {
  const { original, draft, resolveId, update } = args;
  if (parsePriority(draft.priority) === null) return { ok: false, error: "순위는 1 이상의 정수로 입력하세요" };
  const patch = buildKeyInfoPatch(original, draft);
  if (Object.keys(patch).length === 0) return { ok: false, error: "바뀐 내용이 없습니다" };
  try {
    const id = await resolveId();
    await update(id, patch);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: describeSaveError(e) };
  }
}

const inputStyle = { background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)", minHeight: 32 };
const btnStyle = { minHeight: 32, minWidth: 56 };

function ReadOnlyField({ title, value, reason }: { title: string; value: string; reason: string }) {
  return (
    <div className="min-w-0">
      <p style={{ color: "var(--text-secondary)" }}>{title} <span style={{ opacity: 0.7 }}>(읽기 전용)</span></p>
      <p className="font-mono break-all" style={{ color: "var(--text-primary)" }} data-readonly={title}>{value}</p>
      <p style={{ color: "var(--text-secondary)" }}>{reason}</p>
    </div>
  );
}

export default function LlmKeyInfoEditor({ info, resolveId, onSaved, onCancel }: {
  info: KeyInfo;
  resolveId: () => Promise<number>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const original = toDraft(info);
  const [draft, setDraft] = useState<KeyInfoDraft>(original);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const changed = Object.keys(buildKeyInfoPatch(original, draft)).length > 0;
  const set = (k: keyof KeyInfoDraft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    const r = await saveKeyInfo({
      original, draft,
      resolveId: info.id != null ? async () => info.id as number : resolveId,
      update: (id, patch) => (api as any).updateLlmKey(id, patch),
    });
    setBusy(false);
    if (r.ok) onSaved(); else setErr(r.error);
  };

  return (
    <div className="rounded-lg p-3 space-y-2 text-xs" data-testid="key-info-editor"
      style={{ border: "1px solid var(--border)", background: "var(--bg-primary)" }}>
      <p className="font-bold" style={{ color: "var(--text-primary)" }}>등록정보 수정</p>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <ReadOnlyField title="키 이름" value={info.key_name} reason={KEY_NAME_REASON} />
        <ReadOnlyField title="회사(provider)" value={info.provider}
          reason={info.kind === "subscription" ? SUBSCRIPTION_PROVIDER_REASON : API_PROVIDER_REASON} />
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <label className="block min-w-0">
          <span style={{ color: "var(--text-secondary)" }}>표시 이름·계정 메모 (이메일 등)</span>
          <input value={draft.label} onChange={set("label")} disabled={busy} maxLength={200}
            className="w-full rounded px-2 py-1.5 mt-0.5" style={inputStyle} placeholder="비워 두어도 됩니다" />
        </label>
        <label className="block min-w-0">
          <span style={{ color: "var(--text-secondary)" }}>순위 (1 이상 정수)</span>
          <input value={draft.priority} onChange={set("priority")} disabled={busy} inputMode="numeric"
            className="w-full rounded px-2 py-1.5 mt-0.5" style={inputStyle} />
        </label>
      </div>
      <label className="block">
        <span style={{ color: "var(--text-secondary)" }}>메모</span>
        <textarea value={draft.notes} onChange={set("notes")} disabled={busy} rows={2}
          className="w-full rounded px-2 py-1.5 mt-0.5" style={inputStyle} />
      </label>
      {err && <p role="alert" style={{ color: "#dc2626" }}>{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void submit()} disabled={busy || !changed}
          className="px-3 rounded font-bold" data-testid="key-info-save"
          style={{ ...btnStyle, background: "var(--accent, #2563eb)", color: "#fff", opacity: busy || !changed ? 0.5 : 1 }}>
          {busy ? "저장 중..." : "저장"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}
          className="px-3 rounded" style={{ ...btnStyle, border: "1px solid var(--border)", color: "var(--text-primary)" }}>
          취소
        </button>
      </div>
    </div>
  );
}
