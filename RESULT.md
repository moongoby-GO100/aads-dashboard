# 채팅 파일 링크 클릭 → 아티팩트 패널 즉시 열람 — RESULT

**일시**: 2026-09-10 KST
**대상 저장소**: `/root/aads/aads-dashboard`
**작업 worktree**: `/root/aads/releases/aads-dashboard-filelink-20260910` (브랜치 `feat/chat-file-link-artifact-20260910`, 기점 `79fb6d4` = 현재 main)
**상태**: **코드 작업 완료 / 운영 반영(push·배포) 미실행** — 검수 후 승인된 Pipeline 단계에서 수행

---

## ⚠️ 선행 러너 중복 발견 및 처리 (중요)

작업 도중 **동일 작업지시로 이미 실행·머지된 pipeline 러너**가 있었음을 확인했다.

- 커밋 `5da0741` — `Pipeline-Runner: runner-d68acf9c — TITLE: 모든 채팅 세션 파일 클릭 즉시 아티팩트 열기 구현과 실제 화면 검증`
- 착수 preflight에서 `pipeline_jobs`의 running/queued는 **0건**이었다. 해당 러너는 이미 완료·머지된 상태라
  활성 작업 조회에 걸리지 않았고, 내 브랜치 기점 `7f916b2`는 그 커밋 **이전**이었다.
- 그대로 머지했다면 선행 러너의 구현(`AbortController` 요청 취소, `siteOrigins()` 현재 호스트 인식,
  동일 출처 제한, `%2f` 선두 디코딩, 1회 재시도, 빈 응답 실패 처리, `/docs`+`file_path` 판정)이 **되돌아갔을 것**이다.
- **조치**: 브랜치를 현재 main(`79fb6d4`)으로 reset 후 **선행 구현 위에 내 변경만 덧붙였다.**
  선행 러너 코드는 한 줄도 제거하지 않았고, 선행 러너의 RESULT 기록도 본 문서 부록에 보존했다.
- 그 위에 추가한 것: 확장자 기반 지원 형식 확대, `%20`/`%252F`/비선두 인코딩 복원 + `..` 차단,
  과거 세션 `normalizeDocumentRouteParams` 보정, 백오프 2회 재시도 + 재시도 가능 여부 분류,
  상태코드별 한국어 안내, 이미지 blob→data URL 패널 내 표시, 미리보기 판정 단일화, 셀프테스트 23건,
  그리고 **실제 브라우저 화면 검증**(선행 러너가 "화면 미검증"으로 남긴 항목).

---

## STEP 0 기존 구현 조사 (코드 수정 전)

수정 대상은 "채팅 파일 링크 공통 처리기" 계열로만 한정했다. `ChatArtifactPanel.tsx`는 조사 결과
파일 링크 처리 접점이 없어(아티팩트 타입별 렌더링만 담당) **변경하지 않았다**.

| 파일 | 기존 항목 | 분류 | 비고 |
|---|---|---|---|
| `src/lib/documentLinks.ts` | `normalizeDocumentHref()` | **수정** | 퍼센트 인코딩 경로 복원 분기 추가. 기존 매핑 순서·규칙은 그대로 유지 |
| | `normalizeDocumentRouteParams()` | 유지 | 호출처만 추가 (`page.tsx`) |
| | `isUnsafeLink()`, `isFileDownloadHref()` | 유지 | — |
| | `siteOrigins()` (선행 러너) | 유지 | 현재 배포 호스트 인식. 그대로 둠 |
| | `DOC_PATH_MAPPINGS`/`RELATIVE_DOC_MAPPINGS`/`PROJECT_HINT_MAPPINGS` | 유지 | 삭제·재작성 없음 |
| | `isArtifactPreviewHref()` | **신규(이동+확장)** | 아래 "이동 사유" 참조 |
| | `isPreviewableTextFile()` | 신규 | 확장자 기반 텍스트 판정 |
| | `decodeFilesystemPath()` | 신규 | 내부 헬퍼 |
| `src/app/chat/MarkdownRenderer.tsx` | `isArtifactPreviewHref()` (지역 함수, 선행 러너의 `/docs`+`file_path` 분기 포함) | **삭제(사유 필수)** | 규칙 전량을 공통 모듈로 이관. 아래 참조 |
| | `FilePathChip`, `a()`, `code()`, `MarkdownBlock`, `InlineMd`, `CodeBlockShell` 등 | 유지 | 동작 변경 없음 (import 경로만 변경) |
| `src/app/chat/page.tsx` | `handleDocumentLinkClickStable()` | **수정** | 기존 2-경로 로딩 구조와 선행 러너의 `AbortController`·`isStale()`·동일 출처 제한을 **그대로 유지**하고, 재시도 백오프·형식 판정·오류 문구·이미지 인라인 처리를 덧붙임 |
| | `documentPreviewAbortRef` / `documentPreviewRequestRef` (선행 러너) | 유지 | 요청 취소·순번 가드. 세션 전환 effect의 abort 호출도 그대로 |
| | `parseDocsPreviewHref()` | **수정** | 반환 직전에 `normalizeDocumentRouteParams()` 적용 |
| | `titleFromHref`, `artifactTypeForDocument`, `languageForDocument`, `buildProjectDocContentPath`, `documentArtifactIdFromHref` | 유지 | 시그니처·동작 그대로 |
| | `DocumentLoadError` 외 모듈 스코프 헬퍼 6종 | 신규 | — |
| `src/lib/documentLinks.selftest.ts` | 기존 15 케이스 | 유지 | 전부 보존, 케이스만 추가 |

