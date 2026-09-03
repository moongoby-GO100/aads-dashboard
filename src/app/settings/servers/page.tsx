"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { api, type UserProjectServerItem, type UserProjectServerRouteResponse } from "@/lib/api";

type Workspace = {
  id: string;
  name: string;
  project_key?: string | null;
};

function fmtKst(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

export default function UserServersPage() {
  const [servers, setServers] = useState<UserProjectServerItem[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [routing, setRouting] = useState(false);
  const [message, setMessage] = useState("");
  const [routeResult, setRouteResult] = useState<UserProjectServerRouteResponse | null>(null);
  const [form, setForm] = useState({
    label: "",
    host: "",
    ssh_user: "partner",
    ssh_port: 22,
    auth_type: "ssh_key",
    workspace_id: "",
    project_key: "",
  });
  const [routeForm, setRouteForm] = useState({
    server_id: "ohvis",
    workspace_id: "",
    project_key: "",
    size: "M",
    instruction: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [projectServers, ws] = await Promise.all([
        api.getUserProjectServers().catch(() => []),
        api.getChatWorkspaces().catch(() => []),
      ]);
      setServers(projectServers);
      setWorkspaces(Array.isArray(ws) ? ws : []);
      setMessage("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "서버 목록 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedWorkspace = useMemo(
    () => workspaces.find((ws) => ws.id === routeForm.workspace_id || ws.id === form.workspace_id),
    [form.workspace_id, routeForm.workspace_id, workspaces],
  );

  const save = async () => {
    if (!form.host.trim()) {
      setMessage("서버 IP 또는 호스트를 입력하십시오.");
      return;
    }
    setSaving(true);
    try {
      await api.createUserProjectServer({
        label: form.label.trim() || form.host.trim(),
        host: form.host.trim(),
        ssh_user: form.ssh_user.trim() || "partner",
        ssh_port: Number(form.ssh_port) || 22,
        auth_type: form.auth_type,
        workspace_id: form.workspace_id || null,
        project_key: form.project_key.trim() || selectedWorkspace?.project_key || "",
        metadata: {},
      });
      setForm((prev) => ({ ...prev, label: "", host: "" }));
      await load();
      setMessage("서버 등록 완료");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "서버 등록 실패");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (server: UserProjectServerItem) => {
    if (!window.confirm(`${server.label || server.host} 서버를 보관 처리하시겠습니까?`)) return;
    try {
      await api.deleteUserProjectServer(server.id);
      await load();
      setMessage("서버 보관 완료");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "서버 보관 실패");
    }
  };

  const route = async () => {
    if (!routeForm.instruction.trim()) {
      setMessage("실행 지시를 입력하십시오.");
      return;
    }
    setRouting(true);
    setRouteResult(null);
    try {
      const result = await api.routeUserProjectExecution({
        server_id: routeForm.server_id,
        workspace_id: routeForm.workspace_id || null,
        project_key: routeForm.project_key.trim() || selectedWorkspace?.project_key || "",
        size: routeForm.size,
        instruction: routeForm.instruction.trim(),
        dry_run: true,
      });
      setRouteResult(result);
      setMessage("실행 경로 확정 완료");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "실행 경로 확정 실패");
    } finally {
      setRouting(false);
    }
  };

  const panelStyle: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 16,
  };
  const inputStyle: React.CSSProperties = {
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-primary)" }}>
      <Header title="내 서버 실행" />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-6xl space-y-5">
          {message && (
            <div className="rounded-md px-3 py-2 text-sm" style={{
              background: message.includes("실패") || message.includes("error") ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
              color: message.includes("실패") || message.includes("error") ? "var(--danger)" : "var(--success)",
            }}>
              {message}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section style={panelStyle}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>서버 등록</h1>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>비밀번호와 개인키 원문은 저장하지 않습니다.</p>
                </div>
                <button onClick={load} className="rounded-md px-3 py-2 text-sm" style={{ ...inputStyle, background: "var(--bg-hover)" }}>새로고침</button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input value={form.label} onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))} placeholder="서버 이름" className="rounded-md px-3 py-2 text-sm" style={inputStyle} />
                <input value={form.host} onChange={(e) => setForm((prev) => ({ ...prev, host: e.target.value }))} placeholder="IP 또는 호스트" className="rounded-md px-3 py-2 text-sm" style={inputStyle} />
                <input value={form.ssh_user} onChange={(e) => setForm((prev) => ({ ...prev, ssh_user: e.target.value }))} placeholder="SSH 사용자" className="rounded-md px-3 py-2 text-sm" style={inputStyle} />
                <input value={form.ssh_port} onChange={(e) => setForm((prev) => ({ ...prev, ssh_port: Number(e.target.value) }))} type="number" min={1} max={65535} placeholder="SSH 포트" className="rounded-md px-3 py-2 text-sm" style={inputStyle} />
                <select value={form.auth_type} onChange={(e) => setForm((prev) => ({ ...prev, auth_type: e.target.value }))} className="rounded-md px-3 py-2 text-sm" style={inputStyle}>
                  <option value="ssh_key">SSH key</option>
                  <option value="agent_vault">Agent Vault</option>
                  <option value="manual">Manual</option>
                </select>
                <select value={form.workspace_id} onChange={(e) => setForm((prev) => ({ ...prev, workspace_id: e.target.value }))} className="rounded-md px-3 py-2 text-sm" style={inputStyle}>
                  <option value="">워크스페이스 선택 없음</option>
                  {workspaces.map((ws) => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
                </select>
                <input value={form.project_key} onChange={(e) => setForm((prev) => ({ ...prev, project_key: e.target.value }))} placeholder="프로젝트 키" className="rounded-md px-3 py-2 text-sm md:col-span-2" style={inputStyle} />
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={save} disabled={saving} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: "var(--accent)", color: "#fff", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "등록 중" : "등록"}
                </button>
              </div>
            </section>

            <section style={panelStyle}>
              <h2 className="mb-4 text-lg font-bold" style={{ color: "var(--text-primary)" }}>실행 라우터</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <select value={routeForm.server_id} onChange={(e) => setRouteForm((prev) => ({ ...prev, server_id: e.target.value }))} className="rounded-md px-3 py-2 text-sm" style={inputStyle}>
                  <option value="ohvis">오비스 격리 풀</option>
                  {servers.filter((server) => server.status === "active").map((server) => (
                    <option key={server.id} value={server.id}>{server.label || server.host}</option>
                  ))}
                </select>
                <select value={routeForm.workspace_id} onChange={(e) => setRouteForm((prev) => ({ ...prev, workspace_id: e.target.value }))} className="rounded-md px-3 py-2 text-sm" style={inputStyle}>
                  <option value="">워크스페이스 선택 없음</option>
                  {workspaces.map((ws) => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
                </select>
                <input value={routeForm.project_key} onChange={(e) => setRouteForm((prev) => ({ ...prev, project_key: e.target.value }))} placeholder="프로젝트 키" className="rounded-md px-3 py-2 text-sm" style={inputStyle} />
                <select value={routeForm.size} onChange={(e) => setRouteForm((prev) => ({ ...prev, size: e.target.value }))} className="rounded-md px-3 py-2 text-sm" style={inputStyle}>
                  {["XS", "S", "M", "L", "XL"].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
                <textarea value={routeForm.instruction} onChange={(e) => setRouteForm((prev) => ({ ...prev, instruction: e.target.value }))} rows={7} placeholder="실행 지시" className="rounded-md px-3 py-2 text-sm md:col-span-2" style={inputStyle} />
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={route} disabled={routing} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: "var(--accent)", color: "#fff", opacity: routing ? 0.6 : 1 }}>
                  {routing ? "확정 중" : "실행 경로 확정"}
                </button>
              </div>
              {routeResult && (
                <div className="mt-4 rounded-md p-3 text-sm" style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}>
                  <div>대상: {routeResult.route_target}</div>
                  <div>오비스 자원: {routeResult.will_use_ohvis_resources ? "사용" : "미사용"}</div>
                  <div>서버 연결 필요: {routeResult.requires_user_server_connection ? "예" : "아니오"}</div>
                  <div>이벤트: #{routeResult.event_id} · {fmtKst(routeResult.created_at)}</div>
                </div>
              )}
            </section>
          </div>

          <section style={panelStyle}>
            <h2 className="mb-3 text-sm font-bold" style={{ color: "var(--text-primary)" }}>등록 서버</h2>
            {loading ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>로딩 중...</p>
            ) : servers.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>등록된 서버 없음</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>
                      <th className="py-2 text-left">이름</th>
                      <th className="py-2 text-left">접속</th>
                      <th className="py-2 text-left">프로젝트</th>
                      <th className="py-2 text-left">상태</th>
                      <th className="py-2 text-left">등록일</th>
                      <th className="py-2 text-right">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servers.map((server) => (
                      <tr key={server.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="py-3 font-semibold" style={{ color: "var(--text-primary)" }}>{server.label || server.host}</td>
                        <td className="py-3 font-mono" style={{ color: "var(--text-secondary)" }}>{server.ssh_user}@{server.host}:{server.ssh_port}</td>
                        <td className="py-3" style={{ color: "var(--text-secondary)" }}>{server.project_key || "-"}</td>
                        <td className="py-3" style={{ color: server.connection_state === "reachable" ? "var(--success)" : "var(--warning)" }}>{server.connection_state}</td>
                        <td className="py-3" style={{ color: "var(--text-secondary)" }}>{fmtKst(server.created_at)}</td>
                        <td className="py-3 text-right">
                          <button onClick={() => void remove(server)} className="rounded-md px-3 py-1.5 text-xs" style={{ background: "rgba(239,68,68,0.12)", color: "var(--danger)" }}>
                            보관
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
