"use client";
/**
 * 서버별 러너 작업 현황 — 작업/로그 탭 상단 카드.
 *
 * 2026-09-12 에 GO100 러너가 인증 실패로 6시간 동안 37건을 실패시켰는데,
 * 현황을 보여주는 곳이 없어 아무도 알아차리지 못했다. "어느 서버가 막혔나"를
 * 한눈에 보이게 하는 것이 이 카드의 목적이다.
 */
import { useCallback, useEffect, useState } from "react";
import { BASE_URL, authHdrs } from "./api";
import styles from "./RunnerHostStatus.module.css";

type ServerRow = {
  host: string;
  label?: string;
  aliases?: string[];
  running: number;
  done: number;
  error: number;
  cancelled: number;
  other: number;
  oldest_running_sec: number;
  projects: string[];
  alive: boolean | null;
  seen_ago_sec: number | null;
  engine_mode?: string;
  queued?: number;
  queued_shared?: boolean;
  max_concurrent?: number | null;
};

export type Payload = {
  window_hours: number;
  servers: ServerRow[];
  totals: { queued?: number; hosts: number; running: number; error: number; done: number; cancelled: number };
};

const ERROR_WARN = 5;
const ERROR_ALERT = 15;

function elapsed(sec: number): string {
  if (!sec || sec <= 0) return "-";
  if (sec < 60) return `${sec}초`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분`;
  return `${Math.floor(sec / 3600)}시간 ${Math.floor((sec % 3600) / 60)}분`;
}

function errorTone(n: number): string {
  if (n >= ERROR_ALERT) return "#ef4444";
  if (n >= ERROR_WARN) return "#f59e0b";
  return "var(--ct-text)";
}

const QUEUE_HELP = "서버 배정 전 줄 선 작업. 주 서버가 꽉 차면 보조 서버로 넘어갑니다";
const HOST_ALIASES: Record<string, string> = {
  vmi3267555: "contabo116",
  "rfree-0009": "cafe24_114",
  "rfree-0009.cafe24.com": "cafe24_114",
};

function mergeServers(rows: ServerRow[]): ServerRow[] {
  const merged = new Map<string, ServerRow>();
  for (const row of rows) {
    const host = HOST_ALIASES[row.host] ?? row.host;
    const aliases = [...new Set([row.host, ...(row.aliases ?? [])])];
    const previous = merged.get(host);
    if (!previous) {
      merged.set(host, { ...row, host, aliases });
      continue;
    }
    merged.set(host, {
      ...previous,
      label: previous.label || row.label,
      aliases: [...new Set([...(previous.aliases ?? []), ...aliases])],
      running: previous.running + row.running,
      done: previous.done + row.done,
      error: previous.error + row.error,
      cancelled: previous.cancelled + row.cancelled,
      other: previous.other + row.other,
      queued: previous.queued == null && row.queued == null ? undefined : (previous.queued ?? 0) + (row.queued ?? 0),
      queued_shared: previous.queued_shared || row.queued_shared,
      max_concurrent: previous.max_concurrent == null && row.max_concurrent == null ? undefined : Math.max(previous.max_concurrent ?? 0, row.max_concurrent ?? 0),
      oldest_running_sec: Math.max(previous.oldest_running_sec, row.oldest_running_sec),
      projects: [...new Set([...previous.projects, ...row.projects])],
      alive: previous.alive === true || row.alive === true ? true : previous.alive ?? row.alive,
      seen_ago_sec: previous.seen_ago_sec == null ? row.seen_ago_sec : row.seen_ago_sec == null ? previous.seen_ago_sec : Math.min(previous.seen_ago_sec, row.seen_ago_sec),
    });
  }
  return [...merged.values()];
}

function RunningBadge({ running, limit }: { running: number; limit?: number | null }) {
  const className = limit != null && running >= limit ? styles.runningFull : running > 0 ? styles.runningActive : styles.runningIdle;
  return <span className={className} title={limit != null ? "러너가 보고한 동시 실행 상한" : undefined}>
    {running > 0 && <span className={styles.runningDot} aria-hidden="true" />}실행 {running}{limit !== undefined ? `/${limit ?? "—"}` : ""}
  </span>;
}

export default function RunnerHostStatus({ emphasis = "running" }: { emphasis?: "running" | "error" }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/pipeline/runner/status?window_hours=1`, { headers: authHdrs() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as Payload);
      setErr("");
    } catch (e) {
      // 현황 카드가 실패해도 탭 본문은 그대로 보여야 한다.
      setErr(e instanceof Error ? e.message : "조회 실패");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  if (err && !data) return null;
  if (!data || data.servers.length === 0) return null;

  return <RunnerHostStatusView data={data} open={open} onToggle={() => setOpen((v) => !v)} emphasis={emphasis} />;
}