### 삭제 항목: `MarkdownRenderer.tsx`의 지역 `isArtifactPreviewHref()`

- **삭제 대상**: `MarkdownRenderer.tsx`의 파일-지역 함수(선행 러너가 추가한 `/docs`+`file_path` 분기 포함).
- **사유**: 같은 판정을 `page.tsx`(패널 로딩)와 `MarkdownRenderer.tsx`(링크/파일칩 표기)가 각각
  달리 해석하면 "링크는 패널용으로 보이는데 패널은 열지 못하는" 불일치가 생긴다.
  판정 규칙을 `documentLinks.ts` 한 곳으로 모으고 확장했다.
- **호출처 영향**: 호출처는 같은 파일 내 `FilePathChip`과 `a()` 두 곳뿐이었다. 둘 다
  `@/lib/documentLinks`에서 import 하도록 바꿨고 **호출 시그니처·반환 타입은 동일**하다.
  기존 판정 규칙(`/docs?`, `/docs`+`file_path`, `/reports/`, `/exports/`, `/static/*`, `inline=1` 다운로드)은
  공통 모듈에 **전부 그대로 옮겨 담았고**, 확장자 허용만 추가했다.
- **롤백 방법**: `git revert` 또는 해당 함수를 `MarkdownRenderer.tsx`에 되돌리고 import 3줄을
  원복하면 된다. 다른 파일에는 의존이 없다.

### 지시서에 명시되지 않았으나 변경한 파일

- `src/lib/documentLinks.ts` / `src/lib/documentLinks.selftest.ts`
  — 지시서가 지목한 "채팅 파일 링크 공통 처리기"의 실체가 이 모듈이다.
  `MarkdownRenderer.tsx`·`page.tsx`가 모두 이 모듈을 호출하므로 링크 정규화·미리보기 판정을
  여기서 고치지 않으면 두 곳에 중복 구현이 남는다.
- `src/app/chat/ChatArtifactPanel.tsx` — **변경하지 않음**(지시서에 언급되었으나 접점 없음).

---

## 구현 내용

1. **URL 인코딩 링크 복원** (`normalizeDocumentHref`)
   `%2Ftmp%2Freview.md`(전체 인코딩), `/tmp/a%20b.md`(공백만 인코딩), `%252F…`(이중 인코딩)를
   디코딩해 파일 경로로 되돌린다. **디코딩 결과가 파일시스템 경로일 때만** 채택하므로
   `/docs?...&file_path=a%2Fb.md` 같은 정상 쿼리는 건드리지 않고, `..`가 드러나면 원문을 유지한다.

2. **지원 파일 형식 확대** (`isArtifactPreviewHref`)
   기존에는 다운로드 API 링크 중 `inline=1`인 것만 패널 대상이었다. 브라우저 인라인 표시 여부와
   무관하게 **패널이 그릴 수 있는 확장자**(텍스트 뷰어 + 인라인)면 패널에서 연다.
   `.py`, `.ts`, `.tsx`, `.yaml`, `.sh`, `.sql` 등이 새로 포함된다.
   반대로 `.xlsx`처럼 패널이 그릴 수 없는 형식은 **기존 다운로드 동작을 그대로 유지**한다.

