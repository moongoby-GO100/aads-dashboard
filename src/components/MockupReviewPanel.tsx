/**
 * 목업 검토 패널 — 알림 딥링크(/chat?mockup_review=…)로 열리는 오른쪽 패널.
 * 시안 이미지를 보고 같은 자리에서 승인하거나 수정 요청을 보낸다.
 * 승인·수정 요청은 로그인한 사용자 본인 토큰으로만 호출한다(채팅 도구·시스템 토큰 경유 없음).
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MockupHtmlLinks } from "@/components/MockupHtmlLinks";
import { mockupApi, MockupApiError } from "@/lib/mockupReviewApi";
import {
  approveBody, canApprove, canRequestChanges, changeBody, changeFingerprint, changeSourceNotice, describeMockupError,
  groupAssetsByScreen, isImageAsset, keepChangeAttempt, newUuid, PANEL_WIDE_STORAGE_KEY, panelWidthCss, parsePanelWide,
  phaseLabel, resolveChangeSource, statusColor, statusLabel, stepZoomIndex, VIEWPORT_LABEL, zoomScale,
  type ChangeAttempt, type MockupAsset, type MockupErrorView, type MockupReview, type MockupRevision, type ViewportClass, type ZoomMode,
} from "@/lib/mockupReviewModel";

const TOUCH = 44;

function useNarrow(maxPx = 640): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxPx}px)`);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [maxPx]);
  return narrow;
}

type ZoomItem = { key: string; src: string; caption: string; viewport: string };

function assetKey(revisionId: string, asset: MockupAsset): string {
  return `${revisionId}:${asset.asset_id}`;
}

function assetCaption(asset: MockupAsset): string {
  return `${phaseLabel(asset.phase)}${asset.state && asset.state !== "default" ? ` · ${asset.state}` : ""}`;
}

function AssetImage({ project, reviewId, revisionId, asset, onSrc, onOpen }: {
  project: string; reviewId: string; revisionId: string; asset: MockupAsset;
  onSrc: (key: string, src: string | null) => void; onOpen: (key: string, trigger: HTMLElement) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const image = isImageAsset(asset);

  useEffect(() => {
    if (!image) return;
    let alive = true;
    let objectUrl: string | null = null;
    mockupApi.getAssetBlob(project, reviewId, revisionId, asset.asset_id)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        onSrc(assetKey(revisionId, asset), objectUrl);
      })
      .catch((e) => {
        if (alive) setError(e instanceof MockupApiError ? e.view.message : "이미지를 불러오지 못했습니다.");
      });
    return () => {
      alive = false;
      if (objectUrl) {
        onSrc(assetKey(revisionId, asset), null);
        URL.revokeObjectURL(objectUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- asset 객체 대신 asset_id 로 비교한다
  }, [project, reviewId, revisionId, asset.asset_id, image, onSrc]);

  const caption = assetCaption(asset);
  return (
    <figure style={{ margin: 0, flex: "1 1 240px", minWidth: 0 }}>
      <figcaption style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>
        {caption} <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>{asset.viewport}</span>
      </figcaption>
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-primary)", overflow: "hidden", minHeight: 80 }}>
        {!image && <div style={{ padding: 12, fontSize: 11.5, color: "var(--text-secondary)" }}>이미지가 아닌 자산입니다 ({asset.mime})</div>}
        {image && !src && !error && <div style={{ padding: 12, fontSize: 11.5, color: "var(--text-secondary)" }}>불러오는 중…</div>}
        {error && <div role="alert" style={{ padding: 12, fontSize: 11.5, color: "#dc2626" }}>{error}</div>}
        {src && (
          <button type="button" onClick={(e) => onOpen(assetKey(revisionId, asset), e.currentTarget)}
            aria-label={`${caption} ${asset.viewport ?? ""} 크게 보기`}
            style={{ position: "relative", display: "block", width: "100%", minHeight: TOUCH, padding: 0, border: 0, background: "transparent", cursor: "zoom-in" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 인증이 필요한 blob URL 이라 next/image 를 쓸 수 없다 */}
            <img src={src} alt={`${caption} ${asset.viewport ?? ""}`} style={{ display: "block", width: "100%", height: "auto" }} />
            <span aria-hidden="true" style={{ position: "absolute", right: 6, bottom: 6, padding: "4px 9px", borderRadius: 999, background: "rgba(0,0,0,.66)", color: "#fff", fontSize: 11.5, fontWeight: 800, pointerEvents: "none" }}>
              🔍 크게 보기
            </span>
          </button>
        )}
      </div>
    </figure>
  );
}

