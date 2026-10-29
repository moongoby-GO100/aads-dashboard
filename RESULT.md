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


# 승인 정책 소비 범위와 브라우저 검증 보완 — approval-consumer-scope-browser-repair

2026-10-16 · AADS-APPROVAL-CONSUMER-SCOPE-BROWSER-REPAIR-20261016 · runner-10a4342b

상태: 소스 패치 반영, 전체 완료기준 미충족. 배포 전 검증이다. 실제 브라우저 클릭·캡처 및 지정 운영 세션 식별은 미완료이며 성공으로 보고하지 않는다. 추가 자동 재작업/후속 제출 없음.

## STEP 0 조사와 변경 전 preflight

- `/root/aads/AGENTS.md` 및 저장소 AGENTS.md 열람. 최초 `git status --short`는 비어 있었다. 기존 격리 workspace HEAD와 로컬 origin/main은 모두 `311a04cfc20945342182ebc34fbd1a76e322a80f`. 원격 최신성은 네트워크 제약으로 확인하지 못했다. git worktree/checkout/reset 사용 없음.
- 보존 커밋 `41d321ad8c33deb6c74fedb32c0ec596f907d71c`의 의도된 소스·회귀 diff에 `git apply --check` 후 적용했다. 기존 chat/page 파일 전체를 덮어쓰지 않았다. 선행 RESULT와 관계없는 파일 변경은 가져오지 않았다.
- 변경 전 pipeline_jobs 활성 dashboard 조회 시도: Docker socket permission denied. workspace ledger 조회도 같은 차단. DB 위험 preflight는 접근 불가로 미확인. 사용자 제공 조회 결과를 현재 DB 재확인으로 간주하지 않았다. 서버 작업·DB 스키마·정책값·grants 수정 없음.
- code_reviews.feedback 원문 DB 접근 불가. 제공된 리뷰 근거와 읽기 전용 서버 소스를 대조했다. error_book match는 `psql` 실행 파일 부재로 실패.
- 공유 dashboard의 dirty public/reports/llm-models-current.html 및 다른 세션 파일은 수정하지 않았다.

| 대상 / 접점 | 분류 | 처리 |
|---|---|---|
| GoalApprovalControls.tsx: supportsGoalApproval | 신규(보존 패치 복원)·수정 | 서버에 없는 KIS/GO100 allowlist 제거. 프로젝트 조회 전 변경 차단 유지 |
| useGoalApprovalPolicy / savePolicy / retryPolicy | 신규(보존 패치 복원)·수정 | critical 확인 문구만 소비처에 맞춤. layout epoch, 요청 잠금, stale 차단, 실패 정책 보존, 200 기본값, used 초기화/해제 보존 유지 |
| GoalApprovalControls | 신규(보존 패치 복원)·수정 | 공용 전체선택·전체해제 유지, 제안과 실행 게이트 차이 및 KIS/GO100 손실 경고 |
| GoalPanel / load / commitCount | 수정 | 공용 컨트롤 연결 및 요약 문구. board owner/ABA, 프로젝트 조회 실패 안전성 유지 |
| goals/page: GoalsPage / commitCount | 수정 | 기존 화면에 공용 컨트롤 연결 및 정책 범위 문구 |
| chat/page: refreshApprovals / decideApproval / decideApprovalBulk | 수정(보존 패치 복원) | 최신 목록 ref, 세션 epoch, 중복 클릭 방지, 실패 선택 보존, 오류 재조회 유지 |
| chat/page: GoalPanel 호출 / 세션 전환 effect | 수정(보존 패치 복원) | 세션 key/project 전달, 이전 카드 상태 초기화 유지 |
| api.getGoalApprovalPolicy / setGoalApprovalPolicy | 유지 | tenant-scoped GET/POST 계약 변경 없음 |
| 서버 GoalApprovalPolicyRequest, GET·POST approval-policy, 알림 | 유지·읽기 전용 | 프로젝트 allowlist 없음, viewer/member 권한, 404, 활성화시 positive max, used reset 계약 확인 |
| 서버 next_step_proposals._goal_policy_covers / propose | 유지·읽기 전용 | 일반 다음 단계 제안 소비 확인 |
| 서버 live_trading_guard._approval_project / goal_policy_allows / check | 유지·읽기 전용 | 실행 대상 프로젝트·위험도·횟수 및 db_safe_write 제외 확인 |
| goals / goal_task_links / agent_permission_requests | 유지·읽기 전용 소스 조사 | DB 값 변경 없음 |
| 스케줄러 | 유지 | 신규/변경 접점 없음 |
| goal-approval-controls.test.mjs | 신규(보존 회귀 복원)·수정 | 32건을 보존·정정하여 36건. 5개 프로젝트 read/enable/disable 검증 |
| tests/browser/approval-browser.test.mjs | 신규(보존 fixture 이동)·수정 | React DOM 및 실제 소스 콜백 사용. 5개 프로젝트, 오류코드 클릭 케이스 보강 |
| package.json / package-lock.json | 수정 | playwright-core 1.59.1 정확한 dev dependency 및 별도 browser/install 명령 |