3. **과거 세션 링크 보정** (`parseDocsPreviewHref`)
   옛 대화는 GO100/KIS/SF/NTV2 문서까지 전부 AADS `/app/docs`·`/app/reports`로 굳어져 있다.
   `/docs` 페이지가 이미 쓰던 `normalizeDocumentRouteParams()`를 채팅 경로에도 태웠다.

4. **세션 전환 stale 응답 차단 / 테넌트·세션 혼입 방지** (선행 러너 구현 유지)
   클릭마다 순번(`documentPreviewRequestRef`)을 발급하고 클릭 시점의 `activeSessionRef`를 캡처하며,
   새 클릭·세션 전환 시 `documentPreviewAbortRef`로 진행 중 요청을 취소한다.
   응답이 돌아와도 순번이 밀렸거나 세션이 바뀌었으면 **패널에 반영하지 않는다.**
   덧붙인 것은 재시도 루프 각 회차 진입/실패 직후의 stale 재확인뿐이다.

5. **인증 만료·오류 재시도** (선행 러너의 1회 재시도를 확장)
   네트워크 오류/408/425/429/5xx는 400ms → 1200ms 백오프로 최대 2회 재시도.
   401/403/404/413은 재시도 없이 상태코드별 한국어 안내로 끝낸다.

6. **빈 패널 성공 처리 금지**
   내용이 비었거나(공백만), 패널이 그릴 수 없는 형식이거나, 이미지가 8MB를 넘으면 **실패로 처리**하고
   사유를 패널에 적는다. 이미지는 내려받은 blob을 data URL로 만들어 패널 안에서 직접 보여준다
   (기존에는 인증이 필요한 원본 URL을 `<a target="_blank">`로 걸어 새 탭에서 401이 나던 자리다).

7. **내부 구현 경로 비노출**
   로딩/실패 문구에서 `/api/v1/files/download?path=…` 같은 내부 URL과
   "원본 링크를 새 탭에서 다시 열어 확인하십시오" 안내를 제거했다.
   실패 시에는 파일명과 사유만 보여주고, 채팅 본문에 적힌 표기가 제목과 다른 경로 형태일 때만
   `요청한 파일:` 한 줄을 덧붙인다. 임의로 외부 탭을 열지 않는다.

---

## 검증 체크리스트

- [x] **구현 목표**: 과거 모든 세션의 파일 링크를 클릭하면 우측 아티팩트 패널이 열리고 실제 파일 내용이 표시된다.
- [x] **검증 방법**: 후보 빌드를 `localhost:3001`에 띄우고(운영 API `https://aads.newtalk.kr/api/v1` 사용),
      서버 Playwright Chromium + 실제 로그인 토큰으로 원 세션 `474e1681-c108-49e9-89c4-2f2389d12114` 및
      타 세션의 링크를 클릭. 셀렉터 `a[title*='아티팩트'], code[title*='아티팩트']`.
- [x] **완료 기준**: 클릭 → 패널 열림 → 패널 문자수가 파일 API 응답 문자수와 일치, 세션 전환 후 정상 동작.
- [x] **실패 기준**: 빈 패널, 새 탭 이동, 다른 세션 문서 혼입, 내부 경로 노출 → 모두 미발생.
- [x] **서비스 재시작 확인**: 운영 컨테이너 재시작 없음(배포 미실행). 검증용 로컬 서버만 기동.
      `curl http://localhost:3001/login` → HTTP 200.
- [x] **에러 로그 0건**: 검증 서버 로그에 error 0건(`output: standalone` + `next start` 경고 1건만 존재 — 기능 무관).
      운영 컨테이너는 건드리지 않았다.
- [x] **브라우저 E2E/화면 검증**: 아래 표(선행 러너 커밋 위에 rebase 한 **최종 병합 빌드** 기준 재실행). 캡처 10장 확보.

### 브라우저 E2E 결과

