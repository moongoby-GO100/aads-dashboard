import {
  isArtifactPreviewHref,
  isPreviewableTextFile,
  normalizeDocumentHref,
  normalizeDocumentRouteParams,
} from "./documentLinks";

type Case = {
  input: string;
  expected: string;
};

const cases: Case[] = [
  {
    input: "docs/reports/20260802_OHVIS_SYSTEM_CONSTRUCTION_PLAN.md",
    expected:
      "/docs?project=AADS&base_path=%2Fapp%2Fdocs&file_path=reports%2F20260802_OHVIS_SYSTEM_CONSTRUCTION_PLAN.md",
  },
  {
    input:
      "https://aads.newtalk.kr/docs?project=AADS&base_path=%2Fapp%2Freports&file_path=20260903_authenticated_collector_improvement_plan.md",
    expected:
      "/docs?project=AADS&base_path=%2Fapp%2Freports&file_path=20260903_authenticated_collector_improvement_plan.md",
  },
  {
    input:
      "/docs?project=AADS&base_path=%2Fapp%2Freports&file_path=20260903_authenticated_collector_improvement_plan.md",
    expected:
      "/docs?project=AADS&base_path=%2Fapp%2Freports&file_path=20260903_authenticated_collector_improvement_plan.md",
  },
  {
    input: "public/reports/monthly.xlsx",
    expected: "/reports/monthly.xlsx",
  },
  {
    input: "reports/monthly.xlsx",
    expected: "/docs?project=AADS&base_path=%2Fapp%2Freports&file_path=monthly.xlsx",
  },
  {
    input: "reports/GO100-303-strategy-card.md",
    expected:
      "/docs?project=GO100&base_path=%2Froot%2Fkis-autotrade-v4%2Freports&file_path=GO100-303-strategy-card.md",
  },
  {
    input: "docs/reports/GO100-303-strategy-card.md",
    expected:
      "/docs?project=GO100&base_path=%2Froot%2Fkis-autotrade-v4%2Fdocs&file_path=reports%2FGO100-303-strategy-card.md",
  },
  {
    input: "docs/reports/GO100-303-STRATEGY-CARD-FULL-SYNC-20260825.md",
    expected:
      "/docs?project=GO100&base_path=%2Froot%2Fkis-autotrade-v4%2Fdocs&file_path=reports%2FGO100-303-STRATEGY-CARD-FULL-SYNC-20260825.md",
  },
  {
    input: "/root/aads/aads-dashboard/public/reports/menu images/a.xlsx",
    expected: "/reports/menu%20images/a.xlsx",
  },
  {
    input: "https://aads.newtalk.kr/root/aads/aads-server/세무신고_필요항목_정리_20260818.xlsx",
    expected:
      "/api/v1/files/download?path=%2Froot%2Faads%2Faads-server%2F%EC%84%B8%EB%AC%B4%EC%8B%A0%EA%B3%A0_%ED%95%84%EC%9A%94%ED%95%AD%EB%AA%A9_%EC%A0%95%EB%A6%AC_20260818.xlsx",
  },
  {
    input: "scripts/apply_doc_fixes.py:12",
    expected: "/docs?project=AADS&base_path=%2Fapp&file_path=scripts%2Fapply_doc_fixes.py&line=12",
  },
  {
    input: "tests/test_project_docs.py",
    expected: "/docs?project=AADS&base_path=%2Fapp&file_path=tests%2Ftest_project_docs.py",
  },
  {
    input: "/app/app/static/reports/result.csv",
    expected: "/docs?project=AADS&base_path=%2Fapp%2Fapp%2Fstatic%2Freports&file_path=result.csv",
  },
  {
    input: "docs/../.env",
    expected: "docs/../.env",
  },
  // ── AADS-CHATFILE(2026-09-10) 채팅 파일 링크 회귀 케이스 ──
  // 대표 회귀자료: 세션 474e1681 의 `/tmp/aads-chat-continuity-directive-review.md`
  {
    input: "/tmp/aads-chat-continuity-directive-review.md",
    expected: "/api/v1/files/download?path=%2Ftmp%2Faads-chat-continuity-directive-review.md&inline=1",
  },
  // URL 인코딩된 tmp 경로 (모델이 경로 전체를 인코딩해 주는 경우)
  {
    input: "%2Ftmp%2Faads-chat-continuity-directive-review.md",
    expected: "/api/v1/files/download?path=%2Ftmp%2Faads-chat-continuity-directive-review.md&inline=1",
  },
  // 이중 인코딩까지 복구한다
  {
    input: "%252Ftmp%252Freview.md",
    expected: "/api/v1/files/download?path=%2Ftmp%2Freview.md&inline=1",
  },
  // 공백만 인코딩된 절대 경로 → 이중 인코딩되지 않아야 한다
  {
    input: "/tmp/aads%20report.md",
    expected: "/api/v1/files/download?path=%2Ftmp%2Faads+report.md&inline=1",
  },
  // 컨테이너 경로 표기
  {
    input: "/app/app/static/docs/PRD-ARTIFACT-DOC-LINK.md",
    expected: "/docs?project=AADS&base_path=%2Fapp%2Fapp%2Fstatic%2Fdocs&file_path=PRD-ARTIFACT-DOC-LINK.md",
  },
  // 호스트 경로 표기 (같은 문서)
  {
    input: "/root/aads/aads-server/app/static/docs/PRD-ARTIFACT-DOC-LINK.md",
    expected: "/docs?project=AADS&base_path=%2Fapp%2Fapp%2Fstatic%2Fdocs&file_path=PRD-ARTIFACT-DOC-LINK.md",
  },
  // 정상 인코딩된 /docs 쿼리는 건드리지 않는다 (디코딩 오작동 방지)
  {
    input: "/docs?project=AADS&base_path=%2Fapp%2Fdocs&file_path=reports%2Fplan.md",
    expected: "/docs?project=AADS&base_path=%2Fapp%2Fdocs&file_path=reports%2Fplan.md",
  },
  // 인코딩을 풀어도 상위 경로 탐색은 허용하지 않는다
  {
    input: "%2Ftmp%2F..%2Fetc%2Fpasswd",
    expected: "%2Ftmp%2F..%2Fetc%2Fpasswd",
  },
];

