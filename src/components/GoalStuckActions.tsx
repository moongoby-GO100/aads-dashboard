"use client";

// 막힘·답했으나 진행 없음·담당 없음 마일스톤의 "다시 보내기" / "담당 지정" 버튼.
// 목표 띠 드롭다운 펼침과 목표 패널이 함께 쓴다. 실패는 같은 자리에 문구와 재시도 버튼으로 남긴다.
import React, { useState } from "react";
import { api } from "@/lib/api";
import { ownerAssignFailureText, redispatchFailure, redispatchSuccessText } from "@/lib/goalStrip";

export interface StuckOwnerOption {
  session_id: string;
  title?: string | null;
  role_key?: string | null;
  is_lead?: boolean;
}

interface Failure { text: string; retry: "redispatch" | "owner"; owner?: StuckOwnerOption }

export interface StuckState {
  busy: "redispatch" | "owner" | null;
  notice: string;
  failure: Failure | null;
  picking: boolean;
}

export const INITIAL_STUCK_STATE: StuckState = { busy: null, notice: "", failure: null, picking: false };

type StuckApi = Pick<typeof api, "redispatchMilestone" | "setMilestoneOwner">;

export interface StuckHandlerConfig {
  goalId: string;
  milestoneId: string;
  apiClient: StuckApi;
  patch: (p: Partial<StuckState>) => void;
  onChanged?: () => unknown;
  /** 이 자리에서 담당을 고를 수 있으면 true. 아니면 onNeedOwner 로 담당 지정 화면을 연다. */
  hasPicker: boolean;
  onNeedOwner?: () => void;
}

/** 훅 없이 상태 변경 함수만 받아 동작을 만든다 (테스트에서 직접 호출). */
export function createStuckHandlers(cfg: StuckHandlerConfig) {
  const { goalId, milestoneId, apiClient, patch } = cfg;

  const refresh = async () => { try { await cfg.onChanged?.(); } catch { /* 새로고침 실패는 다음 주기 갱신에 맡긴다 */ } };

  const redispatch = async () => {
    patch({ busy: "redispatch", notice: "", failure: null });
    try {
      const r = await apiClient.redispatchMilestone(milestoneId);
      patch({ busy: null, notice: redispatchSuccessText(Boolean(r?.goal_paused)), failure: null, picking: false });
      await refresh();
    } catch (e) {
      const out = redispatchFailure(e);
      if (out.kind === "no_target") {
        patch({ busy: null, notice: "", failure: { text: out.text, retry: "redispatch" }, picking: cfg.hasPicker });
      } else if (out.kind === "not_in_progress") {
        patch({ busy: null, notice: out.text, failure: null });
        await refresh();
      } else {
        patch({ busy: null, notice: "", failure: { text: out.text, retry: "redispatch" } });
      }
    }
  };

  const assign = async (owner: StuckOwnerOption) => {
    patch({ busy: "owner", notice: "", failure: null });
    try {
      await apiClient.setMilestoneOwner(goalId, milestoneId, owner.session_id, owner.role_key || undefined);
      patch({ busy: null, notice: "담당을 지정했습니다. 이어서 ‘다시 보내기’를 눌러 주세요.", failure: null, picking: false });
      await refresh();
    } catch (e) {
      patch({ busy: null, notice: "", failure: { text: ownerAssignFailureText(e), retry: "owner", owner }, picking: true });
    }
  };

  const retry = (failure: Failure) => (failure.retry === "owner" && failure.owner ? assign(failure.owner) : redispatch());

  const openAssign = (picking: boolean) => {
    if (cfg.hasPicker) patch({ picking: !picking, failure: null });
    else cfg.onNeedOwner?.();
  };

  return { redispatch, assign, retry, openAssign };
}

export function ownerOptionLabel(o: StuckOwnerOption): string {
  const name = (o.title || "").trim() || (o.role_key || "").trim() || "이름 없는 세션";
  return `${o.is_lead ? "👑 " : ""}${name}`;
}

const TOUCH = 44;
const btn: React.CSSProperties = {
  minHeight: TOUCH, minWidth: TOUCH, padding: "0 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
  cursor: "pointer", whiteSpace: "nowrap",
};

export function OwnerPicker({ owners, busy, onPick }: {
  owners: readonly StuckOwnerOption[]; busy: boolean; onPick: (o: StuckOwnerOption) => void;
}) {
  if (owners.length === 0) {
    return (
      <div role="status" style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.5, color: "var(--ct-text2, var(--text-secondary))" }}>
        이 목표에 연결된 세션이 없습니다. 먼저 목표 화면에서 담당 세션을 연결해 주세요.
      </div>
    );
  }
  return (
    <div role="listbox" aria-label="담당으로 지정할 세션" style={{ marginTop: 6, display: "grid", gap: 6 }}>
      {owners.map((o) => (
        <button key={o.session_id} type="button" role="option" aria-selected={false} disabled={busy} onClick={() => onPick(o)}
          style={{ ...btn, textAlign: "left", fontWeight: 600, border: "1px solid var(--ct-border, var(--border))",
                   background: "transparent", color: "var(--ct-text, var(--text-primary))" }}>
          {ownerOptionLabel(o)}
        </button>
      ))}
    </div>
  );
}

export function MilestoneStuckActions({ goalId, milestoneId, owners, onChanged, onNeedOwner }: {
  goalId: string;
  milestoneId: string;
  /** 주면 이 자리에서 담당을 고른다. 안 주면 담당 지정 버튼이 onNeedOwner 를 부른다. */
  owners?: readonly StuckOwnerOption[];
  onChanged?: () => unknown;
  onNeedOwner?: () => void;
}) {
  const [st, setSt] = useState<StuckState>(INITIAL_STUCK_STATE);
  const h = createStuckHandlers({
    goalId, milestoneId, apiClient: api, hasPicker: Boolean(owners), onChanged, onNeedOwner,
    patch: (p) => setSt((s) => ({ ...s, ...p })),
  });
  const busy = st.busy !== null;

  return (
    <div data-stuck-actions style={{ marginTop: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" disabled={busy} onClick={() => void h.redispatch()}
          style={{ ...btn, border: 0, background: busy ? "var(--ct-border, var(--border))" : "#2563eb", color: "#fff" }}>
          {st.busy === "redispatch" ? "보내는 중…" : "다시 보내기"}
        </button>
        <button type="button" disabled={busy} aria-expanded={owners ? st.picking : undefined} onClick={() => h.openAssign(st.picking)}
          style={{ ...btn, border: "1px solid var(--ct-border, var(--border))", background: "transparent", color: "var(--ct-text, var(--text-primary))" }}>
          {st.busy === "owner" ? "지정 중…" : "담당 지정"}
        </button>
      </div>
      {st.failure && (
        <div role="alert" style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, border: "1px solid #dc2626", color: "#dc2626", fontSize: 11.5, lineHeight: 1.5 }}>
          {st.failure.text}
          <div style={{ marginTop: 6 }}>
            <button type="button" disabled={busy} onClick={() => void h.retry(st.failure as Failure)}
              style={{ ...btn, border: 0, background: "#dc2626", color: "#fff" }}>
              재시도
            </button>
          </div>
        </div>
      )}
      {st.notice && (
        <div role="status" style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.5, color: "#16a34a" }}>{st.notice}</div>
      )}
      {owners && st.picking && <OwnerPicker owners={owners} busy={busy} onPick={(o) => void h.assign(o)} />}
    </div>
  );
}
