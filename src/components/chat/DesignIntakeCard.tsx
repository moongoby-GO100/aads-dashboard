"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { designIntakeApi } from "@/lib/designIntakeApi";
import { INTAKE_STEPS, intakeView, shouldRenderIntakeCard, type IntakeAnswer, type IntakeResponse } from "@/lib/designIntakeModel";

const touch: CSSProperties = { minHeight: 44, minWidth: 44, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--ct-border)", background: "var(--ct-input)", color: "var(--ct-text)", overflowWrap: "anywhere" };

export default function DesignIntakeCard({ chatSessionId }: { chatSessionId: string }) {
  return <QuestionCard key={chatSessionId} chatSessionId={chatSessionId} />;
}

function QuestionCard({ chatSessionId }: { chatSessionId: string }) {
  const [data, setData] = useState<IntakeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [other, setOther] = useState(false);
  const [text, setText] = useState("");
  const lock = useRef(false);
  const alive = useRef(true);
  const warnedInitialLoad = useRef(false);
  const view = data ? intakeView(data) : null;
  const sessionId = data?.session_id;

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError("");
    try { await action(); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "질문을 불러오지 못했습니다."); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function load() {
    const next = await designIntakeApi.byChat(chatSessionId);
    if (alive.current) setData(next);
  }
  useEffect(() => {
    alive.current = true;
    // StrictMode 재실행에서도 현재 마운트의 응답만 반영한다.
    let cancelled = false;
    setBusy(true);
    designIntakeApi.byChat(chatSessionId).then(next => { if (!cancelled) setData(next); })
      .catch(e => {
        if (!cancelled) {
          if (!warnedInitialLoad.current) {
            warnedInitialLoad.current = true;
            console.warn("디자인 질문을 불러오지 못했습니다.", e);
          }
          setError(e.message);
        }
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; alive.current = false; };
  }, [chatSessionId]);
  function answer(answer: string, answer_source: IntakeAnswer["answer_source"]) {
    const question = view?.question;
    if (!question || !sessionId || busy) return;
    void run(async () => {
      await designIntakeApi.answer(sessionId, { question_id: question.id, answer, answer_source });
      await load();
      if (alive.current) { setOther(false); setText(""); }
    });
  }
  if (!shouldRenderIntakeCard(data, error)) return null;
  return <div aria-label="디자인 질문 카드" aria-busy={busy} style={{ padding: 16, marginTop: 8, border: "1px solid var(--ct-border)", borderRadius: 12, background: "var(--ct-card)", overflowWrap: "anywhere" }}>
    <h3>디자인 요구사항 질문</h3>
    <ol aria-label="질문 진행 단계" style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
      {INTAKE_STEPS.map((step, i) => <li key={step} style={{ fontWeight: view && i === view.step ? 700 : 400 }} aria-current={view && i === view.step ? "step" : undefined}>{step}</li>)}
    </ol>
    {view && <p>{INTAKE_STEPS[view.step]}</p>}
    {busy && <p role="status">처리 중…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" style={touch} disabled={busy} onClick={() => void run(load)}>최신 질문 불러오기 · 재시도</button></div>}
    {view && <>
      <p aria-live="polite">답변 {view.answered} / {view.total}</p>
      {view.question && <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
        <legend>{view.question.question}</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {view.options.map(option => <button type="button" key={option} style={touch} onClick={() => answer(option, "user")}>{option}</button>)}
          <button type="button" style={touch} aria-expanded={other} onClick={() => setOther(!other)}>기타 직접 입력</button>
          <button type="button" style={touch} onClick={() => answer("잘 모름", "unknown")}>잘 모름</button>
        </div>
        {view.question.recommended && <p>잘 모름 선택 시 권장값: {view.question.recommended}</p>}
        {other && <form onSubmit={e => { e.preventDefault(); if (text.trim()) answer(text.trim(), "user_other"); }}>
          <label>기타 답변<textarea value={text} onChange={e => setText(e.target.value)} style={{ ...touch, width: "100%", boxSizing: "border-box", marginTop: 8 }} /></label>
          <button type="submit" style={touch} disabled={!text.trim()}>답변 보내기</button>
        </form>}
      </fieldset>}
      {view.total === 0 && <><p>아직 등록된 질문이 없습니다.</p><button type="button" style={touch} disabled={busy} onClick={() => void run(load)}>질문 다시 불러오기</button></>}
      {(view.phase === "review" || view.phase === "confirmed") && <>
        <h4>브리프 요약</h4>
        <dl>{data?.questions.map(q => <div key={q.id}><dt>{q.question}</dt><dd>{q.answer}</dd></div>)}</dl>
        {data?.brief && Object.keys(data.brief).length > 0 && <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(data.brief, null, 2)}</pre>}
        {view.phase === "confirmed" ? <p role="status">브리프 확인 완료</p> : <button type="button" style={touch} disabled={busy || !sessionId} onClick={() => void run(async () => { if (!sessionId) return; await designIntakeApi.confirm(sessionId, view.brief); await load(); })}>확인</button>}
      </>}
    </>}
  </div>;
}
