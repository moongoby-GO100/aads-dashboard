"use client";

/**
 * 무엇이 언제 바뀌었나 — 한 화면.
 *
 * 2026-09-14 신설. 그 전까지 이걸 볼 방법이 없었다.
 *
 * 규정(.claude/rules/flow-rules.md)은 기획→설계→실행→마무리 4단계 문서를
 * 요구하는데 실제 산출물은 FIND 0건 / LAYOUT 6건 / WRAP 3건이다. 같은 기간
 * 커밋 1,068건, 배포 430건이었다. 문서 절차는 사실상 돌지 않는다.
 *
 * 대신 기계가 남기는 기록은 빠짐없이 쌓인다 — 변경 원장 30일 4,725건.
 * 문서를 다시 강제하는 대신 그 기록을 보이게 한다.
 *
 * 대상 독자는 비전문가다. 파일 경로와 상태 코드를 그대로 늘어놓지 않고
 * "무엇을 고쳤고, 올라갔는가" 로 읽히게 한다.
 */

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import { api } from "@/lib/api";

interface ProjectRow {
  project: string;
  changes: number;
  files: number;
  deployed: number;
  uncommitted: number;
  commits: number;
}
interface DayRow {
  date: string;
  projects: ProjectRow[];
  changes: number;
  files: number;
  deployed: number;
  uncommitted: number;
}
interface DeployRow {
  id: number; project: string; sha: string; status: string;
  phase: string; date: string; at: string; error: string;
}
interface ChangeRow {
  date: string; at: string; project: string; file: string;
  status: string; summary: string; sha: string;
}
interface Digest {
  days: DayRow[];
  deploys: DeployRow[];
  recent: ChangeRow[];
  window_days: number;
}

// 상태 코드를 사람 말로. 원문을 같이 보여주지 않는다 — 대표가 읽는 화면이다.
const STATUS_LABEL: Record<string, string> = {
  deployed: "운영 반영됨",
  pushed: "올림 (배포 대기)",
  committed: "기록됨 (아직 안 올림)",
  dirty: "고쳤는데 기록 안 됨",
  reconciled_clean: "되돌려짐",
  superseded_owner: "다른 작업이 덮음",
  reverted: "취소됨",
};
const STATUS_TONE: Record<string, string> = {
  deployed: "#16a34a",
  pushed: "#2563eb",
  committed: "#2563eb",
  dirty: "#d97706",
  reconciled_clean: "#6b7280",
  superseded_owner: "#6b7280",
  reverted: "#6b7280",
};

const DEPLOY_LABEL: Record<string, string> = {
  success: "성공", failed: "실패", running: "진행 중",
  blocked: "막힘", superseded: "대체됨", rolled_back: "되돌림",
};

function weekday(iso: string): string {
  const d = new Date(`${iso}T00:00:00+09:00`);
  return ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
}

export default function ChangesPage() {
  const [data, setData] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [openDate, setOpenDate] = useState<string | null>(null);

  const load = useCallback(async (windowDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const r = (await api.getChangesDigest(windowDays)) as Digest;
      setData(r);
      setOpenDate((prev) => prev || r.days?.[0]?.date || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(days); }, [days, load]);

  const card: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 14,
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page, #0b0b0c)" }}>
      <Header title="변경 이력" />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 60px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>
          무엇이 언제 바뀌었나
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
          고친 파일, 기록 여부, 운영 반영까지 날짜별로 모아 보여줍니다.
          사람이 따로 적는 문서가 아니라 <b>작업하면서 자동으로 쌓인 기록</b>입니다.
        </p>

        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {[3, 7, 14, 30].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              style={{
                padding: "5px 12px", borderRadius: 8, fontSize: 12,
                border: "1px solid var(--border)",
                background: days === d ? "#2563eb" : "var(--bg-card)",
                color: days === d ? "#fff" : "var(--text-secondary)",
              }}>
              {d}일
            </button>
          ))}
          <button onClick={() => void load(days)}
            style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12,
                     border: "1px solid var(--border)", background: "var(--bg-card)",
                     color: "var(--text-secondary)" }}>
            새로고침
          </button>
        </div>

        {loading && <div style={{ ...card, color: "var(--text-secondary)" }}>불러오는 중...</div>}
        {error && <div style={{ ...card, color: "#ef4444" }}>{error}</div>}

        {!loading && !error && data && data.days.length === 0 && (
          <div style={{ ...card, color: "var(--text-secondary)" }}>
            이 기간에 기록된 변경이 없습니다.
          </div>
        )}

        {!loading && !error && data?.days.map((day) => {
          const deploys = data.deploys.filter((d) => d.date === day.date);
          const ok = deploys.filter((d) => d.status === "success").length;
          const bad = deploys.filter((d) => d.status === "failed" || d.status === "blocked").length;
          const isOpen = openDate === day.date;
          const changes = data.recent.filter((c) => c.date === day.date);

          return (
            <div key={day.date} style={{ ...card, marginBottom: 12 }}>
              <button
                onClick={() => setOpenDate(isOpen ? null : day.date)}
                style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>
                    {day.date} ({weekday(day.date)})
                  </span>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    파일 {day.files.toLocaleString()}개를 고쳤고,
                    {" "}{ok > 0 ? `${ok}번 운영에 올렸습니다` : "운영 반영은 없습니다"}
                    {bad > 0 && <b style={{ color: "#ef4444" }}> · 배포 실패 {bad}건</b>}
                  </span>
                </div>
                {day.uncommitted > 0 && (
                  <div style={{ fontSize: 12, color: "#d97706", marginTop: 4 }}>
                    고쳐놓고 기록되지 않은 변경 {day.uncommitted.toLocaleString()}건 —
                    이대로면 운영에 반영되지 않습니다
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                  {day.projects.map((p) => `${p.project} ${p.files}파일`).join(" · ")}
                  {" · "}{isOpen ? "접기" : "자세히"}
                </div>
              </button>

              {isOpen && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  {deploys.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                        운영 반영 ({deploys.length}건)
                      </div>
                      {deploys.slice(0, 12).map((d) => (
                        <div key={d.id} style={{ fontSize: 12, color: "var(--text-secondary)", padding: "2px 0" }}>
                          {d.at} · #{d.id} · <code>{d.sha}</code> ·{" "}
                          <span style={{ color: d.status === "success" ? "#16a34a" : d.status === "running" ? "#2563eb" : "#ef4444" }}>
                            {DEPLOY_LABEL[d.status] || d.status}
                          </span>
                          {d.error && <span style={{ color: "#ef4444" }}> — {d.error.slice(0, 70)}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                    고친 것 ({changes.length}건{changes.length >= 300 && " 이상"})
                  </div>
                  {changes.length === 0 && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      상세 목록은 최근 300건까지만 보관합니다.
                    </div>
                  )}
                  {changes.slice(0, 60).map((c, i) => (
                    <div key={`${c.file}-${i}`} style={{ padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{c.at}</span>
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999,
                                       border: `1px solid ${STATUS_TONE[c.status] || "#6b7280"}`,
                                       color: STATUS_TONE[c.status] || "#6b7280" }}>
                          {STATUS_LABEL[c.status] || c.status}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--text-primary)", wordBreak: "break-all" }}>
                          {c.file}
                        </span>
                        {c.sha && <code style={{ fontSize: 10, color: "var(--text-secondary)" }}>{c.sha}</code>}
                      </div>
                      {c.summary && (
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.5 }}>
                          {c.summary}
                        </div>
                      )}
                    </div>
                  ))}
                  {changes.length > 60 && (
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                      … 외 {changes.length - 60}건
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
