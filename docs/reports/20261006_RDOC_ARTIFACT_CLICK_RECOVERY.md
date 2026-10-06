# 채팅 저장 문서 클릭 → 아티팩트 패널 열람 복구 보고서

- TASK_ID: AADS-RDOC-ARTIFACT-CLICK-RECOVERY-20261006 (P0-CRITICAL, SIZE M, 대상 `/root/aads/aads-dashboard`)
- 상태: **후보 코드 + 격리 미리보기(모킹 API) 검증 완료. 운영 미반영. 로그인된 실제 브라우저 E2E 미실행.**
- 기준 SHA: `1a5fbb88ccf1aa6404dc5b8b9b1a2a207a4dbdaa` (+ 미커밋 후보 변경). 이 세션은 commit/push 불가이므로 후보 SHA 없음 — 승인 후 Runner 가 commit 시 확정. 후보 diff sha256 은 `evidence_manifest.json` 에 기록.
- Goal/TODO `4b7e50e8-6bad-4edb-a7ba-b35a6bc5f71f` 는 완료 처리하지 않았다(운영 검증 전).

## 1. 원인

채팅 링크는 파일 기반 `/docs?base_path&file_path` 와 정적 경로만 열 수 있었다. 정본(canonical) 문서 참조 `{project, document_key, revision}` 에는 대시보드 딥링크가 없었고(백엔드 `viewer_url=None`), 인증된 열람 경로도 없었다. 세션 파일 탭은 아티팩트를 열지 않고 페이지를 이동시켰다. 실패 상태는 문구뿐이라 재시도·로그인·정본 찾기 동작이 없었고, 응답이 없으면 "불러오는 중"이 영구히 남을 수 있었다.

## 2. STEP 0 기존 구현 분류

| 대상 | 분류 | 비고 |
|---|---|---|
| `chat/page.tsx` 문서 링크 핸들러(`handleDocumentLinkClickStable`) | 수정 | 정본 분기·시도별 타임아웃·재시도·실패 메타 추가. 파일/정적 링크 분기는 유지 |
| `documentArtifactIdFromHref` | 수정 | 해시 접미 ID (서로 다른 링크가 같은 아티팩트를 덮어쓰지 않게) |
| `ChatArtifactPanel.tsx` 파일 탭 | 수정 | 정본 문서 목록 섹션, 클릭 시 이탈 없이 아티팩트로 열기, 실패 복구 버튼 |
| `docs/page.tsx`, `CanonicalDocuments.tsx` | 수정 | 딥링크 `?tab=canonical&project&document_key[&revision]` 로 해당 문서 선택 |
| `src/lib/canonicalDocLinks.ts` (+selftest) | 신규 | 링크 생성/파싱, 인증 경로, 상세 API 폴백 매퍼. 지시서 TARGET 밖 신규 파일 — 순수 함수 분리 및 selftest 필요 |
| `tests/chat-modernization/rdoc-artifact-click.test.mjs` | 신규 | 소스 계약 회귀 테스트 |
| HTML 격리 렌더(`html_preview`), MarkdownRenderer, `documentLinks.ts`, `api.ts` | 유지 | 무변경 |
| 삭제 | 없음 | 일괄 키/경로 변경 없음 |

## 3. 변경 내용

1. 정본 링크: `/docs?tab=canonical&project=AADS&document_key=<key>[&revision=N][&approved_only=1]`. 파일 경로·인증 없는 raw API 주소는 링크로 쓰지 않는다.
2. 클릭 시 로그인 세션 인증(`chatApi`, Bearer)으로 `GET /projects/{P}/documents/{key}/content` 를 읽어 아티팩트 패널에 본문 표시. 저장된 한글 제목을 그대로 표시하고 개정·버전·상태 메타 한 줄 표시.
3. `/content` 라우트가 없는 서버(라우트 부재 404)는 상세 API(`/documents/{key}`)로 폴백. 요청 개정과 다르면 거짓으로 채우지 않고 실패 처리.
4. 레거시 파일 링크도 같은 실패 처리 체계 사용(한글·공백·괄호 파일명 지원). 바이너리(PDF 등)는 인증 fetch 로 받은 본문을 blob 다운로드 링크로 연다.
5. 시도당 20초 타임아웃 + 일시 오류만 자동 재시도(400ms/1.2s). 실패 시 `doc-recovery` 영역: 다시 시도, 401 은 로그인 복구, 403/404 는 "문서 정본에서 찾기".
6. 세션 파일 탭의 정본 문서 목록(`canonical_documents`)을 클릭하면 이탈 없이 같은 경로로 아티팩트를 연다.
7. 복구 버튼 색을 강조색+흰 글자로 고정(미리보기 화면에서 어두운 배경/어두운 글자 조합으로 안 읽히던 결함을 E2E 스크린샷으로 발견해 수정).

