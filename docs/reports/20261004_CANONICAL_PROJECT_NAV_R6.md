# AADS-CANONICAL-PROJECT-NAV-R6-20261004 — /docs 정본 프로젝트 선택과 파일 scan 분리

- 실측 시각: 2026-10-04 07:13 KST 착수 ~ 07:25 KST 검증 종료 (서버 `date` 기준)
- 상태: 후보 코드 수정 + 로컬 후보 화면 검증 완료. **운영 미배포.** "운영 ACCT 해결"은 주장하지 않는다.
- commit/push: 이 세션에서 실행하지 않음 (규칙상 금지). 후보 SHA 없음 — 승인 후 Runner가 commit/push 하며 SHA는 그때 확정.
- 비용: $ 미측정 (LLM 호출 외 별도 과금 작업 없음, 사용량 집계 도구 접근 없음).
- Goal 자동 완료 처리하지 않음.

## STEP 0 기존 구현 조사 (분류)

| 대상 | 분류 | 비고 |
|---|---|---|
| `page.tsx` `DocsPage` scan(`fetchDocs`, `DOCS_CACHE_KEY`, 파일 탭 loading/error) | 유지 | scan loading/error는 파일 탭 내부에서만 쓰이며 정본 탭을 막는 게이트가 아님을 확인 |
| `page.tsx` 정본 탭 `project={selectedProject==="all"?"AADS":selectedProject}`, `onProjectChange={setSelectedProject}` | 수정 | 파일 탭 필터와 상태를 공유해, 정본에서 ACCT 선택 시 파일 탭이 빈 목록이 되는 부작용 → `canonicalProject` 독립 상태로 분리 |
| `page.tsx` `projects={data?.projects...}` 전달 | 유지 | scan 결과는 "추가 후보" 보강용으로만 남김 |
| `CanonicalDocuments` 버튼 `Set(["AADS",...projects])` | 수정 | `mergeCanonicalProjects(projects)`로 교체 (레지스트리 + scan 보강) |
| `CanonicalDocuments` `reloadList`/`reloadDetail`/`act` | 수정 | 프로젝트 전환 중 stale 응답/`act()` 후속 재조회가 새 프로젝트 상태를 덮어쓰지 않도록 가드 |
| `CanonicalDocuments` `errorText` + 항상 노출되던 "로그인 복구" 링크 | 수정 | 401/403/409/네트워크 분류. 403에 로그인 링크를 보이던 오안내 제거 |
| 승인/상태 변경 모달, 개정 이력, 최신 개정판·승인 포인터 표시 | 유지 | 로직 무변경 |
| `src/lib/canonicalProjects.ts`, `.test.ts` | 신규 | 아래 설명. 지시서 TARGET_FILES 밖의 신규 파일 — 사유: 순수 함수로 분리해야 node 환경 vitest(jsdom/testing-library 미설치)로 회귀 테스트 가능 |
| `vitest.config.mts` include | 수정(1줄) | 신규 테스트 등록. TARGET_FILES 밖 — 사유 동일 |
| 삭제 | 없음 | |

## 변경 내용

1. **탐색과 scan 분리**: 정본 탭의 프로젝트 버튼은 앱이 이미 쓰는 프로젝트 키 목록(goals 화면 `PROJECTS`와 동일 키: AADS, ACCT, GO100, KIS, SF, NTV2, NAS, FOOD, LAW, COM, DESIGN, KAKAOBOT)을 `CANONICAL_NAV_PROJECTS`로 두고, scan이 알려준 키는 백엔드 `PROJECT` 정규식(`^[A-Z0-9][A-Z0-9_-]{0,63}$`)을 통과할 때만 추가한다. scan이 pending/실패/빈 결과여도 ACCT·GO100 등을 바로 선택할 수 있다.
   - 새 broad 열거 API, 권한 우회, ACCT 단발 하드코딩은 쓰지 않았다. 버튼은 탐색용일 뿐이며 접근 권한은 기존 `GET /projects/{key}/documents`의 grant 검사(401/403)가 그대로 결정한다.
   - 한계: 백엔드에는 "내 권한 프로젝트 목록" API가 없어(`app/api/canonical_documents.py`는 프로젝트별 grant 조회만 있음) grant 없는 프로젝트 버튼도 보이고, 누르면 403 안내가 뜬다. 이 목록이 goals 화면과 별도로 프론트에 중복 정의된다는 점도 한계다(`goals/page.tsx`, `ChatArtifactPanel.tsx`, `agent-vault` 등에 각자 상수가 있음). 공용 레지스트리 통합은 범위 밖이라 하지 않았다.