삭제된 기능 없음. 인라인 중복 정책 로직은 보존 커밋대로 공용 hook으로 이동했다. 브라우저 fixture는 chat-modernization glob에서 tests/browser로 이동하여 기본 test:chat가 브라우저 설치에 의존하지 않게 했다. 지시서 외 추가 기능 파일 변경 없음. chat/page는 명시된 보존 요구(중복 클릭·epoch·실패 선택 보존)를 현재 main에 가져오기 위해 변경 전 diff를 확인하고 수정했다.

## 실제 서버 소비 범위 표

| 프로젝트 | GET/POST 정책 | 다음 단계 제안 | 실제 실행 게이트 |
|---|---|---|---|
| AADS | tenant 권한 내 조회·설정·해제 | 연결된 목표 정책 사용 | 게이트 대상인 호출에서 대상 프로젝트 일치 등 별도 검사 |
| SF | 동일 | 동일 | 동일 |
| NTV2 | 동일 | 동일 | 동일 |
| KIS | 동일 | 동일 | 동일, 실매매·주문·자금 손실 위험 경고 |
| GO100 | 동일 | 동일 | 동일, 실매매·주문·자금 손실 위험 경고 |

근거: app/routers/goals.py:1005~1101, app/services/next_step_proposals.py:161~200 및 360~380, app/services/live_trading_guard.py:135~147, 460~558, 680~725.

- API는 프로젝트 제한 없이 tenant-scoped 목표 조회/설정을 제공한다. 알림 문자열은 여전히 실매매 용어를 사용하지만 이 작업에서 서버 알림은 바꾸지 않았다.
- 제안은 활성 chat_session 연결, 목표 status draft/active/blocked, 남은 횟수를 검사한다. critical은 critical 필드, 나머지 위험도는 high 필드를 본다. 제안 검사 자체는 횟수를 차감하지 않으며 프로젝트 일치 조건이 없다.
- 실행 게이트는 check의 pass/notify 처리 이후 승인 대상에 정책을 적용한다. 목표·세션 연결, 목표 상태, 대상 프로젝트 일치, 위험도 필드와 횟수를 검사하고 사용 횟수/자동 통과 알림을 기록한다. db_safe_write 등 프로젝트 미상 도구는 이 정책으로 통과하지 않는다. 자동승인이 모든 도구 허용을 의미하지 않는다.
- 세션/목표 프로젝트 mismatch 경고에도 두 소비처 차이를 표시했다.

## 검증 실행 결과