## 4. 실제 실행한 검증 (결과 그대로)

| 항목 | 결과 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm run selftest` | 12/12 파일 통과 (신규 `canonicalDocLinks.selftest.ts` 포함, 단독 실행 EXIT 0) |
| `npm run test:chat` | 60/60 통과 (신규 8건 포함) |
| `npx vitest run` | 6 파일 / 51건 통과 |
| `npm run lint:chat` | **실패: 경고 29 > 상한 23**. HEAD 기준선과 동일(page.tsx 25 + 패널 3, 변경 줄 내 신규 경고 0). 기존 상태이며 이번 변경이 추가한 경고는 없다 |
| 격리 미리보기 Playwright(모킹 API) | **29/29 통과** (아래) |

### 격리 미리보기 검증 (MOCK API — 운영 E2E 아님)

- 방식: 워크트리 후보 코드를 `next dev --webpack`(127.0.0.1:3927, 빌드/배포 아님)으로 띄우고 Chromium 으로 `/chat#<세션>` 접속, `/api/v1/**` 응답만 Playwright route 로 대체. 토큰은 가짜(`MOCK.TOKEN`). 운영 호스트 호출 0건.
- 통과 항목: 정본 클릭→본문, 한글 제목, 개정 메타, 인증 `/content?revision=3` 호출, 세션 문서 목록 클릭(이탈 없음·재조회), HTML sandbox iframe 격리(속성 존재·same-origin 미허용·상위 문서 영향 없음), 레거시 PDF blob 다운로드 링크, 한글/공백/괄호 레거시 파일, `/content` 미배포 서버 폴백, 403·404 복구 UI, 직접 링크 401 → 패널 로그인 복구+재시도, 503 반복→실패→다시 시도→성공, 무응답→20초 제한 후 실패 상태(62초, 영구 로딩 아님), 정본 401→앱 전역 정책대로 `/login?next=%2Fchat&reason=session_expired`, 모바일(390px) 정본 열람·폭 초과 없음·404 복구.
- 산출물: `docs/reports/20261006_rdoc_artifact_click_recovery_evidence/` (스크립트 `rdoc_mock_e2e.py`, 결과 JSON, 스크린샷 15장, `evidence_manifest.json`).
- 한계: 실제 백엔드·실제 로그인·실제 데이터가 아니므로 "운영에서 클릭하면 열린다"의 증거가 아니다.

### 로그인된 실제 브라우저 E2E: **미실행**

사유: 로그인 자격 증명 없음(Vault 값 미사용), 후보 코드는 운영 미반영(빌드·배포 금지). 폴백(HTTP → API health → process) 실측: 대시보드 `/docs` 200, `/chat` 307(로그인 유도), API `/api/v1/health` 200 `status ok`, next-server·uvicorn 프로세스 존재, 비인증 `/documents/*/content` 401(라우트 존재 여부는 판별 불가).

### 승인 게이트 증거(`screen_e2e_evidence_required`) 상태

**통과 아님.** 게이트는 `schema=aads.e2e_verify.v1` 이면서 `passed`·`dom_assertion`·`screenshot` 이 모두 참인 Runner `run_e2e_verify` 로그만 인정한다. 이 보고서와 `evidence_manifest.json`(스키마 `aads.rdoc_candidate_evidence.v1`)은 의도적으로 그 형식이 아니며, 모킹 결과를 게이트 증거로 위장하지 않았다. 배포 후 Runner 가 로그인된 `/chat` 에서 생성해야 한다.

### 승인 후 Runner 빌드 검증 대상 (미실행)

`npm run build`/이미지 빌드, blue-green 후보 헬스, 로그인된 운영 화면 `run_e2e_verify`. 이 세션에서는 실행하지 않았다.

## 5. 이전 작업과 합친 완료/미완료 구분

