"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type BrowserTask = {
  id: string;
  work_key: string;
  target_url: string;
  status: string;
  current_step: string;
  requires_approval: boolean;
  approval_request_id?: string | null;
  updated_at?: string;
};

type PermissionRequest = {
  id: string;
  task_id?: string | null;
  work_key: string;
  origin: string;
  action_type: string;
  action_summary: string;
  risk_level: string;
  decision: string;
  expires_at?: string;
};

type VaultCredential = {
  id: string;
  work_key: string;
  origin: string;
  label: string;
  username: string;
  updated_at?: string;
};

const STATUS_OPTIONS = ["", "queued", "running", "approval_required", "auth_required", "completed", "failed"];

function statusStyle(status: string): React.CSSProperties {
  if (status === "completed") return { color: "#15803d", background: "#dcfce7" };
  if (status === "failed") return { color: "#b91c1c", background: "#fee2e2" };
  if (status === "approval_required" || status === "auth_required") return { color: "#a16207", background: "#fef3c7" };
  if (status === "running") return { color: "#1d4ed8", background: "#dbeafe" };
  return { color: "var(--text-secondary)", background: "var(--bg-hover)" };
}

function formatTime(value?: string): string {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function BrowserTasksPage() {
  const [tasks, setTasks] = useState<BrowserTask[]>([]);
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [credentials, setCredentials] = useState<VaultCredential[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workKey, setWorkKey] = useState("aads-ceo-browser");
  const [targetUrl, setTargetUrl] = useState("https://aads.newtalk.kr/chat");
  const [busy, setBusy] = useState(false);

  const activeTasks = useMemo(() => tasks.filter((task) => !["completed", "failed", "cancelled"].includes(task.status)).length, [tasks]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskRes, permissionRes, credentialRes] = await Promise.all([
        api.getBrowserTasks({ status: status || undefined, limit: 50 }),
        api.getBrowserTaskPermissions({ decision: "pending", limit: 50 }),
        api.getAgentVaultCredentials({ work_key: workKey || undefined }),
      ]);
      const taskData = taskRes as { tasks?: BrowserTask[] };
      const permissionData = permissionRes as { requests?: PermissionRequest[] };
      const credentialData = credentialRes as { credentials?: VaultCredential[] };
      setTasks(Array.isArray(taskData.tasks) ? taskData.tasks : []);
      setPermissions(Array.isArray(permissionData.requests) ? permissionData.requests : []);
      setCredentials(Array.isArray(credentialData.credentials) ? credentialData.credentials : []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const createTask = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createBrowserTask({ work_key: workKey, target_url: targetUrl, current_step: "대기 중" });
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (requestId: string, approved: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (approved) await api.approveBrowserTaskPermission(requestId, "dashboard approval");
      else await api.rejectBrowserTaskPermission(requestId, "dashboard rejection");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-6" style={{ color: "var(--text-primary)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌐</span>
          <div>
            <h1 className="text-xl font-bold">Managed Browser</h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>PC Agent 브라우저 작업, 권한 승인, Agent Vault</p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="px-4 py-2 rounded text-sm font-medium hover:opacity-80"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          새로고침
        </button>
      </div>

      {error && (
        <div className="rounded border px-4 py-3 text-sm" style={{ borderColor: "#fca5a5", color: "#b91c1c", background: "#fee2e2" }}>
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border p-4 space-y-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold">작업 생성</h2>
          <label className="block text-xs" style={{ color: "var(--text-secondary)" }}>work_key</label>
          <input className="w-full rounded border px-3 py-2 text-sm" value={workKey} onChange={(e) => setWorkKey(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
          <label className="block text-xs" style={{ color: "var(--text-secondary)" }}>target_url</label>
          <input className="w-full rounded border px-3 py-2 text-sm" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }} />
          <button disabled={busy} onClick={createTask} className="w-full rounded px-4 py-2 text-sm font-medium disabled:opacity-50" style={{ background: "var(--accent)", color: "#fff" }}>
            작업 등록
          </button>
        </section>

        <section className="rounded-lg border p-4 space-y-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold">Agent Vault</h2>
          <p className="text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
            계정 등록은 전용 보안 콘솔에서 처리합니다. Managed Browser는 작업 실행과 권한 승인에 집중하고,
            비밀번호 원문은 화면 목록에 표시하지 않습니다.
          </p>
          <Link
            href={`/agent-vault?work_key=${encodeURIComponent(workKey)}`}
            className="block w-full rounded px-4 py-2 text-center text-sm font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Agent Vault 열기
          </Link>
        </section>

        <section className="rounded-lg border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <h2 className="font-semibold">요약</h2>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="text-lg font-bold">{tasks.length}</div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Tasks</div>
            </div>
            <div className="rounded border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="text-lg font-bold">{activeTasks}</div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Active</div>
            </div>
            <div className="rounded border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="text-lg font-bold">{permissions.length}</div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Approvals</div>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-lg border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between gap-3 border-b p-4" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-semibold">브라우저 작업</h2>
          <select className="rounded border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
            {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item || "all"}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead style={{ color: "var(--text-secondary)" }}>
              <tr className="text-left">
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">work_key</th>
                <th className="px-4 py-3">target</th>
                <th className="px-4 py-3">단계</th>
                <th className="px-4 py-3">갱신</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-3"><span className="rounded px-2 py-1 text-xs font-medium" style={statusStyle(task.status)}>{task.status}</span></td>
                  <td className="px-4 py-3 font-mono text-xs">{task.work_key}</td>
                  <td className="px-4 py-3 truncate max-w-[260px]">{task.target_url}</td>
                  <td className="px-4 py-3">{task.current_step || "-"}</td>
                  <td className="px-4 py-3">{formatTime(task.updated_at)}</td>
                </tr>
              ))}
              {!loading && tasks.length === 0 && (
                <tr><td className="px-4 py-8 text-center" colSpan={5} style={{ color: "var(--text-secondary)" }}>작업이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="border-b p-4" style={{ borderColor: "var(--border)" }}><h2 className="font-semibold">승인 대기</h2></div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {permissions.map((item) => (
              <div key={item.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{item.action_type}</div>
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{item.action_summary || item.origin}</div>
                  </div>
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={() => decide(item.id, true)} className="rounded px-3 py-1.5 text-sm" style={{ background: "#dcfce7", color: "#15803d" }}>승인</button>
                    <button disabled={busy} onClick={() => decide(item.id, false)} className="rounded px-3 py-1.5 text-sm" style={{ background: "#fee2e2", color: "#b91c1c" }}>거부</button>
                  </div>
                </div>
              </div>
            ))}
            {!loading && permissions.length === 0 && <div className="p-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>승인 대기 항목이 없습니다.</div>}
          </div>
        </section>

        <section className="rounded-lg border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="border-b p-4" style={{ borderColor: "var(--border)" }}><h2 className="font-semibold">저장된 자격증명</h2></div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {credentials.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-medium">{item.label}</div>
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{item.origin} · {item.username}</div>
                </div>
                <span className="rounded px-2 py-1 text-xs font-medium" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>원문 비밀번호 숨김</span>
              </div>
            ))}
            {!loading && credentials.length === 0 && <div className="p-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>저장된 자격증명이 없습니다.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