로그인: `GET /api/v1/e2e/credentials/e2e-login-url/AADS` → `moong76@gmail.com` 토큰 발급 →
쿠키 `aads_token` + `localStorage` 주입 (앱 middleware가 쿠키를 요구).
브라우저: 서버 Playwright Chromium(headless). 라우트: `http://localhost:3001/chat#<session_id>`.

| # | 시나리오 | 세션 | 링크 표기 | 기대 | 실제 | 캡처 |
|---|---|---|---|---|---|---|
| 1 | 대표 회귀자료 (절대 `/tmp` 경로) | `474e1681…` | `/tmp/aads-chat-continuity-directive-review.md` | 패널에 원문 표시 | **PASS** — 제목 `aads-chat-continuity-directive-review.md`, 글자 **6,171** = API 응답 6,171자, md5 `965fedad…` 서버 파일과 동일 | `M1_ref_panel.png` |
| 2 | 상대 경로 문서 | `7fb5f50a…` | `docs/reports/20260907_docker_build_p1_design_prd.md` | 패널에 원문 표시 | **PASS** — 글자 **17,368** = API `content` 17,368자, 표 204개 렌더 | `M2_ok_panel.png` |
| 3 | 모바일 클릭 | `474e1681…` | `/tmp` md | 전체화면 오버레이 + 내용 | **PASS** — 390×844, 글자 6,171 | `M_mobile_panel.png` |
| 4 | 세션 전환 stale 차단 | `7fb5f50a…` → `474e1681…` | 상대 경로 md | 전환 후 문서 미표시 | **PASS** — 응답을 10.5s 붙잡고 2.6s에 사이드바로 세션 전환. 전환 시 `AbortController`가 요청을 끊어 응답이 도착하지 않았고 패널에도 반영 없음 | `E_M_stale_stale.png` |
| 5 | 대조군 (전환 없음, ref 가드만 있던 중간 빌드) | `7fb5f50a…` | 상대 경로 md | 붙잡힌 응답도 정상 렌더 | **PASS** — 13.2s 응답 도착 후 문서 표시. 같은 하네스에서 전환 시에는 200 응답이 도착해도 미반영됨을 별도 확인 | `E_localctl_control.png` |
| 6 | 연속 클릭 순서 | `7fb5f50a…` | 느린 md → 빠른 `.py` | 나중 클릭 유지 | **PASS** — 첫 클릭 요청이 10.0s에 풀렸으나 두 번째 파일 화면 유지 | `I_M_order_order.png` |
| 7 | 일시 오류 재시도 (문서 API) | `7fb5f50a…` | 상대 경로 md | 503×2 후 성공 | **PASS** — 호출 3회, 문서 정상 표시 | `G_retry503.png` |
| 8 | 인증 만료 (다운로드 API) | `474e1681…` | `/tmp` md | 재시도 없이 안내 | **PASS** — 호출 1회, 패널에 "로그인이 만료되었습니다…" | `H_dl_auth401.png` |
| 9 | 인증 만료 (문서 API) | `7fb5f50a…` | 상대 경로 md | 앱 전역 401 처리 | **PASS** — `/login?reason=session_expired`로 이동 (기존 `chatApi` 계약 유지) | — |
| 10 | 지원 형식 확대 before/after | `7fb5f50a…` | `/tmp/e2e_eval.py` ×2 | 패널 대상이 됨 | **PASS** — 운영(현재 배포본) 아티팩트 링크 **1개** → 후보 **3개**. `.py` 2건이 다운로드에서 패널 열람으로 전환 | `mp_7fb5f5_00_loaded.png` vs `mc_7fb5f5_00_loaded.png` |
| 11 | 외부 탭 유출 없음 | 전 시나리오 | — | 새 탭 0건 | **PASS** — 모든 실행에서 `extra_tabs: []`, 메인 프레임 추가 네비게이션 0건 | 각 스크립트 출력 |
| 12 | 회귀 없음 (링크 수 비교) | 4개 세션 | — | 패널 대상 링크 감소 없음 | **PASS** — `474e1681` 2=2, `105096bb` 4=4, `aa433b41` 12=12, `7fb5f50a` 1→3(증가) | — |

### 정적 검사

