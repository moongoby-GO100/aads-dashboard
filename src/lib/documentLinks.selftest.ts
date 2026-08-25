import { normalizeDocumentHref } from "./documentLinks";

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
];

for (const item of cases) {
  const actual = normalizeDocumentHref(item.input);
  if (actual !== item.expected) {
    throw new Error(`normalizeDocumentHref(${item.input}) => ${actual}, expected ${item.expected}`);
  }
}
