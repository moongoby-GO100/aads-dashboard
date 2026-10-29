"use client";
import { useEffect, useRef, useState } from "react";
import { browserLoginApi, loginError, singleLoginRequest, type AuthScope, type LoginTask } from "@/services/browserLoginApi";

export function loginLabel(task: LoginTask, now = Date.now()): string {
  const scope = task.result?.auth_scope;
  if (task.status === "expired" || (task.status === "waiting_for_user" && scope && Date.parse(scope.expires_at) <= now)) return "만료";
  return ({ queued: "접속 확인 중", running: "로그인 중", waiting_for_user: "추가 인증 필요", completed: "완료", failed: "실패", cancelled: "중단됨" } as Record<string, string>)[task.status] || "접속 확인 중";
}
type Props = { taskId: string; artifactId?: string; onOpen: () => void; onReconnect: () => void; pcConnected?: boolean };
export function LoginProgressView({ task, busy, error, pcConnected = true, onResume, onCancel, onOpen, onReconnect }: {
  task: LoginTask; busy: boolean; error?: string; artifactId?: string; pcConnected?: boolean;
  onResume?: () => void; onCancel?: () => void; onOpen?: () => void; onReconnect?: () => void;
}) {
  const scope = task.result?.auth_scope;
  const waiting = task.status === "waiting_for_user" && loginLabel(task) !== "만료";
  const needsPc = scope?.lane === "pc" && !pcConnected;
  let site = "접속 사이트";
  try { site = new URL(scope?.target || task.target_url || "").hostname; } catch {}
  return <section aria-label="로그인 진행 상태" style={{ padding: 12, border: "1px solid var(--ct-border)", borderRadius: 8, overflowWrap: "anywhere" }}>
    <strong>{site}{scope ? ` · 사업자 ${scope.business_ref} · 계정 ${scope.account_ref}` : ""}</strong>
    <p role="status">{needsPc && waiting ? "PC 연결 필요" : loginLabel(task)}</p>
    {task.status === "completed" && <p>인증이 유지되어 로그인 반복 없이 작업을 이어갑니다.</p>}
    {(error || task.error || task.result?.reason) && <p role="alert">{error || loginError(task.error || task.result?.reason || "")}</p>}
    {waiting && <>
      <p>{!scope ? "인증 요청 정보를 확인할 수 없습니다. 상태를 다시 확인하세요." : "인증 화면에서 처리를 마친 뒤 '인증 완료 후 계속'을 누르세요."}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button disabled={busy || !scope || needsPc} onClick={onResume} style={{ minHeight: 44 }}>인증 완료 후 계속</button>
        <button disabled={busy || !scope} onClick={onCancel} style={{ minHeight: 44 }}>중단</button>
        <button disabled={busy || needsPc} onClick={onOpen} style={{ minHeight: 44 }}>인증 화면 열기</button>
      </div>
    </>}
    {loginLabel(task) === "만료" && <p>인증 시간이 만료되었습니다. 채팅에서 새 접속 확인을 요청하세요.</p>}
    <button disabled={busy} onClick={onReconnect} style={{ minHeight: 44 }}>다시 연결</button>
  </section>;
}
export async function resumeWithEvidence(taskId: string, scope: AuthScope, artifactId?: string) {
  const evidenceId = artifactId || (await browserLoginApi.evidence(taskId, scope)).artifact_id;
  return browserLoginApi.resume(taskId, scope, evidenceId);
}
export default function LoginProgressCard({ taskId, artifactId, onOpen, onReconnect, pcConnected }: Props) {
  const [task, setTask] = useState<LoginTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const gate = useRef(singleLoginRequest());
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    setTask(null); setError("");
    const refresh = async () => {
      try { const version = revision.current; const next = await browserLoginApi.get(taskId); if (active && version === revision.current) setTask(next); }
      catch (e) { if (active) setError(e instanceof Error ? e.message : "상태 조회 실패"); }
    };
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [taskId]);
  const transition = (action: "resume" | "cancel") => void gate.current(async () => {
    if (!task?.result?.auth_scope || task.status !== "waiting_for_user" || loginLabel(task) === "만료") return;
    if (action === "resume" && task.result.auth_scope.lane === "pc" && pcConnected === false) return;
    revision.current += 1;
    setBusy(true); setError("");
    try {
      const next = action === "resume" ? await resumeWithEvidence(taskId, task.result.auth_scope, artifactId) : await browserLoginApi.cancel(taskId, task.result.auth_scope);
      setTask(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 실패");
      try { setTask(await browserLoginApi.get(taskId)); } catch {}
    } finally { revision.current += 1; setBusy(false); }
  });
  if (!task) return <p role="status">{error || "접속 상태 확인 중…"}</p>;
  return <LoginProgressView task={task} busy={busy} error={error} artifactId={artifactId} pcConnected={pcConnected} onResume={() => transition("resume")} onCancel={() => transition("cancel")} onOpen={onOpen} onReconnect={onReconnect} />;
}