| 항목 | 명령 | 결과 |
|---|---|---|
| 타입체크 | `npx tsc --noEmit -p tsconfig.json` | **PASS** (출력 없음) |
| 린트 | `npx eslint <변경 4파일>` | **PASS** — 0 errors, 20 warnings (전부 기존 경고) |
| 단위 셀프테스트 | `documentLinks.selftest.ts` → tsc → node | **PASS** — `documentLinks selftest: OK` (기존 15 + 신규 23 케이스) |
| 프로덕션 빌드 | `NEXT_PUBLIC_API_URL=… npm run build` | **PASS** — `Compiled successfully in 44s`, 76 페이지 생성 |

신규 셀프테스트 케이스: `/tmp` 절대경로, `%2F` 전체 인코딩, `%252F` 이중 인코딩, `%20` 공백 인코딩,
컨테이너 경로 `/app/app/static/docs/…`, 호스트 경로 `/root/aads/aads-server/app/static/docs/…`,
정상 인코딩 `/docs?` 쿼리 무변경, `%2Ftmp%2F..%2Fetc%2Fpasswd` 상위탐색 차단,
`isArtifactPreviewHref` 9종, `isPreviewableTextFile` 5종.

---

## 파일 API 계약 (실측)

| 엔드포인트 | 인증 | 확인 결과 |
|---|---|---|
| `GET /api/v1/project-docs/content?project=&base_path=&file_path=` | Bearer 필수 | 200 / JSON(`content`,`is_binary`,`mime_type`,`format`). 서버가 레거시 AADS→GO100/KIS/SF/NTV2 후보를 이미 재탐색함 |
| `GET /api/v1/files/download?path=&inline=` | Bearer 필수 (미인증 401) | 허용 루트(`ALLOWED_ROOTS`) 밖은 404. 파일명 기반 재탐색 폴백 있음 |

**로컬 소스 파일을 운영에서 곧바로 읽을 수 없다**는 점을 실측으로 확인했다.
작업 착수 시점에 `/tmp/aads-chat-continuity-directive-review.md`는 호스트에만 있고 컨테이너에는
없어 다운로드 API가 404였다. 이 경우 UI는 (설계대로) 빈 패널이 아니라
"문서를 찾을 수 없습니다" 안내를 표시했다(`D1_ref_panel.png`).
검증 후반에 같은 배치의 **file_api 담당**이 해당 파일을 `/app/docs/chat/`에 반영하여 200이 되었고,
그때부터 동일한 UI 코드가 원문을 그대로 표시했다(시나리오 1).

**통합검증 의존조건**: 링크 대상 파일이 `ALLOWED_ROOTS` 안에서 해석되어야 한다.
UI는 파일 API가 주는 대로만 표시하며, 못 읽는 파일을 성공으로 위장하지 않는다.

---

## 미실행 항목

| 항목 | 사유 |
|---|---|
| **push / 운영 배포** | 지시서 지정 — 검수 후 승인된 Pipeline 단계에서 수행. 로컬 커밋까지만 완료 |
| **운영 화면 재검증 + 5분 오류 관측** | 배포 전이라 불가. 배포 후 수행 필요 |
| `html_preview` 형식 패널 렌더 화면 검증 | 실제 세션이 가리키는 HTML 문서가 컨테이너에 존재하지 않음. 타입 분기 코드 경로만 확인 |
| PDF 패널 내 렌더 | 패널에 PDF 뷰어가 없어 "미리보기 불가" 안내로 처리(설계 결정). 화면 검증은 대상 파일 부재로 미실행 |
| 운영(수정 전) 기준 stale before/after 비교 | 현재 배포본에도 선행 러너의 `AbortController` 가드가 이미 들어 있어 "고장난 상태"를 재현할 수 없다. 대신 최종 빌드에서 전환 시 요청이 끊기고 패널이 오염되지 않음을, 그리고 전환하지 않으면 늦은 응답도 정상 렌더됨을 각각 확인했다(시나리오 4·5) |
| 타 세션 메시지 전송 | 지시서 금지 — 전송 0건. 기존 세션 읽기와 클릭만 수행 |

## 증적 위치

- 스크립트·캡처: `/root/aads/verification/aads-chatfile-20260910/` (스크립트 12개 + 최종 빌드 캡처 10장)
- 검증용 로컬 서버 로그: `/tmp/dash-verify.log`

## 롤백

`git branch -D feat/chat-file-link-artifact-20260910` (미배포 상태) 또는 배포 후라면
직전 승인 릴리스 이미지로 dashboard 단독 롤백 + 5분 오류 관측.

