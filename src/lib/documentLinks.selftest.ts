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
    input: "reports/monthly.xlsx",
    expected: "/docs?project=AADS&base_path=%2Fapp%2Freports&file_path=monthly.xlsx",
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
