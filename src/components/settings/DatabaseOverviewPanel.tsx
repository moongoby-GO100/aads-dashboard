"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";

interface InfraIssue {
  type: string;
  detail: string;
  severity?: string;
}

interface InfraDbCheck {
  ok: boolean;
  latency_ms?: number;
  error?: string;
}

interface InfraRemoteCheck {
  ok: boolean;
  method?: string;
  latency_ms?: number;
  error?: string;
}

interface OpsInfraCheckResponse {
  overall?: string;
  db?: InfraDbCheck;
  ssh_211?: InfraRemoteCheck;
  ssh_114?: InfraRemoteCheck;
  issues?: InfraIssue[];
}

interface DbPoolStats {
  available: boolean;
  size?: number;
  free?: number;
  used?: number;
  max_size?: number;
  usage_pct?: number;
}

interface OpsHealthInfra {
  ["aads-postgres"]?: string;
  ["aads-server"]?: string;
  ["aads-dashboard"]?: string;
  db_pool?: DbPoolStats;
  stale_placeholders?: number;
  active_streams_executing?: number;
  active_streams_visible?: number;
  recovery_pending_streams?: number;
  recent_placeholders?: number;
  disk_pct?: number;
  disk_free_gb?: number;
  memory_pct?: number;
  load_1m?: number;
}

interface OpsHealthCheckResponse {
  checked_at?: string;
  infra?: OpsHealthInfra;
}

