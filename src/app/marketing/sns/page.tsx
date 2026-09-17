export default function SnsPlannerPage() {
  return (
    <main className="h-full min-h-screen" style={{ background: "var(--bg-primary)" }}>
      <div className="flex h-screen flex-col">
        <div
          className="flex items-center justify-between gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}
        >
          <div>
            <h1 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              SNS 플래너
            </h1>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
              에이블리 광고분석의 광고 제안 판정 상품을 SNS 주제로 가져와 4주 업로드 일정과 촬영 체크리스트를 관리합니다. 주제·일정·체크 상태는 이 브라우저에 저장되며, 광고분석을 먼저 한 번 실행해야 판정 결과를 불러올 수 있습니다.
            </p>
          </div>
          <a
            href="/apps/sns-planner/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded px-3 py-2 text-sm font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            새 창 열기
          </a>
        </div>
        <iframe
          title="SNS 플래너"
          src="/apps/sns-planner/index.html"
          className="min-h-0 flex-1 border-0"
        />
      </div>
    </main>
  );
}
