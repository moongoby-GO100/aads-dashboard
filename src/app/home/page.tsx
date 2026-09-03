"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import { api, type UserApiKeyItem, type UserProjectServerItem } from "@/lib/api";
import { getMe, type CurrentUser } from "@/lib/auth";

type Workspace = {
  id: string;
  name: string;
  project_key?: string | null;
  description?: string | null;
};

function resourceState(count: number, fallbackLabel: string, ownLabel: string): { label: string; tone: string } {
  return count > 0
    ? { label: ownLabel, tone: "var(--success)" }
    : { label: fallbackLabel, tone: "var(--warning)" };
}

function fmtKst(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

export default function CustomerHomePage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [apiKeys, setApiKeys] = useState<UserApiKeyItem[]>([]);
  const [servers, setServers] = useState<UserProjectServerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [me, ws, keys, projectServers] = await Promise.all([
        getMe(),
        api.getChatWorkspaces().catch(() => []),
        api.getUserApiKeys().catch(() => []),
        api.getUserProjectServers().catch(() => []),
      ]);
      setUser(me);
      setWorkspaces(Array.isArray(ws) ? ws : []);
      setApiKeys(keys);
      setServers(projectServers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "고객 홈 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeKeys = apiKeys.filter((key) => key.is_active);
  const activeServers = servers.filter((server) => server.status === "active");
  const aiState = resourceState(activeKeys.length, "오비스 자원 지원", "사용자 API 사용");
  const serverState = resourceState(activeServers.length, "오비스 격리 풀", "사용자 서버 사용");

  const panelStyle: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 16,
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="고객 홈" />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                {user?.tenant?.name || user?.email || "OHVIS"}
              </h1>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {user?.email || "로그인 사용자"} · {user?.tenant_role || "member"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/chat" className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: "var(--accent)", color: "#fff" }}>
                AI 채팅
              </Link>
              <Link href="/settings/api-keys" className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                AI API
              </Link>
              <Link href="/settings/servers" className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: "var(--bg-hover)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                내 서버
              </Link>
            </div>
          </div>

          {error && (
            <div className="rounded-md px-4 py-3 text-sm" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "var(--danger)" }}>
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {[
              ["워크스페이스", loading ? "-" : String(workspaces.length), "var(--accent)"],
              ["AI API", loading ? "-" : aiState.label, aiState.tone],
              ["실행 서버", loading ? "-" : serverState.label, serverState.tone],
              ["등록 서버", loading ? "-" : String(activeServers.length), "var(--text-primary)"],
            ].map(([label, value, color]) => (
              <div key={label} style={panelStyle}>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</p>
                <p className="mt-1 text-lg font-bold" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section style={panelStyle}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>내 작업공간</h2>
                <Link href="/chat" className="text-xs font-semibold" style={{ color: "var(--accent)" }}>열기</Link>
              </div>
              <div className="space-y-2">
                {workspaces.slice(0, 6).map((ws) => (
                  <Link key={ws.id} href={`/chat?workspace_id=${encodeURIComponent(ws.id)}`} className="block rounded-md px-3 py-2" style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}>
                    <div className="text-sm font-semibold">{ws.name}</div>
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{ws.project_key || "GENERAL"}</div>
                  </Link>
                ))}
                {!loading && workspaces.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>워크스페이스 없음</p>
                )}
              </div>
            </section>

            <section style={panelStyle}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>AI API</h2>
                <Link href="/settings/api-keys" className="text-xs font-semibold" style={{ color: "var(--accent)" }}>관리</Link>
              </div>
              <div className="space-y-2">
                {activeKeys.map((key) => (
                  <div key={key.id} className="rounded-md px-3 py-2" style={{ background: "var(--bg-hover)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{key.provider}</span>
                      <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>{key.masked_key}</span>
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>최근 사용: {fmtKst(key.last_used_at)}</div>
                  </div>
                ))}
                {!loading && activeKeys.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>오비스 공용 키 폴백 사용 중</p>
                )}
              </div>
            </section>

            <section style={panelStyle}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>실행 서버</h2>
                <Link href="/settings/servers" className="text-xs font-semibold" style={{ color: "var(--accent)" }}>관리</Link>
              </div>
              <div className="space-y-2">
                {activeServers.map((server) => (
                  <div key={server.id} className="rounded-md px-3 py-2" style={{ background: "var(--bg-hover)" }}>
                    <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{server.label || server.host}</div>
                    <div className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                      {server.ssh_user}@{server.host}:{server.ssh_port}
                    </div>
                    <div className="text-xs" style={{ color: server.connection_state === "reachable" ? "var(--success)" : "var(--warning)" }}>
                      {server.connection_state}
                    </div>
                  </div>
                ))}
                {!loading && activeServers.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>오비스 격리 실행 풀 사용 중</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