| 명령/검증 | 실제 결과 |
|---|---|
| node --test tests/chat-modernization/goal-approval-controls.test.mjs | PASS, 최종 실행 파일 1/1 |
| node tests/chat-modernization/goal-approval-controls.test.mjs | PASS, 36/36 (개별 테스트 출력 확인) |
| npm run test:chat | PASS, 17 테스트 파일, 실패/skip 0 |
| npm run typecheck | PASS, tsc 오류 없음 |
| 변경 4개 TSX와 2개 test ESLint | PASS, errors 0 / warnings 18 (chat 기존 경고). 최종 공용 컨트롤/테스트 재검사도 errors 0 |
| git diff --check | PASS |
| npm run test:approval:browser | FAIL, 고정 버전 Chromium headless_shell-1217 미설치. MODULE_NOT_FOUND는 해소 |
| AADS_CHROMIUM_PATH=<기존 Chromium> npm run test:approval:browser | FAIL, Chromium launch setsockopt: Operation not permitted / SIGTRAP. 최종 fixture로 재실행도 실패 |
| 실제 소스 브라우저 클릭·capture | 미완료. 브라우저 생성 전 차단, 캡처 생성 없음. VM/AST 통과를 화면 통과로 간주하지 않음 |
| npm registry 조회 | EAI_AGAIN. npm ci 신규 다운로드 재현은 미검증 |
| 빌드 | 미실행 — 승인 후 Runner 빌드 검증 대상 |

회귀 범위: 전체선택/해제·partial·critical 취소·중복 클릭·200 기본값·used 초기화/해제 보존, AADS/SF/NTV2/KIS/GO100 기존값 조회/활성화/해제, 401/403/404/409/410 오류 및 재시도, ABA·stale 목록/정책 응답, bulk 실패/미처리 선택 보존. 이는 단위 회귀 결과이며 브라우저 성공 증거가 아니다.

의존성: package/lock은 기존 설치 산출물의 version/resolved/integrity를 대조해 고정했다. 검증용 node_modules는 기존 의존성을 읽기 전용 symlink로 참조하고 playwright-core만 작업공간에 복사했다. 전역 설치·서비스 변경 없음. 재현 명령은 `npm ci` → `npm run test:approval:browser:install` → `npm run test:approval:browser`. 승인된 외부 Chromium 사용 시 공개 설정 `AADS_CHROMIUM_PATH` 지원. 전역 모듈/비밀 경로 환경변수 의존 제거. sandbox 제약 우회는 시도하지 않았다.

## 지정 세션과 잔여 차단

- 지정 대상: https://aads.newtalk.kr/chat#7a1b186e-e71f-41c5-bd7b-e5926f41b4d9 . HTTP 조회가 DNS 실패(curl 6), 이어서 API health도 DNS 실패, container 조회는 Docker socket permission denied. 요청된 HTTP→health→container 폴백 순서를 실행했다. 운영 장애로 단정하지 않는다.
- 지정 session 읽기 API 시도도 DNS 단계에서 실패했다. tenant 확인 및 permission request / runner approve / 목표 정책 / next_step 카드 종류는 원인 미확정. 다른 테스트 세션을 지정 세션 증거로 보고하지 않았다. 운영 승인 POST/정책 변경은 0건.
- pipeline_jobs/ledger/DB 위험 현재 상태 재확인 불가. code_reviews 원문 조회 불가.
- R-001 POST /api/v1/handovers 기록 및 GET 재조회 시도 모두 DNS 실패: 핸드오버 DB 미기록. HANDOVER.md 변경 없음.
- 확인 원인 error_book register 시도는 psql 부재로 실패: 오류 사전 DB 미기록. 확인된 원인은 UI KIS/GO100 allowlist와 next_step 정책 소비 범위의 불일치, 브라우저 dev dependency 미등록이었다.
- 기존 RESULT.md에 추가 기록. 정본 미등록(미완료), 열람 링크 미제공.
- runner-bde1eed0의 blocked_dependency 연결 복구 필요만 기록. done 변경/별도 후속 제출 없음.

## 변경·반영·롤백·비용

