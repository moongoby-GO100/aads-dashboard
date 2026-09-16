"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

/** 구독 계정 재로그인 진행창.
 *
 * 두 CLI 의 흐름이 다르다. 코덱스는 URL 과 일회용 코드를 보여주면 CLI 가 스스로
 * 폴링해 끝내고, 클로드는 인증 후 받은 코드를 되돌려 줘야 한다(needs_code).
 * 그래서 입력칸은 needs_code 일 때만 띄운다.
 *
 * 설계: aads-docs/docs/PRD-LLM-ACCOUNT-RUNTIME-BINDING-v1.0.md 5절
 */

export type LoginSession = {
  login_id: string; kind: string; account: string; needs_code: boolean;
  state: string; message: string; url: string | null; user_code: string | null;
  expires_in: number;
};

const STATE_TEXT: Record<string, string> = {
  starting: "시작하는 중", awaiting_browser: "브라우저 인증 대기",
  awaiting_code: "코드 입력 대기", verifying: "확인 중",
  success: "로그인 완료", failed: "실패", expired: "시간 초과", cancelled: "취소됨",
};
const DONE = ["success", "failed", "expired", "cancelled"];

export default function AccountLoginModal(
  { target, onClose, onDone }: { target: string; onClose: () => void; onDone: () => void },
) {
  const [sess, setSess] = useState<LoginSession | null>(null);
  const [err, setErr] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (api as any).startAccountLogin(target)
      .then((r: LoginSession) => { if (alive) setSess(r); })
      .catch((e: any) => { if (alive) setErr(e?.message || "로그인을 시작하지 못했습니다"); });
    return () => { alive = false; };
  }, [target]);

  // 진행 상태는 서버가 안다 — 끝날 때까지 2초마다 확인한다.
  useEffect(() => {
    if (!sess?.login_id) return;
    if (DONE.includes(sess.state)) { if (sess.state === "success") onDone(); return; }
    const t = setTimeout(() => {
      (api as any).getAccountLogin(sess.login_id)
        .then((r: LoginSession) => setSess(r))
        .catch(() => {/* 다음 주기에 다시 본다 */});
    }, 2000);
    return () => clearTimeout(t);
  }, [sess, onDone]);

  const sendCode = useCallback(async () => {
    if (!sess || !code.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      setSess(await (api as any).submitAccountLoginCode(sess.login_id, code.trim()));
      setCode("");
    } catch (e: any) {
      setErr(e?.message || "코드 전달 실패");
    } finally { setBusy(false); }
  }, [sess, code, busy]);

  const close = async () => {
    if (sess && !DONE.includes(sess.state)) {
      try { await (api as any).cancelAccountLogin(sess.login_id); } catch { /* 닫기는 막지 않는다 */ }
    }
    onClose();
  };

  const done = sess?.state === "success";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-lg rounded-xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            재로그인 — {sess?.account || target}
          </h3>
          <button onClick={close} className="text-xs px-2 py-1 rounded" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>닫기</button>
        </div>

        {err && <p className="text-xs mb-3" style={{ color: "#dc2626" }}>{err}</p>}
        {!sess && !err && <p className="text-xs" style={{ color: "var(--text-secondary)" }}>로그인 세션을 여는 중...</p>}

        {sess && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded font-semibold"
                style={{ background: done ? "rgba(22,163,74,0.12)" : "rgba(217,119,6,0.12)", color: done ? "#16a34a" : "#d97706" }}>
                {STATE_TEXT[sess.state] || sess.state}
              </span>
              {!done && sess.expires_in > 0 && (
                <span style={{ color: "var(--text-secondary)" }}>{Math.ceil(sess.expires_in / 60)}분 남음</span>
              )}
            </div>

            {sess.message && <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{sess.message}</p>}

            {!done && sess.url && (
              <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--bg-subtle, rgba(0,0,0,0.02))", border: "1px solid var(--border)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>1. 아래 주소를 열어 로그인하세요</p>
                <a href={sess.url} target="_blank" rel="noreferrer" className="text-xs break-all underline" style={{ color: "#2563eb" }}>{sess.url}</a>
                {sess.user_code && (
                  <>
                    <p className="text-xs font-semibold pt-1" style={{ color: "var(--text-primary)" }}>2. 이 일회용 코드를 입력하세요</p>
                    <div className="flex items-center gap-2">
                      <code className="text-base font-bold tracking-widest px-3 py-1 rounded" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>{sess.user_code}</code>
                      <button onClick={() => navigator.clipboard?.writeText(sess.user_code || "")}
                        className="text-xs px-2 py-1 rounded" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>복사</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {!done && sess.needs_code && (
              <div className="space-y-1">
                <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  {sess.user_code ? "3." : "2."} 인증 후 받은 코드를 붙여넣으세요
                </p>
                <div className="flex gap-2">
                  <input value={code} onChange={(e) => setCode(e.target.value)}
                    placeholder="인증 코드"
                    disabled={sess.state !== "awaiting_code" || busy}
                    className="flex-1 text-xs px-2 py-1 rounded"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                  <button onClick={sendCode} disabled={sess.state !== "awaiting_code" || busy || !code.trim()}
                    className="text-xs px-3 py-1 rounded font-semibold"
                    style={{ background: "var(--accent, #2563eb)", color: "#fff", opacity: sess.state !== "awaiting_code" || busy || !code.trim() ? 0.5 : 1 }}>
                    {busy ? "전달 중..." : "전달"}
                  </button>
                </div>
              </div>
            )}

            {done && (
              <button onClick={onClose} className="w-full text-xs px-3 py-2 rounded font-semibold" style={{ background: "#16a34a", color: "#fff" }}>
                완료 — 닫기
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
