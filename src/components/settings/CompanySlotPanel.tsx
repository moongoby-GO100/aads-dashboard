"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";

/** 회사별 계정(슬롯) 배정.
 *
 * "이 회사는 내 계정으로" 가 대표님이 실제로 하시는 판단이라, 화면은 슬롯이
 * 아니라 회사를 기준으로 고른다. 저장 구조는 슬롯→회사 이고 뒤집는 일은
 * 서버(app/services/slot_projects.py:set_company_slot)가 한다 — 화면에서
 * 뒤집으면 한 회사가 두 슬롯에 걸린 채 저장되는 순간이 생긴다.
 *
 * 배정은 **우선이지 전용이 아니다.** 배정한 계정이 한도에 걸리면 배정 없는
 * 계정으로 내려간다. 일이 멈추지 않는 쪽을 택한 것이므로 화면도 그렇게
 * 설명한다 — "전용" 으로 읽으면 한도 소진 때 남의 계정이 쓰인 것을 사고로
 * 오해한다.
 */

interface CompanyRow {
  project_key: string;
  name: string;
  slot?: string;
  assignments?: Partial<Record<SubscriptionProvider, string>>;
}

type SubscriptionProvider = "anthropic" | "codex";

interface AccountRow {
  slot: string;
  provider: SubscriptionProvider;
  account: string;
  label: string;
  key_name: string;
  priority: number;
  last_resort: boolean;
  rate_limited: boolean;
}

const AUTO = "";

export default function CompanySlotPanel() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.getCompanySlots();
      setCompanies(res?.companies ?? []);
      setAccounts(res?.accounts ?? []);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "배정 현황을 읽지 못했습니다");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  const assign = async (row: CompanyRow, provider: SubscriptionProvider, account: string) => {
    const savingKey = `${row.project_key}:${provider}`;
    setSaving(savingKey);
    const previous = row.assignments?.[provider] ?? (provider === "anthropic" ? row.slot ?? "" : "");
    // 낙관적 반영 — 실패하면 되돌린다. 표가 길어 스크롤이 움직이면 어디를
    // 바꿨는지 놓친다.
    setCompanies((prev) => prev.map((c) =>
      c.project_key === row.project_key
        ? { ...c, assignments: { ...(c.assignments ?? {}), [provider]: account } }
        : c));
    try {
      await api.setCompanySlot(row.project_key, provider, account || null);
      const label = accounts.find((a) => a.provider === provider && a.account === account)?.label;
      const providerLabel = provider === "anthropic" ? "Claude" : "Codex";
      flash(account
        ? `${row.project_key} → ${providerLabel} ${label ?? account} 배정했습니다`
        : `${row.project_key} ${providerLabel} 배정을 해제했습니다 (자동 순서)`);
    } catch (e) {
      setCompanies((prev) => prev.map((c) =>
        c.project_key === row.project_key
          ? { ...c, assignments: { ...(c.assignments ?? {}), [provider]: previous } }
          : c));
      setErr(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving("");
    }
  };

  const shown = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return companies;
    return companies.filter((c) =>
      c.project_key.includes(q) || (c.name || "").toUpperCase().includes(q));
  }, [companies, query]);

  const accountGroups = useMemo(() => ({
    anthropic: accounts.filter((a) => a.provider === "anthropic"),
    codex: accounts.filter((a) => a.provider === "codex"),
  }), [accounts]);

  const assignedCount = companies.reduce((count, company) => (
    count + (company.assignments?.anthropic || company.slot ? 1 : 0)
      + (company.assignments?.codex ? 1 : 0)
  ), 0);

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        회사마다 먼저 쓸 Claude·Codex 구독 계정을 각각 정합니다. <b>우선이지 전용이 아닙니다</b> —
        배정한 계정이 한도에 걸리면 배정 없는 계정으로 내려갑니다.
        <span className="ml-1">자동은 각 provider의 계정 우선순위 순서입니다.</span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="회사 검색 (이름 · 키)"
          className="text-xs rounded px-2 py-1.5 flex-1 min-w-[180px]"
          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        />
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {shown.length} / {companies.length} · 배정됨 {assignedCount}
        </span>
        <button
          onClick={() => void load()}
          className="text-xs px-2 py-1.5 rounded"
          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          새로고침
        </button>
      </div>

      {msg && <p className="text-xs" style={{ color: "var(--accent)" }}>{msg}</p>}
      {err && <p className="text-xs" style={{ color: "#ef4444" }}>{err}</p>}

      {/* 열을 grid 로 고정한다. 회사 이름 길이가 제각각이라 flex 로 두면
          드롭다운이 행마다 다른 자리에 서서 표가 들쑥날쑥해진다. */}
      <div className="space-y-1.5">
        {shown.map((row) => (
          <div
            key={row.project_key}
            className="rounded-lg px-3 py-2 grid grid-cols-1 md:grid-cols-[104px_minmax(120px,1fr)_56px_210px_230px]"
            style={{
              background: "var(--bg-secondary)", border: "1px solid var(--border)",
              gap: 12, alignItems: "center",
            }}
          >
            <span className="text-xs font-mono px-1.5 py-0.5 rounded truncate"
                  style={{ background: "var(--bg-primary)", color: "var(--text-secondary)", textAlign: "center" }}>
              {row.project_key}
            </span>
            <span className="text-sm min-w-0 truncate" style={{ color: "var(--text-primary)" }}>
              {row.name}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded" style={{
              background: (row.assignments?.anthropic || row.slot || row.assignments?.codex) ? "var(--accent)" : "transparent",
              color: (row.assignments?.anthropic || row.slot || row.assignments?.codex) ? "#fff" : "transparent",
              textAlign: "center",
            }}>
              배정됨
            </span>
            <select
              aria-label={`${row.project_key} Claude 계정`}
              value={row.assignments?.anthropic ?? row.slot ?? AUTO}
              disabled={saving === `${row.project_key}:anthropic`}
              onChange={(e) => void assign(row, "anthropic", e.target.value)}
              className="text-xs rounded px-2 py-1.5 w-full"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            >
              <option value={AUTO}>Claude 자동 (배정 없음)</option>
              {accountGroups.anthropic.map((a) => (
                <option key={a.account} value={a.account}>
                  슬롯 {a.slot} · {a.label}
                  {a.last_resort ? " (최후 수단)" : ""}
                  {a.rate_limited ? " · 한도정지" : ""}
                </option>
              ))}
            </select>
            <select
              aria-label={`${row.project_key} Codex 계정`}
              value={row.assignments?.codex ?? AUTO}
              disabled={saving === `${row.project_key}:codex`}
              onChange={(e) => void assign(row, "codex", e.target.value)}
              className="text-xs rounded px-2 py-1.5 w-full"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            >
              <option value={AUTO}>Codex 자동 (배정 없음)</option>
              {accountGroups.codex.map((a) => (
                <option key={a.account} value={a.account}>
                  {a.label}
                  {a.rate_limited ? " · 한도정지" : ""}
                </option>
              ))}
            </select>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {companies.length === 0 ? "회사 목록을 읽지 못했습니다." : "검색 결과가 없습니다."}
          </p>
        )}
      </div>
    </div>
  );
}