변경 파일: package.json, package-lock.json, src/app/chat/page.tsx, src/app/goals/page.tsx, src/components/GoalPanel.tsx, src/components/GoalApprovalControls.tsx, tests/chat-modernization/goal-approval-controls.test.mjs, tests/browser/approval-browser.test.mjs, RESULT.md.

commit/push 미실행, GitHub 신규 commit URL 없음. 빌드·배포·재시작 미실행. 운영 미반영. 롤백은 Runner가 최종 선별 커밋을 생성한 뒤 해당 커밋 revert; 현재는 위 의도 파일 diff만 원복 가능하다. 외부 유료 호출 없음, 실제 총비용 미측정.


---

## 목업 채팅 아티팩트 수정 검증 결과 — runner-951e5ee2

- 작업: AADS-RDOC-M7-CHAT-MOCKUP-ARTIFACT-FIX-20261029
- source_task_id: runner-951e5ee2
- change_summary: 세션을 넘나드는 목업 수정 요청 완료 UI 오염과 모바일 입력창 복귀 누락을 수정하고 실제 검증 범위를 기록한다.
- 상태: 코드 수정 및 로컬 회귀 검증 수행. 실제 API 화면 증거와 정본 등록은 미완료.
- 실제 대시보드 기준 커밋 SHA: 4f2abb492cdbb69fea98ce8b430dde425f43aa50
- 재사용한 검수 SHA: c18bcc3cc2fa1011f7b3157338f30716ef867199
- 실제 검토한 서버 SHA: ce503cd4aa716f73a160a10e836831246932984e
- 이번 수정의 커밋 SHA: 없음. 사용자 지시에 따라 commit/push/운영 반영을 실행하지 않았다.

### STEP 0 기존 구현 조사와 분류

코드 변경 전 /root/aads/AGENTS.md와 서버 AGENTS.md를 읽고 기존 접점을 조사했다.
복구 패치의 전체 적용 검사에서 문맥 불일치를 확인하여, 관련 파일만 기존/부모/검수 SHA의 3방향 병합으로 복구했다.
최근 사용자 메시지 idempotency 및 client environment 수집, HTML 원본 파일명/격리 뷰어와 기존 모델 API·selftest를 보존했다.

