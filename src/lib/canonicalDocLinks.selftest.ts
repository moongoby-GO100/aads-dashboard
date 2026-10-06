import {
  buildCanonicalDocHref,
  canonicalContentPath,
  canonicalDetailPath,
  canonicalDisplayTitle,
  canonicalStatusLabel,
  contentFromDetail,
  parseCanonicalDocHref,
} from "./canonicalDocLinks";
import { isArtifactPreviewHref, normalizeDocumentHref } from "./documentLinks";

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${name}: got ${a}, expected ${e}`);
}

const href = buildCanonicalDocHref({ project: "aads", documentKey: "rdoc-click-recovery-plan", revision: 3 });
check("build", href, "/docs?tab=canonical&project=AADS&document_key=rdoc-click-recovery-plan&revision=3");
check("round trip", parseCanonicalDocHref(href), {
  project: "AADS", documentKey: "rdoc-click-recovery-plan", revision: 3, approvedOnly: undefined,
});
check("approved flag", parseCanonicalDocHref(buildCanonicalDocHref({ project: "AADS", documentKey: "k1", approvedOnly: true }))?.approvedOnly, true);

// 파일 링크·잘못된 키·잘못된 개정은 정본 링크가 아니다 → 기존 처리 경로 유지
check("file link is not canonical", parseCanonicalDocHref("/docs?project=AADS&base_path=%2Fapp%2Fdocs&file_path=a.md"), null);
check("path traversal key", parseCanonicalDocHref("/docs?project=AADS&document_key=..%2Fetc%2Fpasswd"), null);
check("raw api url", parseCanonicalDocHref("/api/v1/projects/AADS/documents/k1/content"), null);
check("bad revision", parseCanonicalDocHref("/docs?project=AADS&document_key=k1&revision=0"), null);
check("bad revision text", parseCanonicalDocHref("/docs?project=AADS&document_key=k1&revision=abc"), null);
check("missing project", parseCanonicalDocHref("/docs?document_key=k1"), null);

// 서버 계약 경로: 인증 API 의 /content (파일 경로 아님)
check("content path", canonicalContentPath({ project: "AADS", documentKey: "k1", revision: 2 }), "/projects/AADS/documents/k1/content?revision=2");
check("content path approved", canonicalContentPath({ project: "AADS", documentKey: "k1", approvedOnly: true }), "/projects/AADS/documents/k1/content?approved_only=true");
check("detail path", canonicalDetailPath({ project: "AADS", documentKey: "k1" }), "/projects/AADS/documents/k1");

// 링크 정규화·패널 판정을 통과한다 (채팅 마크다운 → 아티팩트 클릭)
check("normalize keeps canonical link", normalizeDocumentHref(href), href);
check("same-site absolute canonical link", normalizeDocumentHref(`https://aads.newtalk.kr${href}`), href);
check("preview href", isArtifactPreviewHref(href), true);

// 표시 제목: 저장된 한글 제목 그대로, 없을 때만 문서 키
check("hangul title", canonicalDisplayTitle({ project: "AADS", documentKey: "k1" }, { canonical: { title: "문서 열람 복구 계획서 (최종)" } }), "문서 열람 복구 계획서 (최종)");
check("fallback key", canonicalDisplayTitle({ project: "AADS", documentKey: "k1" }, {}), "k1");
check("status approved", canonicalStatusLabel("approved", true), "승인됨");
check("status draft", canonicalStatusLabel(undefined, false), "초안");

// 구버전 서버(/content 미배포) 폴백: 요청 개정이 다르면 거짓으로 채우지 않는다
const detail = { revision: { revision: 4, id: "r4", version: "1.0.0", title: "한글 제목", content: "# 본문" }, status: "draft", authoritative: false };
check("fallback latest", contentFromDetail({ project: "AADS", documentKey: "k1" }, detail)?.content, "# 본문");
check("fallback same revision", contentFromDetail({ project: "AADS", documentKey: "k1", revision: 4 }, detail)?.canonical?.revision, 4);
check("fallback other revision refused", contentFromDetail({ project: "AADS", documentKey: "k1", revision: 2 }, detail), null);
check("fallback no revision", contentFromDetail({ project: "AADS", documentKey: "k1" }, { revision: null }), null);
