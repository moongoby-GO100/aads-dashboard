export default function AblyMarketingAnalyzerPage() {
  return (
    <main className="h-full min-h-screen" style={{ background: "var(--bg-primary)" }}>
      <div className="flex h-screen flex-col">
        <div
          className="flex items-center justify-between gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}
        >
          <div>
            <h1 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              에이블리 광고분석
            </h1>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
              엑셀 업로드 후 자체상품코드 기준으로 최근 7일, 직전 7일, 묶음 캠페인 손익을 계산합니다.
            </p>
          </div>
          <a
            href="/apps/ably-ad-analyzer/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded px-3 py-2 text-sm font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            새 창 열기
          </a>
        </div>
        <iframe
          title="에이블리 광고분석"
          src="/apps/ably-ad-analyzer/index.html"
          className="min-h-0 flex-1 border-0"
        />
      </div>
    </main>
  );
}