| 대상 | 기존 함수·컴포넌트·접점 | 분류 및 반영 |
|---|---|---|
| mockupTargetStore.ts | 현재 기준에는 파일 없음. 검수 SHA의 resetForSession, arm/disarm, submitPendingIntent, registerMockupChangeAfterSend, sessionStorage pending intents | 신규(복구 후 수정). session/arm/request epoch와 전송 시점 fence 추가, 다른 세션의 setPanel/setReply/setCandidates 무시 |
| page.tsx | ChatPage, sendMessage/finally, chatApi 메시지 조회, mockupSourceMessageId, 고정 MockupReviewPanel | 수정. 실제 저장 메시지를 조회해 change-intake 연결, 스트림 대기 전 fence 보존, 고정 패널 composer 복귀 연결 |
| ChatArtifactPanel.tsx | ChatArtifactPanel, activeArtifact metadata, ArtifactContentArea | 수정. metadata의 review/project/revision으로 embedded 패널 표시 및 composer 복귀 콜백 전달 |
| MockupReviewPanel.tsx | load, doApprove, AssetImage, ImageZoomDialog, useNarrow, doChange, changeAttempt, 로컬 comment/sourceMessageId | 수정. 기존 승인·이미지·HTML 링크 보존, startChange로 대상 고정 후 채팅 입력창 복귀, 비교/변경 보고 복구. doChange 등 아래 삭제 내역 참조 |
| mockupReviewApi.ts | getReview/getRevision/assetBlob/approve/requestChanges/listReviews/알림 API | 유지 및 수정. 기존 API 유지, listReviews signal 및 change-intake/change-report 접점 추가 |
| mockupReviewModel.ts | 파싱·승인/변경 본문·권한·HTML 링크·확대·보관함 함수 및 공개 타입 | 유지 및 수정. 기존 공개 helper/관련 테스트 유지, metadata binding·대상 판정·저장 메시지 검색·비교 모델 추가 |
| useMockupChatTargets.ts | 현재 기준에는 파일 없음 | 신규(검수 구현 복구). 세션별 목록/답장 대상 조회, AbortController로 이전 조회 차단 |
| MockupTargetBar.tsx | 현재 기준에는 파일 없음 | 신규(복구). 대상 고정/선택/실패 안내/같은 멱등키 재시도 |
| mockupComposerReturn.ts | 없음 | 신규. 두 패널에서 패널·모바일 overlay를 닫고 다음 frame에 composer focus |
| mockupTargetStore.test.ts / mockupComposerReturn.test.ts | 현재 기준에는 파일 없음 | 신규(복구 및 추가). 세션/요청 경합 및 모바일 복귀 회귀 검증 |
| mockupReviewModel.selftest.ts / vitest.config.mts | 기존 selftest와 Vitest include | 수정. 기존 검사 보존, 모델 계약 검사 및 새 테스트 검색 경로 추가 |
| 서버 mockup_review_service.py | submit_review/create_revision → _bind_session_card, _session_scope, _workspace_in_scope, _lock/_replay | 유지. 이미 구현되어 있어 중복 구현하지 않음. 잠긴 head의 tenant/session/project 기준, 권한 검증, UPDATE 후 INSERT로 동일 카드 연결 |
| 서버 DB 접점 | chat_sessions JOIN chat_workspaces, chat_artifacts metadata UPDATE/INSERT, submitted 이벤트 | 유지. 단위 계약·권한 테스트로 확인. 실제 DB 통합은 테스트 DB 미설정으로 미검증 |
| 스케줄러·마이그레이션·인증 클라이언트·배포 게이트 | 변경 대상 없음 | 유지. 수정하지 않음 |

명시 대상 외 변경 사유는 수정 전 진행 보고에도 명시했다. ChatArtifactPanel/API/모델/hook/표시줄은 기존 M7 카드 및 전송 연결을 복구하는 필수 접점이다. 공통 composer helper와 테스트는 양쪽 모바일 진입점의 복귀 동작을 검증한다. Vitest 설정은 새 테스트를 실제 검색하도록 한다. 이 RESULT는 기존 파일/기록을 보존하고 이번 결과만 덧붙인다.

삭제 내역: 파일 삭제 없음. 패널 로컬 doChange·changeAttempt·comment/sourceMessageId 연결과 page의 mockupSourceMessageId memo를 제거했다. 이 경로는 이전의 마지막 사용자 메시지를 재사용했으므로, 현재 보낸 메시지에 근거하는 change-intake로 연결하기 위해 변경했다. 호출처는 패널 내부 버튼 한 곳과 page의 패널 prop 한 곳이며, 이제 startChange → 대상 고정 → composer 전송 → 저장 메시지 조회 → registerMockupChangeAfterSend로 이어진다. 서버 requestChanges 및 모델의 기존 공개 helper는 호환성을 위해 보존한다. 롤백은 위 연결 파일의 이번 diff만 역적용하여 기존 prop/memo/doChange 흐름을 함께 복구하며 무관한 변경을 되돌리지 않는다.

### 반려 결함별 대응과 증거