---

## 부록 — 같은 작업지시의 선행 러너 결과 (commit 5da0741, 보존)

아래는 동일 작업지시로 먼저 실행된 pipeline 러너 `runner-d68acf9c`의 RESULT 기록이다.
본 문서의 구현은 그 커밋 위에 rebase 하여 **덧붙인 것**이며, 해당 구현을 대체하지 않는다.

## 2026-09-10 - 과거 채팅 파일 링크 아티팩트 열기 보강

### STEP 0 기존 구현 및 충돌 preflight

- 격리 작업 트리: detached HEAD, 수정 전 tracked/untracked 변경 없음.
- `pipeline_jobs`: 이 저장소에는 운영 DB 조회 접점이 없고 화면 설명 참조만 확인되어 DB 조회는 미실행.
- `chat_workspace_change_ledger`: 저장소 내 코드·문서 접점 없음. DB 연결정보를 열람하거나 시크릿을 출력하지 않았으며 운영 DB 조회는 미실행.
- 대상별 분류:
  - [수정] `src/lib/documentLinks.ts`의 `normalizeDocumentHref()`: 기존 절대/상대/컨테이너/tmp/호스트 매핑을 유지하고, URL 전체가 인코딩된 로컬 경로와 현재 배포 호스트 인식을 추가.
  - [수정] `src/app/chat/MarkdownRenderer.tsx`의 공통 링크 렌더러: 기존 파일 칩/마크다운 링크 흐름을 유지하고 현재 호스트의 `/docs` 링크도 패널 대상으로 판정.
  - [수정] `src/app/chat/page.tsx`의 `handleDocumentLinkClickStable()`: 기존 허용 파일 API·아티팩트 탭 흐름을 유지하고 요청 취소, 세션 stale 차단, 동일 출처 제한, 일시 오류 1회 재시도, 빈 응답 실패 처리를 추가.
  - [유지] `src/app/chat/ChatArtifactPanel.tsx`: report/code/html/file 표시와 모바일 overlay 계약이 이미 충족되어 변경하지 않음.
  - [유지] `/project-docs/content` 및 `/api/v1/files/download` 계약: API 보완은 별도 file_api 배치 의존조건이며 이 UI 배치에서 변경하지 않음.
  - [신규] 없음.
  - [삭제] 없음.

### 변경 결과

- 파일 클릭 즉시 기존 우측 아티팩트 패널(모바일은 overlay)을 열고 로딩 상태를 표시한다.
- 새 링크 클릭 또는 세션 전환 시 이전 요청을 취소하며, 늦게 도착한 이전 세션 응답은 상태에 반영하지 않는다.
- 정적 파일 요청은 현재 origin만 허용하며, 프로젝트 문서는 인증이 적용된 중앙 chat API helper를 계속 사용한다.
- 빈 API 응답은 성공으로 처리하지 않는다. 실패 화면에는 내부 원본 경로를 노출하거나 새 탭 이동을 권하지 않고 같은 채팅 링크 재클릭을 안내한다.

### 검증

- PASS: `/root/aads/aads-dashboard`의 설치 의존성을 읽기 전용으로 연결해 `tsc --noEmit --pretty false` 실행, 오류 0건.
- PASS: 관련 4개 파일 ESLint, 오류 0건/기존 경고 23건.
- PASS: `git diff --check`.
- 미실행: 사용자 금지 규칙에 따라 build, commit, push, deploy.
- 화면 미검증: 현재 격리 작업공간에는 로그인 브라우저 세션·route/tool/capture 수단이 없어 세션 `474e1681-c108-49e9-89c4-2f2389d12114`, 타 세션, 모바일 실제 클릭 검증을 수행하지 못함. 운영 API/프로세스 fallback도 배포 전 소스 변경을 검증하지 못하므로 성공 판정에 사용하지 않음.
- 통합 의존조건: file_api 배치가 과거 세션의 `aads-chat-continuity-directive-review.md`를 현재 사용자·테넌트에 허용된 `/project-docs/content` 응답으로 제공해야 최종 `클릭 → 패널 → 원문 일치`를 인증할 수 있음.

### 롤백

- 위 3개 파일의 이번 diff만 되돌리면 된다. 삭제·DB 변경은 없다.
