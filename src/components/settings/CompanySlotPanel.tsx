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
  slot: string;
}

interface AccountRow {
  slot: string;
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

  const assign = async (row: CompanyRow, slot: string) => {
    setSaving(row.project_key);
    const previous = row.slot;
    // 낙관적 반영 — 실패하면 되돌린다. 표가 길어 스크롤이 움직이면 어디를
    // 바꿨는지 놓친다.
    setCompanies((prev) => prev.map((c) =>
      c.project_key === row.project_key ? { ...c, slot } : c));
    try {
      await api.setCompanySlot(row.project_key, slot || null);
      const label = accounts.find((a) => a.slot === slot)?.label;
      flash(slot
        ? `${row.project_key} → ${label ?? `슬롯 ${slot}`} 배정했습니다`
        : `${row.project_key} 배정을 해제했습니다 (자동 순서)`);
    } catch (e) {
      setCompanies((prev) => prev.map((c) =>
        c.project_key === row.project_key ? { ...c, slot: previous } : c));
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

  const assignedCount = companies.filter((c) => c.slot).length;

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        회사마다 먼저 쓸 Claude 계정을 정합니다. <b>우선이지 전용이 아닙니다</b> —
        배정한 계정이 한도에 걸리면 배정 없는 계정으로 내려갑니다.
        <span className="ml-1">자동은 우선순위 순서(현재 {accounts.map((a) => a.label).join(" → ") || "-"})입니다.</span>
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
      <div className="space-y-1.5" style={{ minWidth: 560 }}>
        {shown.map((row) => (
          <div
            key={row.project_key}
            className="rounded-lg px-3 py-2"
            style={{
              background: "var(--bg-secondary)", border: "1px solid var(--border)",
              display: "grid", gridTemplateColumns: "104px minmax(120px,1fr) 56px 210px",
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
              background: row.slot ? "var(--accent)" : "transparent",
              color: row.slot ? "#fff" : "transparent",
              textAlign: "center",
            }}>
              배정됨
            </span>
            <select
              value={row.slot ?? AUTO}
              disabled={saving === row.project_key}
              onChange={(e) => void assign(row, e.target.value)}
              className="text-xs rounded px-2 py-1.5 w-full"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            >
              <option value={AUTO}>자동 (배정 없음)</option>
              {accounts.map((a) => (
                <option key={a.slot} value={a.slot}>
                  슬롯 {a.slot} · {a.label}
                  {a.last_resort ? " (최후 수단)" : ""}
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