1. 세션/요청 경합: UI fence를 전송 시점에 캡처한다. 세션 reset, 새 arm/disarm, 새 요청이 epoch를 바꾸므로 오래된 성공·실패·message_not_found가 현재 armed/notice를 덮지 않는다. 오래된 요청의 성공 시 pending intent 정리는 유지한다. A→B 및 A→B→A의 성공/실패, 늦은 메시지 조회·조회 오류, 같은 세션 새 arm, 더 늦게 시작한 요청, 스트림 완료 후 등록 시작을 회귀 테스트로 검증했다.
2. 서버 metadata: 기존 최소 구현을 확인하고 유지했다. metadata 키 mockup_review_id/mockup_project/mockup_revision_id, 반복 연결 및 판 변경 시 카드 재사용, tenant/workspace tenant/project 격리, 다른 사용자 세션 권한, 쓰기 실패 전파를 포함한 서버 단위 테스트 통과. PostgreSQL 실제 트랜잭션 검증은 미완료.
3. production next build: 실행하지 않음. 승인 후 Runner 빌드 검증 대상. 실제 /chat 연동 증거는 미확보. localhost:3000/chat 및 localhost:8000/api/v1/health 읽기 시도는 샌드박스에서 Operation not permitted로 차단됐다. 모의 화면을 실제 API 증거로 제시하지 않는다.
4. 모바일 fallback: 고정 패널 onRequestChange와 embedded onFocusComposer가 같은 returnToMockupComposer 함수를 호출한다. 패널 및 overlay 닫기 후 다음 frame의 focus 순서와 두 진입점 배선을 단위 테스트로 검증했다. 실제 모바일 브라우저/API 화면 증거는 미확보.
5. 정본: canonical_document_lookup/register 연결 도구를 검색했으나 제공되지 않았다. 기존 document_key를 확인하지 못했으므로 임의 새 key로 등록하지 않았다. source_task_id/change_summary는 위에 명시했다. 정본 미등록(미완료), 열람 링크 미제공. 이 RESULT는 정본 열람 참조를 대신하지 않는다.

### 실제 실행한 검증

- Vitest: node node_modules/vitest/vitest.mjs run src/lib/mockupTargetStore.test.ts src/components/mockupComposerReturn.test.ts → 2 files, 24 tests passed, exit 0.
- selftest: node scripts/run-selftests.mjs → 16/16 files passed, exit 0. 기존 모델/HTML 이름 검사도 보존하여 재실행했다.
- 타입 검사: node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false → 두 차례 exit 0. 최종 수정 후 세 번째 검사도 exit 0.
- 서버 핵심 pytest: 테스트 전용 JWT_SECRET_KEY와 기존 .venv Python으로 tests/unit/test_mockup_session_card.py 및 tests/unit/test_mockup_review_tools_session.py → 22 passed, exit 0. 운영 비밀값/설정 변경 없음.
- 서버 PostgreSQL 통합: tests/integration/test_mockup_session_card_postgres.py → 6 skipped, exit 0. AADS_MOCKUP_TEST_DATABASE_URL 없음. 통과 증거로 세지 않는다.
- 원본 게이트: bash scripts/run_unit_tests.sh [관련 4개 단위 테스트 파일] → 기준 컨테이너/이미지 조회 실패, exit 2. 스크립트 수정 없음. 게이트 통과 아님.
- 초기 시스템 Python pytest → fastapi 없음, collection error exit 2. 기존 .venv 첫 시도 → JWT_SECRET_KEY 없음, collection error exit 2. 이후 테스트 전용 키를 사용한 위 핵심 22건 통과.
- 확장 pytest 4파일 실행은 57개 진행 표시 이후 종료 결과 미수신 상태로 별도 구분한다. 핵심 22건 결과와 합산하지 않는다.
- Vitest 첫 시도는 공유 node_modules의 .vite-temp 쓰기 EROFS로 exit 1. 작업 폴더 내 dependency symlink 디렉터리/로컬 캐시로 분리 후 위 24건 통과. 공유 dependency 원본 수정 없음.
- 통합 pytest를 대시보드 cwd에서 최초 실행한 시도는 잘못된 상대 경로로 exit 4. 서버 cwd에서 다시 실행해 위 6 skipped 결과를 확인했다.
- git diff --check → exit 0.

최종 보충: 최종 타입 검사 exit 0 및 RESULT 후행 공백 수정 후 git diff --check exit 0을 확인했다. 새 커밋은 생성하지 않았다.