function toKst(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function statusColor(ok: boolean | undefined): string {
  if (ok === undefined) return "var(--text-secondary)";
  return ok ? "var(--success)" : "var(--danger)";
}

function statusLabel(ok: boolean | undefined, positive = "정상", negative = "오류"): string {
  if (ok === undefined) return "확인 불가";
  return ok ? positive : negative;
}

interface Props {
  graphReady?: boolean;
}

export default function DatabaseOverviewPanel({ graphReady }: Props) {
  const [infra, setInfra] = useState<OpsInfraCheckResponse | null>(null);
  const [health, setHealth] = useState<OpsHealthCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [infraRes, healthRes] = await Promise.all([
        api.getOpsInfraCheck(),
        api.getOpsHealthCheck(),
      ]);
      setInfra(infraRes);
      setHealth(healthRes);
    } catch {
      setError("DB 상태 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm p-4" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>;
  }

  const db = infra?.db;
  const ssh211 = infra?.ssh_211;
  const ssh114 = infra?.ssh_114;
  const dbPool = health?.infra?.db_pool;
  const postgresContainer = health?.infra?.["aads-postgres"] || "unknown";
  const dbAccessOk = Boolean(ssh211?.ok) && Boolean(ssh114?.ok);

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm px-3 py-2 rounded" style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
          <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Internal PostgreSQL</p>
          <p className="text-lg font-bold" style={{ color: statusColor(db?.ok) }}>{statusLabel(db?.ok)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            {typeof db?.latency_ms === "number" ? `${db.latency_ms}ms` : "latency unavailable"}
          </p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
          <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>Graph DB</p>
          <p className="text-lg font-bold" style={{ color: statusColor(graphReady) }}>
            {graphReady ? "READY" : "LOADING"}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>메모리/그래프 적재 상태</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
          <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>DB Pool</p>
          <p className="text-lg font-bold" style={{ color: statusColor(dbPool?.available) }}>
            {dbPool?.available ? `${dbPool.used ?? 0}/${dbPool.max_size ?? 0}` : "OFF"}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            {dbPool?.available ? `사용률 ${dbPool.usage_pct ?? 0}%` : "pool unavailable"}
          </p>
        </div>
        <div className="rounded-lg p-3" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
          <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>원격 DB 접근</p>
          <p className="text-lg font-bold" style={{ color: statusColor(dbAccessOk) }}>
            {dbAccessOk ? "READY" : "DEGRADED"}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>211 / 114 SSH 경유</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-lg p-4" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>내부 DB 인프라</h3>
            <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
              checked {toKst(health?.checked_at)}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span style={{ color: "var(--text-secondary)" }}>PostgreSQL 컨테이너</span>
              <span className="font-mono" style={{ color: postgresContainer === "running" ? "var(--success)" : "var(--danger)" }}>
                {postgresContainer}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span style={{ color: "var(--text-secondary)" }}>접속 엔드포인트</span>
              <span className="font-mono" style={{ color: "var(--text-primary)" }}>aads-postgres:5433</span>
            </div>
            <div className="flex justify-between gap-3">
              <span style={{ color: "var(--text-secondary)" }}>DB Pool</span>
              <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                {dbPool?.available ? `size ${dbPool.size ?? 0} / free ${dbPool.free ?? 0}` : "unavailable"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span style={{ color: "var(--text-secondary)" }}>채팅 스트림</span>
              <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                {health?.infra?.active_streams_executing ?? "—"} 실행 / {health?.infra?.active_streams_visible ?? "—"} 표시 / {health?.infra?.recovery_pending_streams ?? "—"} 복구대기
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span style={{ color: "var(--text-secondary)" }}>최근 Placeholder</span>
              <span className="font-mono" style={{ color: Number(health?.infra?.recent_placeholders || 0) > 0 ? "var(--warning)" : "var(--success)" }}>
                {health?.infra?.recent_placeholders ?? "—"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span style={{ color: "var(--text-secondary)" }}>총 Placeholder 잔존</span>
              <span className="font-mono" style={{ color: Number(health?.infra?.stale_placeholders || 0) > 0 ? "var(--warning)" : "var(--success)" }}>
                {health?.infra?.stale_placeholders ?? "—"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span style={{ color: "var(--text-secondary)" }}>디스크 / 메모리 / Load</span>
              <span className="font-mono" style={{ color: "var(--text-primary)" }}>
                {health?.infra?.disk_pct ?? "—"}% / {health?.infra?.memory_pct ?? "—"}% / {health?.infra?.load_1m ?? "—"}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg p-4" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>프로젝트 DB 연결</h3>
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>CEO 도구 / SSH 터널 기준</span>
          </div>
          <div className="space-y-3">
            {[
              { project: "AADS", engine: "PostgreSQL", route: "내부 Docker", host: "aads-postgres:5433", ok: db?.ok, note: "운영 메인 DB" },
              { project: "KIS / GO100", engine: "PostgreSQL 16", route: "211 서버", host: "host.docker.internal:5432", ok: ssh211?.ok, note: "kisautotrade" },
              { project: "SF", engine: "MariaDB", route: "114 서버 SSH 터널", host: "localhost:3306", ok: ssh114?.ok, note: "autoda" },
              { project: "NTV2", engine: "MySQL 8", route: "114 서버 SSH 터널", host: "localhost:3307", ok: ssh114?.ok, note: "newtalk_v2" },
            ].map((item) => (
              <div key={item.project} className="rounded-lg px-3 py-3" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.project}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                      {item.engine} · {item.route}
                    </p>
                    <p className="text-xs font-mono mt-1" style={{ color: "var(--text-secondary)" }}>
                      {item.host}
                    </p>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded" style={{ background: "var(--bg-hover)", color: statusColor(item.ok) }}>
                    {statusLabel(item.ok)}
                  </span>
                </div>
                <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>{item.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {infra?.issues && infra.issues.length > 0 && (
        <div className="rounded-lg p-4" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid var(--border)" }}>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>DB/인프라 이슈</p>
          <div className="space-y-2">
            {infra.issues.slice(0, 5).map((issue) => (
              <div key={`${issue.type}:${issue.detail}`} className="flex items-start justify-between gap-3 text-xs">
                <span style={{ color: "var(--text-secondary)" }}>{issue.detail}</span>
                <span className="font-mono" style={{ color: issue.severity === "warning" ? "var(--warning)" : "var(--danger)" }}>
                  {issue.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