2. **정본 프로젝트 상태 분리**: `canonicalProject`(기본 AADS)를 파일 탭 `selectedProject`와 분리.
3. **stale 방지**: `projectRef`로 현재 프로젝트를 추적. 이전 프로젝트 클로저가 실행하는 `reloadList`/`reloadDetail`은 즉시 반환(요청 카운터도 건드리지 않음)하고, `act()` 실패 후 에러 표시도 프로젝트가 같을 때만 반영. 선택 문서는 `{project,key}`로 보관해 프로젝트 전환 시 이전 키로 새 프로젝트 상세를 조회하는 순간 요청을 없앴다.
4. **오류 상태**: 401(로그인 복구 링크 표시), 403(프로젝트명 포함 권한 안내, 로그인 링크 없음, 다른 프로젝트 선택 안내), 409, 네트워크(URL 정제 후 120자 이내, 재시도 버튼 유지). 목록 오류 시 이전 목록은 비운다.

## 변경 파일

- `src/app/docs/page.tsx` (수정)
- `src/app/docs/CanonicalDocuments.tsx` (수정)
- `src/lib/canonicalProjects.ts`, `src/lib/canonicalProjects.test.ts` (신규)
- `vitest.config.mts` (수정, include 1건)
- `docs/reports/20261004_CANONICAL_PROJECT_NAV_R6.md`, `docs/reports/20261004_canonical_project_nav_R6_evidence/` (신규)

## 실제 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit --incremental false` | 통과 (출력 없음). worktree에는 node_modules가 없어 공유 checkout의 `node_modules`를 임시 심볼릭 링크로 사용 후 제거 |
| `npx vitest run src/lib/canonicalProjects.test.ts src/lib/chatDeepLink.test.ts` | 2 files / 16 tests 통과 (신규 테스트: scan 비어있음/undefined에서 ACCT·GO100 제공, scan 키 병합·잘못된 키 제외, 401/403/409/네트워크 분류) |
| `npx eslint` (CanonicalDocuments.tsx, canonicalProjects.ts) | 경고/오류 없음 |
| `npm run build` / `next build` | **실행하지 않음 — 승인 후 Runner 빌드 검증 대상** |
| 후보 화면 Playwright (MOCK API) | 36건 중 36 통과, 실패 0 (`r6_mock_e2e_results.json`) |

### 후보 화면 검증의 성격 — 반드시 구분