function ImageLightbox({ items, index, onIndex, onClose }: {
  items: ZoomItem[]; index: number; onIndex: (i: number) => void; onClose: () => void;
}) {
  const [mode, setMode] = useState<ZoomMode>("original");
  const [natural, setNatural] = useState<{ key: string; w: number; h: number } | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const item = items[index];
  const count = items.length;

  useEffect(() => { closeRef.current?.focus(); }, []);

  useEffect(() => {
    const measure = () => {
      const el = stageRef.current;
      if (el) setBox({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    // 캡처 단계에서 가로채야 채팅 화면의 Esc(스트리밍 중단) 단축키가 같이 실행되지 않는다.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation(); onClose();
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && count > 1) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
        e.preventDefault(); e.stopPropagation();
        onIndex(stepZoomIndex(index, e.key === "ArrowLeft" ? -1 : 1, count));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, count, onIndex, onClose]);

  if (!item) return null;
  const nat = natural && natural.key === item.key ? natural : null;
  const scale = nat ? zoomScale(mode, nat.w, nat.h, box.w, box.h) : 1;
  const ctl = (enabled = true): React.CSSProperties => ({
    minHeight: TOUCH, minWidth: TOUCH, padding: "0 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,.35)",
    background: "rgba(255,255,255,.12)", color: "#fff", fontWeight: 800, fontSize: 13,
    cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.4,
  });

  return (
    <div role="dialog" aria-modal="true" aria-label="이미지 확대 보기"
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,.88)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", flexWrap: "wrap", color: "#fff" }}>
        <div style={{ flex: "1 1 160px", minWidth: 0, fontSize: 12.5, fontWeight: 800, wordBreak: "break-word" }}>
          {item.caption} <span style={{ fontWeight: 500, opacity: 0.8 }}>{item.viewport}</span>
          {nat && <span style={{ fontWeight: 500, opacity: 0.8 }}> · {nat.w}×{nat.h} · {Math.round(scale * 100)}%</span>}
        </div>
        {count > 1 && (
          <>
            <button type="button" aria-label="이전 이미지" disabled={index <= 0} onClick={() => onIndex(stepZoomIndex(index, -1, count))} style={ctl(index > 0)}>←</button>
            <span aria-live="polite" style={{ fontSize: 12, minWidth: 36, textAlign: "center" }}>{index + 1} / {count}</span>
            <button type="button" aria-label="다음 이미지" disabled={index >= count - 1} onClick={() => onIndex(stepZoomIndex(index, 1, count))} style={ctl(index < count - 1)}>→</button>
          </>
        )}
        <button type="button" aria-pressed={mode === "fit"} onClick={() => setMode(mode === "fit" ? "original" : "fit")} style={ctl()}>
          {mode === "fit" ? "원본 크기" : "화면 맞춤"}
        </button>
        <button ref={closeRef} type="button" aria-label="닫기" onClick={onClose} style={ctl()}>✕ 닫기</button>
      </div>
      <div ref={stageRef} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto", display: "flex" }}>
        {/* margin:auto 로 작은 이미지는 가운데, 큰 이미지는 스크롤 가능하게 둔다 */}
        {/* eslint-disable-next-line @next/next/no-img-element -- 이미 받은 blob URL 을 재사용한다 */}
        <img key={item.key} src={item.src} alt={`${item.caption} ${item.viewport}`}
          onLoad={(e) => setNatural({ key: item.key, w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          style={nat
            ? { display: "block", margin: "auto", flexShrink: 0, width: Math.round(nat.w * scale), height: Math.round(nat.h * scale), maxWidth: "none" }
            : { display: "block", margin: "auto", maxWidth: "100%", maxHeight: "100%" }} />
      </div>
    </div>
  );
}

function ErrorBox({ err, onRefresh }: { err: MockupErrorView; onRefresh: () => void }) {
  return (
    <div role="alert" style={{ margin: "0 0 10px", padding: 10, borderRadius: 8, border: "1px solid #dc2626", color: "#dc2626", fontSize: 12, lineHeight: 1.55 }}>
      <div style={{ fontWeight: 800 }}>{err.message}</div>
      {err.details.length > 0 && (
        <ul style={{ margin: "5px 0 0", paddingLeft: 18 }}>
          {err.details.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      )}
      {err.code && <div style={{ marginTop: 4, fontSize: 10.5, opacity: 0.75 }}>코드: {err.code} · HTTP {err.status}</div>}
      {err.needsRefresh && (
        <button type="button" onClick={onRefresh}
          style={{ marginTop: 8, minHeight: TOUCH, padding: "0 16px", borderRadius: 8, border: 0, background: "#dc2626", color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
          새로고침
        </button>
      )}
    </div>
  );
}

export function MockupReviewPanel({ project, reviewId, revisionId, chatSessionId, sourceMessageId, onClose }: {
  project: string;
  reviewId: string;
  revisionId: string | null;
  chatSessionId?: string | null;
  sourceMessageId?: string | null;
  onClose: () => void;
}) {
  const narrow = useNarrow();
  const [review, setReview] = useState<MockupReview | null>(null);
  const [rev, setRev] = useState<MockupRevision | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<MockupErrorView | null>(null);
  const [notice, setNotice] = useState("");
  const [viewRevisionId, setViewRevisionId] = useState<string | null>(revisionId);
  const [screenId, setScreenId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportClass | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [changing, setChanging] = useState(false);
  const [comment, setComment] = useState("");
  const [commentScreen, setCommentScreen] = useState("");
  const [busy, setBusy] = useState(false);
  const [wide, setWide] = useState(false);
  const [srcMap, setSrcMap] = useState<Record<string, string>>({});
  const [zoomKey, setZoomKey] = useState<string | null>(null);
  const zoomTrigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try { setWide(parsePanelWide(window.localStorage.getItem(PANEL_WIDE_STORAGE_KEY))); } catch { /* 저장소를 못 읽으면 기본 폭 */ }
  }, []);
  const toggleWide = useCallback(() => {
    setWide((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(PANEL_WIDE_STORAGE_KEY, next ? "1" : "0"); } catch { /* 저장 실패는 무시 */ }
      return next;
    });
  }, []);
  const onAssetSrc = useCallback((key: string, src: string | null) => {
    setSrcMap((prev) => {
      if (src === null) {
        if (!(key in prev)) return prev;
        const rest = { ...prev };
        delete rest[key];
        return rest;
      }
      return { ...prev, [key]: src };
    });
  }, []);
  const openZoom = useCallback((key: string, trigger: HTMLElement) => { zoomTrigger.current = trigger; setZoomKey(key); }, []);
  const closeZoom = useCallback(() => {
    setZoomKey(null);
    const t = zoomTrigger.current;
    zoomTrigger.current = null;
    if (t && t.isConnected) t.focus();
  }, []);

  // 판본을 연속으로 바꿔도 마지막 선택만 반영한다: 요청마다 번호를 매기고 이전 요청은 취소한다.
  const loadSeq = useRef(0);
  const loadAbort = useRef<AbortController | null>(null);
  const shownRevisionId = useRef<string | null>(null);

  const load = useCallback(async (wantRevision: string | null) => {
    const seq = ++loadSeq.current;
    loadAbort.current?.abort();
    const ctl = new AbortController();
    loadAbort.current = ctl;
    const stale = () => seq !== loadSeq.current;
    setLoading(true);
    if (wantRevision) setViewRevisionId(wantRevision);
    try {
      const r = await mockupApi.getReview(project, reviewId, ctl.signal);
      if (stale()) return;
      const known = wantRevision && r.revisions.some((x) => x.revision_id === wantRevision) ? wantRevision : null;
      const target = known ?? r.latest_revision?.revision_id ?? null;
      const v = target ? await mockupApi.getRevision(project, reviewId, target, ctl.signal) : null;
      if (stale()) return;
      setReview(r);
      setRev(v);
      shownRevisionId.current = v?.revision_id ?? null;
      setViewRevisionId(target);
      setErr(null);
    } catch (e) {
      if (stale()) return;
      setViewRevisionId(shownRevisionId.current);
      setErr(e instanceof MockupApiError ? e.view : describeMockupError(0, null));
    } finally {
      if (!stale()) setLoading(false);
    }
  }, [project, reviewId]);

  useEffect(() => () => { loadSeq.current += 1; loadAbort.current?.abort(); }, []);

  useEffect(() => { void load(revisionId); }, [load, revisionId]);

  const groups = useMemo(() => (rev ? groupAssetsByScreen(rev) : []), [rev]);
  const group = groups.find((g) => g.screen.screen_id === screenId) ?? groups[0] ?? null;
  const activeViewport: ViewportClass | null = group
    ? (viewport && group.viewports.includes(viewport) ? viewport : group.viewports[0] ?? null)
    : null;
  const assets = group && activeViewport ? group.byViewport[activeViewport] ?? [] : [];

  const zoomItems: ZoomItem[] = rev
    ? assets.filter(isImageAsset).flatMap((a) => {
        const key = assetKey(rev.revision_id, a);
        const src = srcMap[key];
        return src ? [{ key, src, caption: assetCaption(a), viewport: a.viewport ?? "" }] : [];
      })
    : [];
  const zoomIndex = zoomKey ? zoomItems.findIndex((z) => z.key === zoomKey) : -1;

  const settled = !loading && !busy;
  const approveEnabled = canApprove(review, rev) && settled;
  const changeSource = resolveChangeSource(review, chatSessionId ?? null, sourceMessageId ?? null);
  const changeEnabled = canRequestChanges(review, rev) && settled && changeSource.ok;
  const changeAttempt = useRef<ChangeAttempt | null>(null);
  const viewingOld = !!review && !!rev && review.latest_revision?.revision_id !== rev.revision_id;

  const doApprove = useCallback(async () => {
    if (!review || !rev || !approveEnabled) return;
    setBusy(true);
    setNotice("");
    try {
      await mockupApi.approve(project, reviewId, approveBody(review, rev, newUuid()));
      setConfirming(false);
      setNotice("승인했습니다.");
      await load(rev.revision_id);
    } catch (e) {
      setConfirming(false);
      setErr(e instanceof MockupApiError ? e.view : describeMockupError(0, null));
    } finally {
      setBusy(false);
    }
  }, [review, rev, approveEnabled, project, reviewId, load]);

  const doChange = useCallback(async () => {
    if (!review || !rev || !comment.trim() || !changeEnabled || !changeSource.ok) return;
    // 같은 내용의 재전송(응답 유실 후 재시도)은 같은 요청 ID·본문을 그대로 다시 보내 서버가 중복 없이 처리하게 한다.
    const fingerprint = changeFingerprint(rev.revision_id, changeSource.messageId, comment, commentScreen || null);
    let attempt = changeAttempt.current;
    if (!attempt || attempt.fingerprint !== fingerprint) {
      attempt = {
        fingerprint,
        body: changeBody(review, rev, { comment, screenId: commentScreen || null },
          { changeRequestId: newUuid(), sourceMessageId: changeSource.messageId, idempotencyKey: newUuid() }),
      };
      changeAttempt.current = attempt;
    }
    setBusy(true);
    setNotice("");
    try {
      await mockupApi.requestChanges(project, reviewId, attempt.body);
      changeAttempt.current = null;
      setComment("");
      setCommentScreen("");
      setChanging(false);
      setNotice("수정 요청을 접수했습니다.");
      await load(rev.revision_id);
    } catch (e) {
      const view = e instanceof MockupApiError ? e.view : describeMockupError(0, null);
      if (!keepChangeAttempt(view.status)) changeAttempt.current = null;
      setErr(view);
    } finally {
      setBusy(false);
    }
  }, [review, rev, comment, commentScreen, changeEnabled, changeSource, project, reviewId, load]);

  const btn = (primary: boolean, enabled: boolean): React.CSSProperties => ({
    minHeight: TOUCH, minWidth: TOUCH, padding: "0 16px", borderRadius: 8, fontWeight: 800, fontSize: 13,
    border: primary ? 0 : "1px solid var(--border)",
    background: primary ? (enabled ? "#16a34a" : "#9ca3af") : "transparent",
    color: primary ? "#fff" : "var(--text-primary)",
    cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.6,
  });

  return (
    <aside aria-label="목업 검토" style={{
      width: panelWidthCss(wide, narrow), flexShrink: 0, borderLeft: "1px solid var(--border)",
      background: "var(--bg-card)", display: "flex", flexDirection: "column", height: "100%",
    }}>
      <header style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text-primary)", wordBreak: "break-word" }}>
            🖼 {review?.title || "목업 검토"}
          </div>
          <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 11.5, color: "var(--text-secondary)" }}>
            {review && (
              <span style={{ padding: "1px 8px", borderRadius: 999, border: `1px solid ${statusColor(review.status)}`, color: statusColor(review.status), fontWeight: 800 }}>
                {statusLabel(review.status)}
              </span>
            )}
            {rev && <span>판본 v{rev.revision}{rev.is_latest ? " (최신)" : ""}{rev.is_approved ? " · 승인본" : ""}</span>}
            <span>{project}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {!narrow && (
            <button type="button" onClick={toggleWide} aria-pressed={wide} title={wide ? "기본 폭으로 되돌립니다" : "패널을 넓게 펼칩니다"}
              style={{ minHeight: TOUCH, minWidth: TOUCH, padding: "0 10px", borderRadius: 8, border: `1px solid ${wide ? "var(--accent)" : "var(--border)"}`,
                       background: wide ? "rgba(37,99,235,.10)" : "transparent", color: wide ? "var(--accent)" : "var(--text-secondary)", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              {wide ? "↔ 기본 폭" : "↔ 넓게 보기"}
            </button>
          )}
          <button type="button" onClick={() => void load(viewRevisionId)} disabled={loading} aria-label="새로고침"
            style={{ minHeight: TOUCH, minWidth: TOUCH, border: 0, background: "transparent", color: "var(--text-secondary)", fontSize: 16, cursor: loading ? "wait" : "pointer" }}>↻</button>
          <button type="button" onClick={onClose} aria-label="닫기"
            style={{ minHeight: TOUCH, minWidth: TOUCH, border: 0, background: "transparent", color: "var(--text-secondary)", fontSize: 17, cursor: "pointer" }}>✕</button>
        </div>
      </header>

      <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "12px 14px" }}>
        {err && <ErrorBox err={err} onRefresh={() => void load(null)} />}
        {notice && <div role="status" style={{ marginBottom: 10, padding: 9, borderRadius: 8, border: "1px solid #16a34a", color: "#16a34a", fontSize: 12, fontWeight: 700 }}>{notice}</div>}
        {loading && !review && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>불러오는 중…</div>}

        {review && review.revisions.length > 1 && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 11.5, color: "var(--text-secondary)" }}>
            판본
            <select value={viewRevisionId ?? ""} onChange={(e) => void load(e.target.value)} disabled={busy}
              style={{ minHeight: TOUCH, flex: 1, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", padding: "0 8px" }}>
              {review.revisions.map((r) => (
                <option key={r.revision_id} value={r.revision_id}>
                  v{r.revision} · {statusLabel(r.status)}{r.is_latest ? " · 최신" : ""}{r.is_approved ? " · 승인본" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {viewingOld && (
          <div style={{ marginBottom: 10, padding: 9, borderRadius: 8, border: "1px solid #d97706", color: "#d97706", fontSize: 12 }}>
            지난 판본을 보고 있습니다. 승인·수정 요청은 최신 판본에서만 할 수 있습니다.
            <button type="button" onClick={() => void load(null)}
              style={{ marginLeft: 8, minHeight: TOUCH, padding: "0 12px", borderRadius: 8, border: "1px solid #d97706", background: "transparent", color: "#d97706", fontWeight: 800, cursor: "pointer" }}>
              최신 보기
            </button>
          </div>
        )}
        {review && review.unresolved_change_requests.length > 0 && (
          <details style={{ marginBottom: 10, fontSize: 12, color: "var(--text-primary)" }}>
            <summary style={{ cursor: "pointer", minHeight: 28 }}>미처리 수정 요청 {review.unresolved_change_requests.length}건</summary>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.55 }}>
              {review.unresolved_change_requests.map((c) => (
                <li key={c.change_request_id}>{c.screen_id ? `[${c.screen_id}] ` : ""}{c.comment}</li>
              ))}
            </ul>
          </details>
        )}

        {review && !loading && !rev && !err && (
          <div style={{ padding: 14, borderRadius: 9, border: "1px dashed var(--border)", color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.6 }}>
            아직 제출된 판본이 없습니다. 담당이 시안을 올리면 여기에 나옵니다.
          </div>
        )}

        {rev && <MockupHtmlLinks project={project} reviewId={reviewId} revision={rev} />}

        {rev && groups.length === 0 && (
          <div style={{ padding: 14, borderRadius: 9, border: "1px dashed var(--border)", color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.6 }}>
            이 판본에는 화면이 없습니다.
          </div>
        )}

        {group && (
          <>
            <div role="tablist" aria-label="화면" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6 }}>
              {groups.map((g) => {
                const on = g.screen.screen_id === group.screen.screen_id;
                return (
                  <button key={g.screen.screen_id} type="button" role="tab" aria-selected={on} title={g.screen.route}
                    onClick={() => { setScreenId(g.screen.screen_id); setViewport(null); }}
                    style={{ minHeight: TOUCH, padding: "0 14px", borderRadius: 8, flexShrink: 0, whiteSpace: "nowrap",
                             border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                             background: on ? "rgba(37,99,235,.10)" : "transparent",
                             color: on ? "var(--accent)" : "var(--text-primary)", fontWeight: on ? 800 : 600, fontSize: 12.5, cursor: "pointer" }}>
                    {g.screen.title}
                  </button>
                );
              })}
            </div>
            <div style={{ margin: "4px 0 8px", fontSize: 11, color: "var(--text-secondary)" }}>경로 {group.screen.route}</div>

            {group.viewports.length === 0 ? (
              <div style={{ padding: 14, borderRadius: 9, border: "1px dashed var(--border)", color: "var(--text-secondary)", fontSize: 12 }}>
                이 화면에 등록된 시안 자산이 없습니다.
              </div>
            ) : (
              <>
                <div role="group" aria-label="화면 크기" style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {group.viewports.map((v) => {
                    const on = v === activeViewport;
                    return (
                      <button key={v} type="button" aria-pressed={on} onClick={() => setViewport(v)}
                        style={{ minHeight: TOUCH, padding: "0 14px", borderRadius: 8,
                                 border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                                 background: on ? "var(--accent)" : "transparent",
                                 color: on ? "#fff" : "var(--text-primary)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                        {VIEWPORT_LABEL[v]}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
                  {assets.map((a) => (
                    <AssetImage key={`${rev!.revision_id}:${a.asset_id}`} project={project} reviewId={reviewId} revisionId={rev!.revision_id} asset={a}
                      onSrc={onAssetSrc} onOpen={openZoom} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {rev && (
        <footer style={{ borderTop: "1px solid var(--border)", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {changing && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <select aria-label="대상 화면" value={commentScreen} onChange={(e) => setCommentScreen(e.target.value)}
                style={{ minHeight: TOUCH, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", padding: "0 8px" }}>
                <option value="">전체(화면 지정 안 함)</option>
                {groups.map((g) => <option key={g.screen.screen_id} value={g.screen.screen_id}>{g.screen.title}</option>)}
              </select>
              <textarea aria-label="수정 요청 내용" value={comment} maxLength={4000} rows={4}
                onChange={(e) => setComment(e.target.value)} placeholder="고칠 내용을 적어 주세요"
                style={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", padding: 10, fontSize: 13, resize: "vertical" }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => void doChange()} disabled={!comment.trim() || !changeEnabled}
                  style={{ ...btn(true, !!comment.trim() && changeEnabled), background: comment.trim() && changeEnabled ? "#d97706" : "#9ca3af", flex: 1 }}>
                  {busy ? "보내는 중…" : "수정 요청 보내기"}
                </button>
                <button type="button" onClick={() => setChanging(false)} style={btn(false, true)}>취소</button>
              </div>
            </div>
          )}
          {!changeSource.ok && canRequestChanges(review, rev) && (
            <div role="note" style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--text-secondary)" }}>
              {changeSourceNotice(changeSource.reason)}
              {changeSource.reason === "other_session" && review?.session_id && (
                <a href={`/chat?mockup_review=${encodeURIComponent(reviewId)}&mockup_project=${encodeURIComponent(project)}${revisionId ? `&mockup_revision=${encodeURIComponent(revisionId)}` : ""}#${review.session_id}`}
                  style={{ display: "inline-flex", alignItems: "center", minHeight: TOUCH, marginLeft: 8, color: "var(--accent)", fontWeight: 800 }}>
                  연결된 채팅창 열기
                </a>
              )}
            </div>
          )}
          {!changing && (
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={!approveEnabled} onClick={() => setConfirming(true)} style={{ ...btn(true, approveEnabled), flex: 1 }}
                title={approveEnabled ? "이 판본을 승인합니다" : "검토 대기 상태의 최신 판본에서만 승인할 수 있습니다"}>
                승인
              </button>
              <button type="button" disabled={!changeEnabled} onClick={() => setChanging(true)} style={{ ...btn(false, changeEnabled), flex: 1 }}
                title={changeSource.ok ? undefined : changeSourceNotice(changeSource.reason)}>
                수정 요청
              </button>
            </div>
          )}
        </footer>
      )}

      {zoomIndex >= 0 && (
        <ImageLightbox items={zoomItems} index={zoomIndex} onIndex={(i) => setZoomKey(zoomItems[i]?.key ?? null)} onClose={closeZoom} />
      )}

      {confirming && review && rev && (
        <div role="dialog" aria-modal="true" aria-label="승인 확인" style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ width: "min(420px, 100%)", background: "var(--bg-card)", color: "var(--text-primary)", borderRadius: 12, padding: 18, border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>이 목업을 승인할까요?</div>
            <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
              「{review.title}」 판본 v{rev.revision}을 승인합니다. 승인은 로그인한 본인 이름으로 기록됩니다.
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} style={btn(false, !busy)}>취소</button>
              <button type="button" onClick={() => void doApprove()} disabled={busy} style={btn(true, !busy)}>
                {busy ? "승인 중…" : "승인합니다"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