| 항목 | 상태 | 근거 |
|---|---|---|
| 규칙 저장 | 이 세션에서 확인/수행 안 함 | 이전 작업 산출물 판정 대상. 여기서는 검증하지 않았다 |
| 실제 프롬프트 적용 | 확인 안 함 | 동일 |
| 원격 Runner 전달 | 확인 안 함 | 동일 |
| 정본 등록(백엔드) | 백엔드 커밋 9c2214d2 가 origin/main 에 있음을 코드로 확인. **운영 배포 여부는 미검증** | 비인증 `/content` 401 만 확인 |
| 정본 등록(이 보고서) | **미수행** | `handover_write`·정본 등록 도구가 이 세션에 없음 |
| 클릭 열람 | 후보 코드 + 모킹 환경에서만 확인. 운영 **미확인** | 위 격리 미리보기 |
| 운영 배포 | **미수행**(별도 승인 대기) | |

## 6. 알려진 한계 / 주의

- 정본 `/content` 는 항상 `text/markdown`(백엔드 코드 확인)이다. 정본에 PDF 는 존재하지 않으며 PDF 는 레거시 파일 경로로만 열린다. HTML 정본은 `source_path` 확장자가 `.html` 일 때 격리 렌더링된다.
- 실패 시 다운로드 버튼은 없다(본문을 못 받았으므로 허용된 다운로드 대상이 없음). 다운로드는 성공적으로 받은 비텍스트 파일에만 제공한다.
- 앱 전역 401 처리는 `next` 에 `#세션ID` 를 포함하지 않아 재로그인 후 `/chat` 로 돌아온다(마지막 세션은 localStorage 로 복원됨). 이번 범위 밖이라 변경하지 않았다.
- 정본 401 은 전역 정책으로 즉시 로그인 화면으로 이동한다. 패널의 "다시 로그인"은 전역 처리가 닿지 않는 직접 fetch 링크 401 에서 나타난다.
- 미리보기 `next dev` 프로세스(PID 파일 `/tmp/rdoc_next_dev.pid`, 127.0.0.1:3927)는 kill 금지 규칙 때문에 종료하지 못했다. Runner/운영자가 정리 필요. 이 프로세스가 `AGENTS.md`·`next-env.d.ts` 를 건드려 HEAD 내용으로 복원했다.
- `lint:chat` 상한 초과는 기존 상태다(위 표).
- Vault 값·자격 증명은 읽거나 기록하지 않았다.

## 7. 운영 배포 계획 (별도 승인 대기, 이 세션은 실행하지 않음)

**변경 목록**: `ChatArtifactPanel.tsx`, `chat/page.tsx`, `docs/CanonicalDocuments.tsx`, `docs/page.tsx` 수정 / `canonicalDocLinks.ts`, `canonicalDocLinks.selftest.ts`, `rdoc-artifact-click.test.mjs` 신규 / 증거·보고서 문서.
**선행 조건**: aads-server 9c2214d2(`/content`, `canonical_documents` 세션 응답)가 운영에 반영됐는지 확인. 미반영이어도 상세 API 폴백으로 열리지만 세션 파일 탭의 정본 목록은 비어 있을 수 있다.
**배포 계약**(`/root/aads/AGENTS.md`, `deploy.sh`): 릴리스 SHA 당 이미지 1회 빌드, 후보·대기 슬롯 `--no-build` 기동 및 동일 digest, 후보 헬스 통과 후에만 nginx lock, 외부 헬스 실패 시 upstream 롤백, 이전 활성 슬롯은 스트림 drain 전 재시작 금지.
**롤백**: 문제 시 `git revert <후보 SHA>` 후 같은 blue-green 재배포, 또는 이전 SHA `1a5fbb88` 이미지로 upstream 복귀(`deploy.sh` 롤백 경로).
**5분 P0/P1 모니터링**: `/login`·`/chat`·`/docs` 응답, `/api/v1/health`, 대시보드 5xx/콘솔 오류 비율, `/projects/*/documents/*/content` 4xx/5xx 비율, chat 401 급증 여부. 이상 시 즉시 롤백.
**배포 후 검증**: 로그인된 `/chat` 에서 정본 링크 클릭 → 본문·한글 제목 확인, 세션 만료/403/404/재시도, 모바일, `run_e2e_verify` 증거 등록. 그 후에만 TODO 완료 처리.

## 8. 남은 작업 (이 세션에서 하지 못함)

1. `handover_write` project=AADS, entry_type=verification, entry_key=`rdoc-unified-artifact-recovery-20261006` — 도구 부재로 미수행. 저장소 `HANDOVER.md` 에는 안전한 요약 항목을 추가했다.
2. 이 보고서의 정본 문서 등록과 한글 제목 링크 클릭 검증 — 도구 부재로 미수행.
3. Runner: commit/push/빌드/배포(승인 후), 실제 로그인 E2E 증거 생성.