- 방식: 이 worktree 코드를 `next dev --webpack`(127.0.0.1:3917)로 띄우고 Chromium headless Playwright로 구동. **`/api/v1/**` 응답은 모두 Playwright route fixture(mock)**다. 정상 backend·운영 인증·실제 pilot 본문에 연결하지 않았다(안전한 인증 경로/토큰을 이 세션에서 사용할 수 없었고, 비밀 노출 금지). 따라서 **이것은 실제 E2E 통과가 아니다.** pilot119/74/92/109/110 "승인 본문·revision" 표시는 fixture 내용(`[MOCK]` 접두 본문)이 화면에 렌더링됨을 확인한 것이지, 운영 데이터 확인이 아니다.
- 검증된 것(mock 한정): 데스크톱 1366px/모바일 390px 각각 scan=pending·error·ok 세 조건에서 (a) ACCT 버튼 노출·선택, (b) ACCT 목록 4건, (c) pilot119 최신 초안 v3 + 승인 정본 v2 동시 표시, (d) AADS pilot74/92/109/110 목록과 pilot92 최신/승인 포인터 표시; AADS 응답 지연 중 ACCT로 전환 시 늦게 온 AADS 목록이 덮어쓰지 않음; GO100 403에서 권한 안내·로그인 링크 없음·재시도 버튼 표시, 이후 ACCT 전환 시 복구; 정본에서 ACCT 선택 후 파일 탭의 scan 파일이 그대로 표시.
- 검증하지 못한 것: `act()` 승인/보관 실행 중 프로젝트 전환 경로(코드 가드만 추가, 자동 테스트 없음), 실제 backend grant 403/200, 실제 운영 scan 지연, 모바일 파일 탭 상세.
- 캡처(`*.png`)에는 mock 토큰(`mock-not-a-secret`)만 사용되었고 URL/JWT/cookie는 포함되지 않음. 재현 스크립트: `r6_mock_e2e.py` (`PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright`, 서버는 `NEXT_PUBLIC_API_URL=http://127.0.0.1:3917/api/v1`로 기동). 종료 시 pending 요청 취소로 나오는 asyncio CancelledError 로그는 의도된 pending-scan 시나리오의 부산물이다.

## 운영/배포 상태

- 운영 dashboard는 변경 전 그대로다. 운영 `/docs` 정본 탭에서 ACCT 버튼은 승인·배포 전까지 계속 보이지 않는다(R5 관측과 동일).
- 배포 권장(승인 게이트 유지): Runner가 commit/push 후 `bash deploy.sh`(릴리스 SHA 1회 빌드)로 배포. 배포 뒤 확인 항목: 운영 `/docs` 정본 탭에서 ACCT 버튼 → `GET /api/v1/projects/ACCT/documents` 200/4건, pilot119 승인 본문·revision 표시; 같은 계정으로 AADS pilot74/92/109/110.
- 롤백: 이전 dashboard 릴리스 SHA 이미지(`aads-dashboard:<이전 SHA>`)로 `deploy.sh` 재실행. 변경이 프론트 2파일 + 신규 lib 1개라 `git revert` 도 가능.
- 남은 권한 검증: 실제 사용자 계정으로 ACCT/GO100 grant 유무별 200·403 동작을 운영(또는 preprod)에서 확인해야 한다. 이 후보 검증은 mock이라 대체하지 못한다.

## 작업 환경 주의 (Runner 확인 필요)

- 검증용으로 시작한 `next dev` 프로세스(PID 1359030, 127.0.0.1:3917)를 종료하지 못했다(kill 금지 규칙). 읽기 전용 개발 서버이며 Runner가 정리해야 한다. 이 서버의 `/tmp/r6-nextdev.log`에는 secret이 없다.
- `next dev`가 자동 수정한 `AGENTS.md`, `next-env.d.ts`는 원상 복구했다. `git status`상 변경은 위 파일들뿐이다.
- `node_modules` 심볼릭 링크는 제거했다. `.next/`는 `.gitignore` 대상이다.

## DB handover

- 요구: `project=AADS`, `entry_key=aads-canonical-project-nav-r6-20261004`, `entry_type=task`.
- **DB `handover_write`는 이 세션에서 호출할 수 없어 실행하지 못했다**(임의 스크립트로 운영 DB에 쓰지 않음). 아래 호환 요약을 Runner/다음 세션이 같은 entry_key로 기록해야 한다. 공통 HANDOVER 파일은 수정하지 않았다.
- 요약: "R6: /docs 정본 프로젝트 선택을 파일 scan에서 분리(레지스트리+scan 보강, canonicalProject 독립 상태, stale/401/403/409/네트워크 처리). 변경: page.tsx, CanonicalDocuments.tsx, lib/canonicalProjects(.test).ts, vitest.config.mts. tsc/vitest 16/eslint 통과, Playwright mock 36/36(실 backend E2E 아님). build/commit/push 미실행, 운영 미배포. 남은 것: Runner 빌드·배포 승인, 운영 grant 실검증."
