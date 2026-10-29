"use client";
// 입력창 위 수정 요청 대상 막대 — 어느 목업에 요청이 가는지 보여주고, 대상이 여럿이면 사용자가 고르게 한다.
import { useEffect, useState } from "react";
import { mockupTargetStore, submitPendingIntent, useMockupTarget, type PendingIntent } from "@/lib/mockupTargetStore";
import { targetKey, type MockupTarget } from "@/lib/mockupReviewModel";

const box: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 6, padding: "6px 12px",
  borderLeft: "3px solid var(--ct-accent)", background: "var(--ct-hover)", borderRadius: "0 8px 8px 0",
  fontSize: 13, color: "var(--ct-text2)",
};
const btn: React.CSSProperties = {
  border: "1px solid var(--ct-border)", background: "var(--ct-bg2)", color: "var(--ct-text)", borderRadius: 6,
  padding: "4px 10px", fontSize: 12, cursor: "pointer", minHeight: 32,
};

export function MockupTargetBar({ sessionId, onOpen }: { sessionId: string | null; onOpen?: (t: MockupTarget) => void }) {
  const s = useMockupTarget();
  const [pending, setPending] = useState<PendingIntent[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setPending(mockupTargetStore.pendingIntents().filter((i) => i.body.session_id === sessionId));
  }, [sessionId, s.notice]);

  if (!sessionId || s.sessionId !== sessionId) return null;

  const res = mockupTargetStore.sendResolution();
  const armed = s.armed;
  const choose = (t: MockupTarget) => { mockupTargetStore.arm(t); mockupTargetStore.choose(targetKey(t)); setPickerOpen(false); };
  const retry = async (intent: PendingIntent) => {
    setRetrying(true);
    await submitPendingIntent(intent);
    setRetrying(false);
  };
  const failed = s.notice?.kind === "failed" ? s.notice : null;

  return (
    <div role="region" aria-label="목업 수정 요청 대상" style={{ display: "contents" }}>
      {armed && (
        <div style={box}>
          <span style={{ flex: "1 1 200px", minWidth: 0 }}>
            🎯 <b>{armed.title}</b> 수정 요청 모드 — 다음에 보내는 메시지가 이 목업의 수정 요청으로 접수됩니다. 승인이 아닙니다.
          </span>
          <button type="button" style={btn} onClick={() => mockupTargetStore.disarm()}>취소</button>
        </div>
      )}
      {armed && res.kind === "ambiguous" && (
        <div style={box} role="alert">
          <span style={{ flex: "1 1 100%" }}>수정 요청 대상이 둘 이상입니다(답장한 카드·열린 패널·선택한 목업). 어느 목업에 요청할까요?</span>
          {res.candidates.map((t) => (
            <button key={targetKey(t)} type="button" style={btn} onClick={() => choose(t)}>{t.title}</button>
          ))}
        </div>
      )}
      {!armed && s.candidatesFailed && (
        <div style={box} role="status">
          <span style={{ flex: 1 }}>목업 수정 요청 대상 후보 일부를 불러오지 못했습니다. 목록에 없는 목업은 아티팩트 패널에서 직접 열어 요청해 주세요.</span>
        </div>
      )}
      {!armed && s.candidates.length > 0 && (
        <div style={box}>
          <button type="button" style={btn} aria-expanded={pickerOpen} onClick={() => setPickerOpen((v) => !v)}>
            목업 수정 요청{s.candidates.length > 1 ? ` (대상 ${s.candidates.length}건 중 선택)` : ""}
          </button>
          {pickerOpen && s.candidates.map((t) => (
            <span key={targetKey(t)} style={{ display: "inline-flex", gap: 4 }}>
              <button type="button" style={btn} onClick={() => choose(t)}>{t.title}</button>
              {onOpen && <button type="button" style={btn} aria-label={`${t.title} 검토 패널 열기`} onClick={() => { onOpen(t); setPickerOpen(false); }}>패널 열기</button>}
            </span>
          ))}
        </div>
      )}
      {s.notice?.kind === "registered" && (
        <div style={box} role="status">
          <span style={{ flex: 1 }}>수정 요청이 접수되었습니다. 새 판이 올라오면 같은 패널에서 이전 판과 비교해 확인하세요.</span>
          <button type="button" style={btn} onClick={() => mockupTargetStore.setNotice(null)}>닫기</button>
        </div>
      )}
      {failed && (
        <div style={{ ...box, borderLeftColor: "#ef4444" }} role="alert">
          <span style={{ flex: "1 1 200px" }}>
            {failed.reason === "message_not_found"
              ? "보낸 메시지의 저장을 확인하지 못해 수정 요청을 접수하지 않았습니다. 같은 내용을 다시 보내 주세요."
              : failed.error?.message ?? "수정 요청을 접수하지 못했습니다."}
            {failed.error?.candidates.length ? ` (후보 ${failed.error.candidates.length}건 — 대상을 직접 선택해 주세요)` : ""}
          </span>
          <button type="button" style={btn} onClick={() => mockupTargetStore.setNotice(null)}>닫기</button>
        </div>
      )}
      {pending.length > 0 && !armed && (
        <div style={box}>
          <span style={{ flex: "1 1 200px" }}>접수되지 않은 수정 요청 {pending.length}건이 있습니다.</span>
          <button type="button" style={btn} disabled={retrying} onClick={() => retry(pending[pending.length - 1])}>
            {retrying ? "다시 보내는 중…" : "다시 접수"}
          </button>
        </div>
      )}
    </div>
  );
}
