"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type RenderState = "loading" | "ok" | "failed";

type Props = {
  chart: string;
  className?: string;
  style?: CSSProperties;
  /** 파싱 실패 시 원본을 보여줄 <pre> 에 적용. 호출부의 기존 모양을 유지하기 위한 것. */
  fallbackClassName?: string;
  fallbackStyle?: CSSProperties;
};

/**
 * Mermaid 텍스트를 SVG 로 렌더한다.
 *
 * 설계 전제 — 다이어그램은 언제든 깨진다(LLM 산출물, 추출기 산출물 모두).
 * 그래서 렌더 실패가 내용 유실이나 페이지 사망으로 번지지 않게 하는 것이 이 컴포넌트의 계약이다.
 *   1) render 가 throw 하면 원본 텍스트를 <pre> 로 그대로 보여준다.
 *   2) mermaid 가 body 에 남기는 에러 DOM 을 회수한다.
 *   3) 성공해도 '원본 보기' 로 mmd 텍스트를 대조할 수 있게 한다.
 */
export default function MermaidDiagram({
  chart,
  className,
  style,
  fallbackClassName,
  fallbackStyle,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<RenderState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // render 실패 시 mermaid 가 이 id 로 body 에 잔여 DOM 을 남긴다. 회수하려면 id 를 알고 있어야 한다.
    const renderId = `aag-mermaid-${Math.random().toString(36).slice(2, 10)}`;

    const removeScratchNodes = () => {
      for (const id of [renderId, `d${renderId}`]) {
        const node = document.getElementById(id);
        // mermaid.render()가 반환한 SVG도 renderId를 가진다. host에 삽입한
        // 최종 SVG까지 지우면 state는 ok인데 화면은 빈 영역으로 남는다.
        if (node && !hostRef.current?.contains(node)) node.remove();
      }
    };

    setState("loading");
    setErrorMessage("");
    if (hostRef.current) hostRef.current.innerHTML = "";

    (async () => {
      try {
        // 정적 import 금지 — mermaid 는 모듈 로드 시점에 DOM 을 건드려 SSR 빌드를 깬다.
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "dark",
        });
        const { svg } = await mermaid.render(renderId, chart);
        if (cancelled) return;
        if (hostRef.current) hostRef.current.innerHTML = svg;
        setState("ok");
      } catch (e) {
        if (cancelled) return;
        if (hostRef.current) hostRef.current.innerHTML = "";
        setErrorMessage(e instanceof Error ? e.message : String(e));
        setState("failed");
      } finally {
        // 성공/실패 무관하게 body 잔여물만 치운다. host의 최종 SVG는 보존한다.
        removeScratchNodes();
      }
    })();

    return () => {
      cancelled = true;
      removeScratchNodes();
    };
  }, [chart]);

  const sourceBlock = (
    <pre
      className={fallbackClassName}
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        overflowX: "auto",
        scrollbarWidth: "thin",
        fontFamily: "monospace",
        fontSize: "12px",
        margin: 0,
        ...fallbackStyle,
      }}
    >
      {chart}
    </pre>
  );

  if (state === "failed") {
    return (
      <div className={className} style={style}>
        <div
          style={{
            fontSize: "11px",
            color: "#fca5a5",
            marginBottom: "6px",
          }}
          title={errorMessage}
        >
          {"⚠️ 다이어그램 파싱 실패 — 원본 텍스트를 표시합니다."}
        </div>
        {sourceBlock}
      </div>
    );
  }

  return (
    <div className={className} style={style}>
      {state === "loading" && (
        <div style={{ fontSize: "11px", opacity: 0.6, marginBottom: "6px" }}>
          {"다이어그램 렌더링 중…"}
        </div>
      )}
      <div ref={hostRef} style={{ overflowX: "auto", scrollbarWidth: "thin" }} />
      {state === "ok" && (
        <div style={{ marginTop: "6px" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowSource((v) => !v);
            }}
            style={{
              background: "transparent",
              border: "1px solid currentColor",
              borderRadius: "6px",
              color: "inherit",
              cursor: "pointer",
              fontSize: "11px",
              opacity: 0.7,
              padding: "2px 8px",
            }}
          >
            {showSource ? "원본 숨기기" : "원본 보기"}
          </button>
          {showSource && <div style={{ marginTop: "6px" }}>{sourceBlock}</div>}
        </div>
      )}
    </div>
  );
}
