"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";
import type { HandoverEntry, HandoverEvent } from "@/lib/api";

const PROJECTS = ["ALL", "AADS", "GO100", "KIS", "SF", "NTV2", "NAS", "FOOD", "CEO"];
const TYPES = ["all", "status", "decision", "task", "risk", "verification", "note"];
const STATUSES = ["active", "resolved", "superseded", "archived"];

const priorityColor: Record<string, string> = {
  P0: "bg-red-900 text-red-100",
  P1: "bg-orange-900 text-orange-100",
  P2: "bg-blue-900 text-blue-100",
  P3: "bg-slate-700 text-slate-100",
};

function displayDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", { hour12: false });
}

function sourceLabel(entry: HandoverEntry) {
  if (entry.source_kind === "session_auto") return "세션 자동저장";
  if (entry.source_kind === "markdown_import") return "Markdown 가져오기";
  return entry.source_kind || "수동 기록";
}

export default function HandoversPage() {
  const [project, setProject] = useState("ALL");
  const [status, setStatus] = useState("active");
  const [entryType, setEntryType] = useState("all");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [items, setItems] = useState<HandoverEntry[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [events, setEvents] = useState<HandoverEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.searchHandovers({ project, status, entryType, query: submittedQuery, limit: 200 });
      const next = response.items || [];
      setItems(next);
      setSelectedId((current) => next.some((item) => item.id === current) ? current : (next[0]?.id || ""));
      setError("");
      setUpdatedAt(new Date());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "핸드오버 원장을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [project, status, entryType, submittedQuery]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);

  useEffect(() => {
    if (!selectedId) { setEvents([]); return; }
    api.getHandoverEvents(selectedId)
      .then((response) => setEvents(response.items || []))
      .catch(() => setEvents([]));
  }, [selectedId, selected?.revision]);

  const autoCount = items.filter((item) => item.source_kind === "session_auto").length;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="🧾 글로벌 핸드오버 원장" />
      <div className="px-3 md:px-5 py-3 space-y-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2 py-1 rounded text-xs bg-emerald-900 text-emerald-100">DB 정본</span>
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            현재 {items.length}건 · 세션 자동저장 {autoCount}건 · {updatedAt ? `갱신 ${displayDate(updatedAt.toISOString())}` : "조회 중"}
          </span>
          <Link href="/docs" className="ml-auto px-3 py-1.5 rounded-lg text-xs" style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}>
            파일 문서 보기
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-[120px_130px_150px_1fr_auto] gap-2">
          <select value={project} onChange={(e) => setProject(e.target.value)} className="rounded-lg px-2 py-2 text-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {PROJECTS.map((value) => <option key={value} value={value}>{value === "ALL" ? "전체 프로젝트" : value}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg px-2 py-2 text-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={entryType} onChange={(e) => setEntryType(e.target.value)} className="rounded-lg px-2 py-2 text-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {TYPES.map((value) => <option key={value} value={value}>{value === "all" ? "전체 유형" : value}</option>)}
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setSubmittedQuery(query.trim()); }}
            placeholder="제목·본문·경로 검색"
            className="col-span-2 md:col-span-1 rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          />
          <button onClick={() => setSubmittedQuery(query.trim())} className="rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: "var(--accent)", color: "#fff" }}>검색</button>
        </div>
      </div>

      {error ? (
        <div className="m-4 rounded-lg border border-red-800 bg-red-950/40 p-5 text-sm text-red-200">
          <p>{error}</p>
          <button onClick={() => void load()} className="mt-3 px-3 py-1.5 rounded bg-red-800 text-white">다시 시도</button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[390px_1fr]">
          <div className="overflow-auto p-2 space-y-1" style={{ borderRight: "1px solid var(--border)" }}>
            {loading && !items.length ? (
              <div className="py-16 text-center text-sm" style={{ color: "var(--text-secondary)" }}>원장을 불러오는 중입니다.</div>
            ) : !items.length ? (
              <div className="py-16 text-center text-sm" style={{ color: "var(--text-secondary)" }}>조건에 맞는 핸드오버가 없습니다.</div>
            ) : items.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className="w-full text-left rounded-lg px-3 py-3 transition-colors"
                style={{ background: selectedId === item.id ? "var(--accent)" : "transparent", color: selectedId === item.id ? "#fff" : "var(--text-primary)" }}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${priorityColor[item.priority] || priorityColor.P2}`}>{item.priority}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-100">{item.project_key}</span>
                  <span className="text-xs opacity-75">r{item.revision}</span>
                  <span className="ml-auto text-xs opacity-70">{displayDate(item.updated_at)}</span>
                </div>
                <div className="mt-1.5 text-sm font-semibold line-clamp-2">{item.title}</div>
                <div className="mt-1 text-xs opacity-70 line-clamp-2">{item.summary || sourceLabel(item)}</div>
              </button>
            ))}
          </div>

          <div className="overflow-auto p-4 md:p-6">
            {!selected ? (
              <div className="py-20 text-center text-sm" style={{ color: "var(--text-secondary)" }}>좌측에서 핸드오버를 선택하십시오.</div>
            ) : (
              <div className="max-w-5xl mx-auto space-y-5">
                <section className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className={`text-xs px-2 py-1 rounded ${priorityColor[selected.priority] || priorityColor.P2}`}>{selected.priority}</span>
                    <span className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-100">{selected.project_key}</span>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{selected.entry_type} · {selected.status} · r{selected.revision}</span>
                    {selected.source_session_id && (
                      <Link href={`/chat#${selected.source_session_id}`} className="ml-auto text-xs underline" style={{ color: "var(--accent)" }}>원본 세션 열기</Link>
                    )}
                  </div>
                  <h2 className="mt-3 text-xl font-bold" style={{ color: "var(--text-primary)" }}>{selected.title}</h2>
                  <div className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {sourceLabel(selected)} · 갱신 {displayDate(selected.updated_at)} · 키 {selected.entry_key}
                  </div>
                </section>
                <section className="rounded-xl p-4 md:p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7" style={{ color: "var(--text-primary)" }}>{selected.body}</pre>
                </section>
                <section className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <h3 className="font-semibold text-sm mb-3">리비전 이력</h3>
                  <div className="space-y-2">
                    {events.length ? events.map((event) => (
                      <div key={event.id} className="flex gap-3 text-xs">
                        <span className="font-mono">r{event.revision}</span>
                        <span>{event.event_type}</span>
                        <span className="flex-1" style={{ color: "var(--text-secondary)" }}>{event.change_summary || "변경 기록"}</span>
                        <span style={{ color: "var(--text-secondary)" }}>{displayDate(event.created_at)}</span>
                      </div>
                    )) : <div className="text-xs" style={{ color: "var(--text-secondary)" }}>이력을 불러오지 못했거나 기록이 없습니다.</div>}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