export function RunnerHostStatusView({ data, open = true, onToggle, emphasis = "running" }: {
  data: Payload;
  open?: boolean;
  onToggle?: () => void;
  emphasis?: "running" | "error";
}) {
  const successTitle = `최근 ${data.window_hours}시간 기준 성공 작업 수`;
  const t = data.totals;
  const servers = mergeServers(data.servers);
  const worst = Math.max(0, ...servers.map((s) => s.error));

  return (
    <div style={{
      border: "1px solid var(--ct-border)",
      borderRadius: 8,
      background: "var(--ct-card)",
      marginBottom: 10,
      overflow: "hidden",
    }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8,
          padding: "8px 10px", background: "transparent", border: "none",
          cursor: "pointer", color: "var(--ct-text)", fontSize: 12, textAlign: "left",
        }}
      >
        <span style={{ fontSize: 10, opacity: 0.6 }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontWeight: 700 }}>러너 {t.hosts}대</span>
        <RunningBadge running={t.running} />
        <span title={QUEUE_HELP} style={{ color: "var(--ct-text)", fontWeight: (t.queued ?? 0) > 0 ? 700 : 400 }}>대기 {t.queued ?? "—"}</span>
        <span title={successTitle} style={{ color: t.done > 0 ? "var(--ct-success, #4ade80)" : "var(--ct-text)" }}>성공 {t.done}</span>
        <span style={{ color: errorTone(worst), fontWeight: worst >= ERROR_WARN ? 700 : 400 }}>
          실패 {t.error}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ct-text2)" }}>
          최근 {data.window_hours}시간
        </span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--ct-border)" }}>
          {servers.map((s) => {
            const dead = s.alive === false;
            return (
              <div key={s.host} style={{
                display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8,
                padding: "7px 10px", fontSize: 11, minHeight: 44, boxSizing: "border-box",
                borderTop: "1px solid var(--ct-border)",
              }}>
                <span title={dead ? `하트비트 ${elapsed(s.seen_ago_sec || 0)} 전` : "가동 중"}
                      style={{ color: dead ? "#ef4444" : s.alive ? "#22c55e" : "var(--ct-text2)" }}>
                  ●
                </span>
                <span title={`실제 호스트명: ${(s.aliases ?? [s.host]).join(", ")}`} style={{ fontWeight: 600, minWidth: 92, overflowWrap: "anywhere" }}>{s.label || s.host}</span>
                <RunningBadge running={s.running} limit={s.max_concurrent ?? null} />
                <span title={QUEUE_HELP + (s.queued_shared ? " · 이 대기는 같은 프로젝트를 받는 다른 서버와 공유됩니다(합계에는 한 번만 셈)" : "")}
                      style={{ color: "var(--ct-text)", fontWeight: (s.queued ?? 0) > 0 ? 700 : 400 }}>대기 {s.queued ?? "—"}{s.queued_shared ? " (공유)" : ""}</span>
                <span title={successTitle} style={{ color: s.done > 0 ? "var(--ct-success, #4ade80)" : "var(--ct-text)" }}>성공 {s.done}</span>
                <span style={{ color: errorTone(s.error), fontWeight: s.error >= ERROR_WARN ? 700 : 400, minWidth: 54 }}>
                  실패 {s.error}
                </span>
                {emphasis === "running" && s.oldest_running_sec > 0 && (
                  <span style={{ color: "var(--ct-text2)" }}>최장 {elapsed(s.oldest_running_sec)}</span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ct-text2)", overflowWrap: "anywhere" }}>
                  {s.projects.join(", ")}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