for (const item of cases) {
  const actual = normalizeDocumentHref(item.input);
  if (actual !== item.expected) {
    throw new Error(`normalizeDocumentHref(${item.input}) => ${actual}, expected ${item.expected}`);
  }
}

const routeCases = [
  {
    input: {
      project: "AADS",
      basePath: "/app/docs",
      filePath: "reports/GO100-303-STRATEGY-CARD-FULL-SYNC-20260825.md",
    },
    expected: {
      project: "GO100",
      basePath: "/root/kis-autotrade-v4/docs",
      filePath: "reports/GO100-303-STRATEGY-CARD-FULL-SYNC-20260825.md",
    },
  },
  {
    input: {
      project: "AADS",
      basePath: "/app/reports",
      filePath: "GO100-303-strategy-card.md",
    },
    expected: {
      project: "GO100",
      basePath: "/root/kis-autotrade-v4/reports",
      filePath: "GO100-303-strategy-card.md",
    },
  },
  {
    input: {
      project: "AADS",
      basePath: "/app/docs",
      filePath: "reports/20260802_OHVIS_SYSTEM_CONSTRUCTION_PLAN.md",
    },
    expected: {
      project: "AADS",
      basePath: "/app/docs",
      filePath: "reports/20260802_OHVIS_SYSTEM_CONSTRUCTION_PLAN.md",
    },
  },
];

for (const item of routeCases) {
  const actual = normalizeDocumentRouteParams(item.input);
  if (
    actual.project !== item.expected.project ||
    actual.basePath !== item.expected.basePath ||
    actual.filePath !== item.expected.filePath
  ) {
    throw new Error(
      `normalizeDocumentRouteParams(${JSON.stringify(item.input)}) => ${JSON.stringify(actual)}, expected ${JSON.stringify(item.expected)}`,
    );
  }
}

// ── 아티팩트 패널 미리보기 판정 ──
const previewCases: Array<{ input: string; expected: boolean }> = [
  { input: "/docs?project=AADS&base_path=%2Fapp%2Fdocs&file_path=a.md", expected: true },
  { input: "/api/v1/files/download?path=%2Ftmp%2Freview.md&inline=1", expected: true },
  // 텍스트 문서는 inline 플래그가 없어도 패널에서 연다 (예전엔 곧바로 다운로드로 빠졌다)
  { input: "/api/v1/files/download?path=%2Fapp%2Fapp%2Fpage.tsx", expected: true },
  { input: "/api/v1/files/download?path=%2Fapp%2Fscripts%2Frun.py", expected: true },
  // 패널이 그릴 수 없는 형식은 기존 다운로드 동작을 유지한다
  { input: "/api/v1/files/download?path=%2Froot%2Faads%2Freport.xlsx", expected: false },
  { input: "/reports/20260909_analysis.html", expected: true },
  { input: "/reports/monthly.xlsx", expected: false },
  { input: "https://example.com/report.md", expected: false },
  { input: "", expected: false },
];

for (const item of previewCases) {
  const actual = isArtifactPreviewHref(item.input);
  if (actual !== item.expected) {
    throw new Error(`isArtifactPreviewHref(${JSON.stringify(item.input)}) => ${actual}, expected ${item.expected}`);
  }
}

const textFileCases: Array<{ input: string; expected: boolean }> = [
  { input: "review.md", expected: true },
  { input: "page.tsx", expected: true },
  { input: "chart.png", expected: false },
  { input: "report.xlsx", expected: false },
  { input: "noext", expected: false },
];

for (const item of textFileCases) {
  const actual = isPreviewableTextFile(item.input);
  if (actual !== item.expected) {
    throw new Error(`isPreviewableTextFile(${JSON.stringify(item.input)}) => ${actual}, expected ${item.expected}`);
  }
}

console.log("documentLinks selftest: OK");
