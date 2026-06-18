# AADS Dashboard Handover

## 2026-06-18 10:39 KST - Personal Assistant voice UX final verification correction
- 배경: CEO가 이전 완료보고의 커밋/푸시/배포/문서 상태 충돌을 지적했고, 채팅 개인비서 UX/음성 입력/일반 사용자 분리 상태를 최종 재검증하라고 지시했다.
- 정정:
  - dashboard `HEAD`와 `origin/main`은 `8708983b58407c04e7f2d61a575120c584d4beb8`로 일치한다.
  - 실제 반영 커밋은 `9fb9046 feat(chat): add personal assistant voice input`, `8708983 docs: correct assistant voice verification note`다.
  - “브라우저 마이크 권한과 실제 STT provider 동작”은 아직 로그인 브라우저 E2E로 검증하지 않았으므로 완료로 보고하지 않는다.
- 검증:
  - `npx eslint src/app/chat/ChatInput.tsx src/app/chat/page.tsx` 결과 error 0건, warning 22건.
  - `curl https://aads.newtalk.kr/api/health` 200, `{"status":"healthy"}` 응답.
  - dashboard active port는 3100이고, `aads-dashboard`, `aads-dashboard-green` 컨테이너 모두 healthy다.
- 남은 제한:
  - CEO 로그인 세션에서 실제 마이크 버튼 노출, 녹음 권한, `/api/v1/voice/transcribe` provider 응답은 브라우저 E2E로 추가 확인해야 한다.

## 2026-06-18 10:20 KST - Personal Assistant chat UX and voice input
- 대상: CEO가 AADS를 개인 인공지능 비서처럼 쓰기 위한 채팅 진입 UX와 음성 입력 MVP, 일반 사용자에게 내부 프로젝트 안내가 노출되는 리스크.
- 반영:
  - `src/app/chat/page.tsx`: `/auth/me`의 `is_internal_admin`을 읽어 CEO/internal admin은 Personal Assistant 빈 화면, 운영/승인/아젠다 quick prompt, 개인비서 placeholder를 표시한다. 일반 사용자는 기존 customer workspace 안내를 유지한다.
  - `src/app/chat/ChatInput.tsx`: CEO/internal admin에게만 마이크 버튼을 표시하고, 브라우저 `MediaRecorder` 녹음 후 `/api/v1/voice/transcribe`로 STT 변환해 입력창에 반영한다. voice API가 internal admin 전용이므로 일반 사용자에게는 마이크 버튼을 숨겼다.
  - `src/app/chat/ChatInput.tsx`: 일반 사용자는 `@PROJECT/@TEAM/@TASK` 멘션만 보게 하고, CEO/internal admin만 AADS/KIS/GO100/SF/NTV2/NAS 내부 프로젝트 멘션을 볼 수 있게 분리했다.
- 검증:
  - `npx eslint src/app/chat/ChatInput.tsx src/app/chat/page.tsx` 에러 0개, 기존 경고 22개.
  - `npm run build` 통과. route 목록에 `/chat`, `/admin/sessions`, `/onboarding`, `/team` 포함 확인.
  - `git diff --check -- src/app/chat/ChatInput.tsx src/app/chat/page.tsx HANDOVER.md` 통과 예정.
- 제한: 브라우저 마이크 권한과 실제 STT provider 설정 여부는 배포 후 로그인 세션에서 확인해야 한다. provider 미설정 시 UI는 오류 메시지를 채팅에 표시한다. 브라우저 로그인 화면 캡처는 아직 미실행이다.

## 2026-06-15 15:16 KST - Chat streaming bubble preservation and BG sync
- 대상: `/chat#d84b7c2c-64a5-4a80-9472-21170fd7d160` 등에서 추가지시 반영 중 이전 응답 버블이 사라지거나, DB에 저장된 streaming/partial 버블이 새로고침 전후 다르게 보이는 현상.
- 원인: 프론트 병합 로직이 `streaming_placeholder`를 전역 1개만 남기며 내용 있는 DB 저장 placeholder까지 삭제할 수 있었고, `stream_reset(reason=interrupt_applied)` 처리 시 기존 draft를 별도 버블로 고정하지 않은 채 같은 placeholder를 계속 재사용했다. 또한 배포 전 dashboard blue/green의 `BUILD_ID`와 client manifest가 달라 클라이언트 산출물 혼재 가능성이 있었다.
- 반영: `src/app/chat/page.tsx`에서 `interrupt-*` 로컬 user 버블을 transient 보존 대상에 포함했다. 중복 `streaming_placeholder` 중 내용 있는 DB 저장본은 삭제하지 않고 `interrupted_partial`로 고정한다. 추가지시 반영 `stream_reset` 시 현재 보이는 draft를 `ai-partial-interrupt-*` 버블로 남기고, 새 streaming placeholder를 이어쓰기 앵커로 유지한다.
- 검증: `git diff --check -- src/app/chat/page.tsx` 통과, `npm run build` 통과. `npm run lint`는 기존 전역 lint 부채 264 errors / 67 warnings로 실패했으며 이번 변경 파일 신규 에러는 확인되지 않았다.
- 배포: 커밋 `ba0a058 fix(chat): preserve streaming bubbles during interrupts` 푸시 완료. `bash deploy.sh`로 dashboard blue-green 배포 성공, active blue 및 standby green 헬스체크 통과, 양쪽 `/app/.next/server/app/chat/page.js` 해시가 `7e05546b...`로 일치한다. 배포 스크립트 Step 7 프론트 QA는 `UNKNOWN`이라 브라우저 E2E는 수동 확인 필요하다.

## 2026-06-15 12:41 KST - Docs electronic contract visibility
- 대상: `https://aads.newtalk.kr/docs`에서 전자계약 기획서와 근로계약서/프리랜서 계약서/뉴톡 입점계약서 초안이 눈에 잘 띄지 않는 문제.
- 반영: `src/app/docs/page.tsx`에 `계약/전자계약` 유형 라벨과 색상을 추가하고, AADS 문서 목록 상단에 전자계약 문서 고정 섹션을 추가했다. `전체 보기`는 `AADS + 전자계약` 검색 상태로 전환한다.
- 연동: 백엔드 `app/api/project_docs.py`가 계약/전자계약 문서를 `contract` 유형으로 분류하도록 보강되어 `/docs` 유형 필터에도 노출된다.
- 검증: `npx eslint src/app/docs/page.tsx` 통과. 백엔드 스캔 함수 직접 호출 기준 `/app/docs/reports/20260615_전자계약_시스템_기획서.md`, `/app/docs/reports/20260615_전자계약서_3종_템플릿_초안.md`, `/app/docs/contracts/*전자계약_초안.md` 3종이 `contract`로 분류됐다.
- 제한: 실브라우저 E2E는 인증 세션이 필요해 미실행했고, API/함수 스캔 검증으로 대체했다.

## 2026-06-12 12:50 KST - Admin home access final verification
- 대상: CEO 계정이 채팅창 홈 버튼으로 `/` 이동 시 어드민 홈에 접근하지 못하던 현상.
- 최종 상태: `moongoby@gmail.com` 검증 토큰 기준 `https://aads.newtalk.kr/` 200, `/chat` 200을 확인했다. 일반 사용자 검증 토큰은 양 대시보드 슬롯 `3100`, `3101`에서 `/` 접근 시 `/chat` 307로 리다이렉트된다.
- 권한 근거: 운영 DB에서 `moongoby@gmail.com`은 `role=ceo`, `default_tenant=internal`, `tenant_memberships.role=owner`, `status=active`다. `internal` active member 2명은 모두 CEO allowlist 계정이다.
- 코드 근거: `src/middleware.ts`는 `http://aads-server:8080/api/v1/auth/me`로 `is_internal_admin`을 확인하고, `src/components/chat/ChatLayout.tsx` 홈 버튼은 Next `Link href="/"`를 사용한다.
- 검증: `npx eslint src/app/chat/page.tsx src/components/chat/ChatLayout.tsx src/middleware.ts src/components/ClientLayout.tsx` 에러 0개(기존 경고 23개), `npm run build` 통과.
- 한계: CEO 실브라우저 쿠키는 Vault에 없어 브라우저 E2E는 미로그인 화면 확인까지만 수행했고, 인증 상태 검증은 서버 생성 검증 토큰과 API/HTTP 응답으로 대체했다.

## 2026-06-12 11:00 KST - Chat TODO panel default collapsed
- 대상: 채팅창 진입 또는 세션 이동 시 하단 TODO 패널이 기본 펼침 상태로 열리는 동작.
- 원인: `src/app/chat/page.tsx`의 `todoCollapsed` 초기값과 세션 변경 reset 값이 모두 `false`라서 첫 렌더와 세션 전환 때마다 TODO 목록이 펼쳐졌다.
- 반영: `todoCollapsed` 초기값과 `activeSession?.id` 변경 시 reset 값을 모두 `true`로 변경해 채팅 진입/세션 이동 기본 상태를 닫힘으로 맞췄다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npm run lint -- src/app/chat/page.tsx` 에러 0개(기존 경고 23개), `npm run build` 통과.
- 배포: 커밋/푸시/배포는 아직 수행하지 않았다. 운영 반영 시 대시보드 배포가 필요하다.

## 2026-06-11 11:42 KST - Admin user signup and usage overview verification
- 대상: CEO가 어드민에서 일반 사용자 가입현황과 사용현황을 확인할 수 있는지 최종 확인.
- 반영 확인: `src/app/admin/users/page.tsx`는 `/admin/users` 화면에서 전체 가입자, 활성 사용자, customer tenant, 초대, 호출/토큰/비용, 채팅 활동과 사용자별 최근 활동을 표시한다. `src/components/Sidebar.tsx`에는 `사용자 현황` admin 전용 메뉴가 추가되어 있고, `src/lib/api.ts`는 `/api/v1/admin/users/overview`를 호출한다.
- 운영 검증: API 양 슬롯 `aads-server:8100`, `aads-server-green:8102`에서 CEO 토큰으로 `/api/v1/admin/users/overview?days=30&limit=3` 호출 시 HTTP 200을 확인했다. 응답 기준 `total_users=43`, `active_users=35`, `customer_tenants=34`, `calls_window=5,551`, `tokens_window=1,979,329`, `usage_cost_window=$239.398435`이다. 외부 도메인 `https://aads.newtalk.kr/api/v1/admin/users/overview?days=30&limit=3`도 CEO 토큰으로 HTTP 200이며 `calls_window=5,552`로 1건 증가한 최신 사용량을 반환했다.
- 화면 검증: dashboard active 슬롯 `3101`과 외부 도메인 `/admin/users`는 미인증 상태에서 `/login?redirect=%2Fadmin%2Fusers`로 리다이렉트된다. 브라우저 로그인 클릭 E2E는 미실행했으며, 인증 API 검증과 배포된 소스/라우트 검증으로 대체했다.
- 제한: `npx eslint src/app/admin/users/page.tsx src/components/Sidebar.tsx src/components/ClientLayout.tsx src/lib/auth.ts`는 통과했다. `src/lib/api.ts` 단독 lint는 기존 `no-explicit-any` 부채 141건으로 실패했으며, 이번 변경 diff 자체에는 신규 `any` 추가가 없다.

## 2026-06-10 12:51 KST - Chat session artifact scope freeze fix
- 대상: `/chat#266ab3aa-b0fd-46bb-8c54-01e4852c956f` 세션에서 채팅 진행 시 브라우저가 멈추는 현상.
- 확인: DB 기준 해당 세션은 메시지 532건, 본문 505,688자, 세션 artifact 292건/400,934자였다. 하지만 프론트 `src/app/chat/page.tsx`가 세션 진입과 SSE 완료 후 artifact 갱신 시 `workspace_id` 전체 artifact를 조회해 같은 워크스페이스 artifact 7,026건/9,121,191자를 매번 로드하고 있었다.
- 원인: 메시지 렌더 cap은 150개로 제한되어 있었지만, artifact 배열은 워크스페이스 전체를 `setArtifacts()`에 넣고 필터/카운트/패널 렌더에 반복 사용되어 특정 대용량 워크스페이스 세션에서 메인스레드 부하가 급증했다.
- 반영: 채팅 화면의 artifact 초기 로드와 스트리밍 완료 후 artifact 새로고침을 모두 `workspace_id` 기준에서 현재 `session_id` 기준으로 변경했다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `git diff --check -- src/app/chat/page.tsx` 통과, `npx tsc --noEmit --pretty false` 통과, `npm run build` 통과. `npm run lint`는 기존 전역 lint 부채 276 errors / 69 warnings로 실패했으며 이번 변경 파일 신규 컴파일 오류는 없음.

## 2026-06-08 14:38 KST - SaaS signup onboarding UI
- 대상: SaaS 가입 직후 조직명, 팀원 초대, 권한 역할을 명확히 받는 P1 온보딩 흐름.
- 반영: `src/app/signup/page.tsx`는 계정 생성 후 일반 AADS 사용자를 `/onboarding`으로 이동시킨다. 신규 `src/app/onboarding/page.tsx`는 조직명을 필수로 받고, 팀원 초대 이메일과 `admin/member/viewer` 역할을 입력받아 `/api/v1/auth/onboarding`에 제출한다.
- 반영: `src/lib/auth.ts`에 `completeOnboarding()` 클라이언트 API를 추가해 온보딩 완료 후 새 tenant token을 저장한다. `src/components/ClientLayout.tsx`는 온보딩 화면에서 사이드바를 숨긴다.
- 검증: `npx eslint src/lib/auth.ts src/app/signup/page.tsx src/app/onboarding/page.tsx src/components/ClientLayout.tsx` 통과. `npm run build` 통과.

## 2026-06-05 15:49 KST - Chat final response and stream reset preservation
- 대상: 채팅창에서 스트리밍 응답이 중간 재검증/재연결/완료 직후 비거나, 최종응답이 DB 저장 후 화면에 늦게 병합되어 사라진 것처럼 보이는 재발 위험.
- 반영: `src/hooks/useChatSSE.ts`에서 fallback 복구가 `streaming_placeholder/rate_limited`를 최종 응답으로 오인하지 않게 필터링하고, `stream_reset` 시 이미 보이는 텍스트를 `displayTextRef`에 유지한다. 완료 이벤트에서는 `chunk.content → 렌더 버퍼 → 누적 fullText` 순서로 최종 텍스트를 산정해 `completeStream()`과 `onDone()`에 같은 값을 넘긴다.
- 반영: `src/app/chat/page.tsx`에서 attach replay와 메인 SSE `stream_reset` 분기가 `setStreamBuf("")`로 버블을 비우지 않고, 기존 `full/streamBuf/bgPartialContent`를 visible draft로 유지한다. 기존 finalization 보강 흐름과 결합해 완료 직후 DB 최종 메시지 병합을 반복 확인한다.
- 변경 파일: `src/hooks/useChatSSE.ts`, `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npx tsc --noEmit --pretty false` 통과, `npx eslint src/app/chat/page.tsx src/hooks/useChatSSE.ts` 에러 0개(기존 경고 23개), `npm run build` 통과.
- 배포: 본 문서 기록 후 `bash deploy.sh`로 dashboard blue-green 배포 대상.

## 2026-06-01 17:20 KST - Dashboard deploy lock hardening
- 대상: `bash deploy.sh` 실행 시 `/tmp/aads-dashboard-deploy.lock`에 죽은 PID가 남아 "대시보드 배포가 이미 진행 중입니다"로 무중단 배포가 차단된 현상.
- 확인: lock 파일에는 `PID=30800`이 기록되어 있었으나 호스트 `ps -p 30800` 기준 프로세스가 존재하지 않았다. Docker 상태는 `aads-dashboard:3100` active, `aads-dashboard-green:3101` standby 모두 healthy였고 BG 구조 장애는 아니었다.
- 원인: 기존 lock 파일은 PID 한 줄만 저장해 종료 시 `trap`이 실행되지 못한 stale lock과 실제 진행 중인 배포를 구분하기 어려웠다.
- 반영: `deploy.sh`가 lock에 `pid`, `started_at`, `host`, `cwd`, `script`, `log`를 기록하고, 기존 lock 발견 시 `/proc/{pid}/cmdline`이 실제 `bash deploy.sh`인지 확인한 뒤 살아있는 실제 배포만 차단한다. 종료된 PID 또는 deploy.sh가 아닌 PID의 lock은 stale로 기록하고 제거한다. 배포 실행별 로그는 `deploy-logs/dashboard-deploy-YYYYMMDD-HHMMSS.log`에 남긴다.
- 변경 파일: `deploy.sh`, `.gitignore`, `HANDOVER.md`.
- 검증/배포: 본 변경 검증 후 `bash deploy.sh`로 dashboard blue-green 배포를 진행한다.

## 2026-05-31 (Chat final response dedup priority fix)
- 대상: `/chat#b8a8651b-6226-46df-9a44-36a70e478959` 등에서 응답 버블이 있다가 사라지거나 중단/partial 버블이 최종 응답을 밀어내는 재발 현상.
- 확인: DB에는 대상 세션 메시지 614건이 남아 있고 최신 assistant partial도 저장되어 있었으나, 프론트 `mergeServerMessagesPreservingLocal()`의 assistant dedup가 ASC 순회 중 같은 `execution_id`/content prefix 중복을 먼저 본 메시지 기준으로 제거했다. 이 구조에서는 `interrupted_partial` 또는 로컬 draft가 먼저 들어오면 뒤늦게 도착한 최종 assistant가 화면 상태에서 제거될 수 있다.
- 반영: `assistantMergePriority()`를 추가해 중복 병합 시 `final assistant > meaningful interrupted/recovered partial > short interruption/placeholder/local draft` 순서로 보존한다. 같은 `execution_id`나 content prefix가 충돌하면 우선순위와 본문 길이를 비교해 최종 응답을 대표 메시지로 교체하고, partial/draft만 제거한다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npx eslint src/app/chat/page.tsx` 에러 0개(기존 경고 21개), `npm run build` 통과.
- 주의: 대시보드 워크트리에는 과거 백업 파일 삭제와 미추적 리포트가 다수 남아 있으므로 커밋 시 이번 조치 파일만 선별 스테이징한다.

## 2026-05-29 (Chat tab-return streaming restore regression fix)
- 대상: `/chat#b8a8651b-6226-46df-9a44-36a70e478959` 세션에서 응답 버블이 있다가 사라지고, 새로고침/탭 복귀 후 완료 응답이 늦게 보이는 재발 현상.
- 확인: 프론트 탭 복귀 복원 코드가 존재하지 않는 `/chat/streaming-status?session_id=...` 경로를 호출하고 있었다. 실제 백엔드 경로는 `/chat/sessions/{session_id}/streaming-status`다. 호출 실패는 `catch {}`로 조용히 묻혔고, 이어지는 메시지 재조회도 `streamingRef.current`가 true이면 DB `streaming_placeholder` 병합을 건너뛰어 화면상 버블이 사라진 것처럼 보일 수 있었다.
- 반영: 탭 복귀 복원 API 경로를 실제 엔드포인트로 수정하고, 서버가 `is_streaming=true`와 `partial_content`를 반환하면 `streamingSessionRef`, `streaming`, `waitingBgResponse`, `streamBuf`, `currentExecutionIdRef`, `lastEventIdRef`를 즉시 복원한다. 또한 스트리밍 중이어도 DB에 의미 있는 `streaming_placeholder`가 있으면 병합을 허용해 강력 새로고침/탭 복귀 후 진행 버블이 사라지지 않게 했다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npm exec eslint -- src/app/chat/page.tsx` 에러 0개, 기존 경고 21개.
- 주의: 대시보드 워크트리에는 과거 백업 파일 삭제와 미추적 리포트가 다수 남아 있으므로 커밋 시 이번 조치 파일만 선별 스테이징한다.

## 2026-05-26 (Chat browser freeze follow-up)
- 대상: 채팅에 지시를 입력하면 브라우저가 잠시 멈췄다가 진행되는 재발 현상.
- 확인: `/chat#be533af6-c514-4bbc-b71c-bb68705addc0` 세션은 DB 기준 메시지 385건, assistant 228건, `streaming_placeholder` 0건, `interrupted_partial/interruption_notice` 46건으로 저장 중복보다는 프론트 렌더/스트리밍 처리 부하가 핵심이었다. `page.tsx`에서는 긴 응답을 150ms마다 전체 `streamBuf`로 갱신하고, 화면 키워드가 있는 지시에서 캡처 파일을 `String.fromCharCode(...bytes)`로 동기 base64 변환하는 경로가 남아 있었다.
- 반영: 스트리밍 드레인을 250ms tick + 450ms/900ms 최소 렌더 간격으로 완화하고 `startTransition`으로 낮은 우선순위 갱신 처리한다. 화면 캡처 base64 변환은 `FileReader.readAsDataURL()` 기반 비동기 helper로 통일해 전송 직전 메인스레드 블로킹과 spread argument 과부하를 제거했다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npx eslint src/app/chat/page.tsx` 에러 0개(기존 경고 21개), `npm run build` 통과, `git diff --check` 통과. 전체 `npm run lint`는 기존 전역 lint 부채 277 errors / 67 warnings로 실패.

## 2026-05-18 (Chat recovery duplicate bubble guard)
- 대상: `/chat#2648cf77-4256-45e8-9cde-0e563ffefe5c` 등에서 복구/재연결 이후 assistant 응답 버블이 2개로 보이는 현상.
- 확인: DB 기준 최신 실행은 `chat_turn_executions.id=209ab75c-ad86-467e-82fd-d6fe2050b8ac`, `status=running`, `streaming_placeholder` 1건만 존재했다. 저장 중복이 아니라 프론트가 같은 `execution_id`의 `streaming_placeholder`, `interrupted_partial`, `recovered/interrupted` draft를 동시에 렌더링할 수 있는 병합 경합으로 분리했다.
- 반영: `isAssistantDraftMessage()`를 추가하고 `mergeServerMessagesPreservingLocal()`에서 같은 `execution_id`의 draft assistant를 1개로 collapse한다. 최종 assistant가 저장된 execution의 draft류는 제거한다. 렌더 단계도 같은 `execution_id`의 draft는 본문 overlap이 약해도 중복 그룹으로 묶도록 보강했다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npm run build` 통과.

## 2026-05-15 (Chat 응답 버블 중복/도구 박스 깜빡임 재수정)
- 대상: `/chat#5f09a33c-7535-42e6-929d-ae999803c64f`, `/chat#8ad08cc2-620c-4a70-8305-74a8d9b43c4e` 등에서 응답 중 assistant 버블이 2개처럼 보이거나 도구 박스가 접혔다 펴지는 현상.
- 원인: SSE `done`/`message_done`/resume/last-response 경로가 placeholder를 최종 메시지로 바꾸는 방식이 서로 달랐고, `done` 직후 350ms/1.5s 서버 재조회가 즉시 실행되어 로컬 최종 버블과 DB 최종 버블 병합이 경합했다. 일부 교체 경로는 `render_id`를 보존하지 않아 React key가 바뀌면서 도구 박스가 리마운트됐다.
- 반영: `replaceStreamingPlaceholderWithFinal()`로 최종 버블 교체를 단일화해 `render_id`를 유지하고, 중복 placeholder/partial을 제거한다. `done` 직후 즉시 재조회는 5초 merge cooldown으로 대체했고, 이미 final을 받은 경우 finally의 `just_completed` 원샷 조회를 건너뛰게 했다. 마지막 assistant의 도구 박스/긴 본문 자동 펼침은 effect setState 대신 파생값으로 처리해 접힘/펼침 cascade를 제거했다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npm run build` 통과, `npx tsc --noEmit` 통과, `npx eslint src/app/chat/page.tsx` 에러 0개(기존 경고 22개).

## 2026-05-14 (Chat assistant 중복 버블 렌더링 압축)
- 대상: `/chat#f31f1238-fdc8-4405-8893-351226e06bda` 등에서 응답 중 assistant 버블이 여러 개 보였다가 새로고침 후 DB 기준 1개만 남는 현상.
- 확인: 직전 `ee9a08d`는 실제 blue/green 배포까지 완료됐고, 배포 이후 대상 세션 DB에는 중복 assistant 저장이 없었다. 남은 증상은 실행 중 브라우저 메모리에 남는 draft/recovered/interrupted assistant 버블이 화면에서 압축되지 않는 렌더링 문제로 확인했다.
- 반영: assistant 메시지 렌더링 배열 생성 단계에서 `streaming_placeholder`, 로컬 transient, `interrupted`, `recovered` 버블의 본문이 연속으로 겹치면 가장 긴 본문 1개만 대표 표시하고 나머지는 기존 중복 메시지 접기 UI로 묶도록 보강했다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npm run build` 통과. `npm run lint`는 기존 전역 lint 부채 274건으로 실패했으며 이번 변경 파일 신규 빌드 오류는 없음.

## 2026-05-18 (Chat interrupted_partial dependency conflict guard)
- 대상: `/chat#2648cf77-4256-45e8-9cde-0e563ffefe5c` 등에서 복구/중단 시 현재 응답 버블이 사라지거나 2개처럼 보이는 재발 현상.
- 원인: 과거 partial 숨김용 `interrupted_partial` intent를 현재 진행 중 placeholder 보존에도 재사용해, `isHiddenAssistantMessage()` 필터와 충돌했다.
- 반영: 스트리밍 stuck/복구 타임아웃에서 현재 placeholder를 `interrupted_partial`로 숨기지 않고, `intent=undefined`, `model_used='interrupted'`, stable `render_id`로 visible partial bubble을 유지하도록 변경했다. 과거 DB partial 숨김 정책은 유지한다.
- 변경 파일: `src/app/chat/page.tsx`, `HANDOVER.md`.
- 검증: `npm run lint -- src/app/chat/page.tsx` 에러 0개(기존 경고 22개), `npm run build` 통과.

## 2026-05-14 (Chat streaming placeholder 중복 제거)
- 대상: `/chat#aa433b41-0ad2-421c-ae7c-bac4806035cc` 등에서 응답 중 로컬 `streaming_placeholder` 버블이 여러 개 보이다가 새로고침 후 DB 기준 1개로 정리되는 현상.
- 원인: 프론트가 새 지시 전송 시 내용 없는 이전 로컬 placeholder도 보존 문구로 얼리고, 서버 최종 assistant가 도착해도 `execution_id` 없는 로컬 placeholder를 제거하지 않아 화면 상태에만 중복 버블이 누적될 수 있었다.
- 반영: 내용 없는 placeholder는 보존하지 않고 제거하며, 서버 assistant가 해당 시점 이후 도착하면 매칭되지 않은 로컬 streaming placeholder를 정리하도록 `mergeServerMessagesPreservingLocal()`을 보강했다.
# 2026-06-05 15:06 KST - Chat streaming-stuck false interrupt guard

- 대상: `https://aads.newtalk.kr/chat#7e4a270f-0134-4f8b-bf6d-04b08e66e002` 세션에서 마지막 응답 버블이 최종 완료되지 않고, 장시간 응답 중 하단에 "응답 중단" 배지가 반복 표시될 수 있는 현상.
- DB 실측: 해당 세션의 최신 실행 `366ccc75-d30a-48d8-b60c-be31eb838160`은 `running` 상태였고, `updated_at`이 계속 갱신 중이었다. 최신 assistant 메시지는 `streaming_placeholder`, `model_used=streaming`으로 최종 완료 메시지가 아니었다.
- 원인: 프론트 `STREAMING-STUCK` 안전장치가 서버가 아직 `is_streaming=true`라고 보고하는 중에도 진행 키 변화가 오래 없으면 placeholder를 `interruption_notice/model_used=interrupted`로 전환했다. 긴 도구 실행이나 LLM 지연 중 이 분기가 실행되면 실제 실행은 살아 있는데 UI만 "응답 중단"으로 보이고, 이후 재연결/폴링으로 다시 진행되는 것처럼 보인다.
- 반영: `src/app/chat/page.tsx`에서 `ss.is_streaming && _streaming` 상태의 stuck 분기는 더 이상 placeholder를 interrupted로 바꾸거나 streaming을 끄지 않는다. 대신 서버 생성 상태를 유지하고, 메시지 병합과 execution replay 재연결만 수행한다.
- 검증: `npx tsc --noEmit --pretty false` 통과. `npx eslint src/app/chat/page.tsx src/services/chatApi.ts` 에러 0개, 기존 경고 23개. `npm run build` 통과.
- 배포: 본 변경은 아직 커밋/푸시/배포 전이다.

- 추가 보정: `deploy.sh`가 nginx upstream 전환 후 `.active_container`/`.active_port` 상태 파일을 갱신하도록 수정했고, 현재 상태 파일을 active green(`aads-dashboard-green`, `3101`)으로 보정했다.
- 변경 파일: `src/app/chat/page.tsx`, `deploy.sh`, `HANDOVER.md`.
- 검증: `npm run build` 통과, `npx eslint src/app/chat/page.tsx` 에러 0개(기존 경고 21개), `./deploy.sh` blue-green 배포 및 프론트 QA 통과.

## 2026-05-13 (Chat TODO 즉시 갱신 보강)
- 대상: 채팅창 상단 TODO 패널의 생성/완료 직후 갱신 지연.
- 반영: 사용자 메시지 전송 직후 `600ms/1.8s/4.2s` 지연 재조회와 스트리밍 완료 직후 즉시 재조회를 추가해, 새로 생성되거나 완료 처리된 TODO가 폴링 주기까지 기다리지 않고 패널에 반영되도록 했다.
- 변경 파일: `src/app/chat/page.tsx`.
- 검증: `npx tsc --noEmit --pretty false` 통과. `npx eslint src/app/chat/page.tsx`는 에러 0개, 기존 경고 21개.

## 2026-05-13 (Chat TODO 정리 UI)
- 대상: 채팅창 상단 TODO 패널의 사용자 정리 액션.
- 반영: 실패 TODO 재시도, 완료/실패/대기 일괄 비우기, 항목별 재시도/제외/숨김 버튼을 `src/app/chat/page.tsx`에 추가했다.
- 백엔드 연동: AADS API의 `PATCH/DELETE /chat/sessions/{session_id}/todos/{todo_id}`, `POST /chat/sessions/{session_id}/todos/clear`, `POST /chat/sessions/{session_id}/todos/retry-failed`를 호출한다.
- 검증: `npx tsc --noEmit --pretty false` 통과. `npx eslint src/app/chat/page.tsx`는 에러 0개, 기존 경고 21개.

## 2026-05-12 (AADS-BRIDGE-SESSION-001F)
- 대상: `runner-7e568511` 후속 조치 (dashboard 배포 실패 `nginx 설정 검증 실패 — upstream 롤백`)
- 확인: Runner 실패 로그는 `Step 3: nginx upstream -> green` 직후 `nginx -t` 실패로 중단됨.
- 원인 정리: 기존 `deploy.sh`는 `nginx -t` 실패 원인을 버리고(`>/dev/null 2>&1`), 실행 환경에 따라 `/var/run/nginx.pid` 접근 이슈가 발생하면 upstream 문법이 정상이어도 false-fail 될 수 있음.

### 반영된 수정 (`deploy.sh`)
- `nginx_test()`:
  - `nginx -t`를 기본 검증으로 사용하고 실패 시 stderr를 그대로 출력해 원인 로그를 남김.
  - 1차 후속 배포에서 `-g "pid ..."` 방식이 서버의 기존 `pid` 지시어와 중복되는 문제가 확인되어 제거함.
  - 호스트 nginx 테스트 실패 시 `aads-nginx` 컨테이너가 실제로 존재할 때만 컨테이너 검증으로 폴백.
- `nginx_reload()`:
  - `systemctl reload nginx`가 불가한 환경이면 `nginx -s reload`를 먼저 시도.
  - 컨테이너 폴백은 `aads-nginx` 존재 시에만 수행.
- `verify_upstream_shape()` 추가:
  - upstream 파일에 `3100`, `3101` 라인이 최소 1개씩 있는지 사전 검증 후 전환.
- Step 3/rollback 검증에서 stdout/stderr를 버리지 않도록 변경.

### 영향 범위
- 변경 파일: `deploy.sh` 1개.
- 영향 대상: dashboard blue-green 배포 시 nginx upstream 전환 검증/리로드 경로.
- 비영향: Browser Bridge 업무별 세션 매니저 로직(`browser_work_key`, `ensure_work_session`)은 수정하지 않음.

### Browser Bridge 사용 예시 (운영 규칙 유지)
- 신상마켓 전용 세션 확보:
  - `browser_connect(action='ensure_work_session', work_key='ntv2-sinsang-registration')`
- 중국상품소싱 관리자 전용 세션 확보:
  - `browser_connect(action='ensure_work_session', work_key='ntv2-china-sourcing-admin')`
- 같은 업무 키 재호출(동일 세션 재사용 기대):
  - `browser_connect(action='ensure_work_session', work_key='ntv2-china-sourcing-admin')`
- 업무 키로 격리된 후속 작업:
  - `browser_snapshot(browser_work_key='ntv2-china-sourcing-admin')`
- 세션/매핑 상태 확인:
  - `browser_connect(action='status')`
## 2026-05-20 15:42 KST - Chat bubble immediate placeholder and interrupted partial continuity

- 대상: 채팅창에서 질문 직후 응답 버블이 늦게 뜨거나, 중단 응답이 이어가기 중 사라지고, 복구 중 버블이 중복 표시되는 현상.
- 원인: 첫 세션 생성 경로에서 방금 만든 optimistic `streaming_placeholder`까지 `freezeStreamingPlaceholders()`로 `interrupted_partial` 처리해 현재 응답 버블을 불안정하게 만들었다. 또한 `partial_preserved` 처리 시 기존 `interrupted_partial` 전체를 제거해 DB에 저장된 partial을 화면에서 잃을 수 있었다.
- 반영: `src/app/chat/page.tsx`에서 1자 이상 저장된 placeholder를 visible partial로 전환하고, `partial_preserved`는 기존 partial을 유지한 채 새 placeholder를 이어 붙이도록 수정했다. 실시간 `thinkingBuf`를 placeholder의 `thinking_summary`로 주기 동기화해 중단 후에도 사고 과정 박스에 남도록 했다.
## 2026-06-10 11:14 KST - Chat false completion toast guard

- 대상: 채팅창에서 응답이 완료처럼 보였다가 `완료 전 중단`으로 뒤집히는 현상.
- 원인: `/streaming-status`가 `just_completed=true`를 반환하면 프론트가 최종 assistant 존재 여부와 무관하게 streaming 상태를 해제하고 완료 토스트를 표시할 수 있었다. 이후 DB 메시지 재조회에서 같은 execution의 중단/archived partial이 들어오면 완료 버블이 중단 버블처럼 바뀌어 보였다.
- 반영: `src/app/chat/page.tsx`에서 `just_completed` 처리 시 `latestFinalAssistantForExecution()`으로 실제 최종 assistant를 확인한 경우에만 placeholder를 final로 교체하고 완료 토스트를 표시한다. 최종 assistant가 없으면 `waitingBgResponse/streaming`을 유지하고 `최종 응답 확인 중` 상태로 둔다. SSE 종료 직후 원샷 completion check도 동일하게 보강했다.
- 검증: `npm run build` 통과. `npm run lint` 전체는 기존 전역 ESLint 부채 276 errors/69 warnings로 실패했으며, 이번 변경 파일은 build 기준 통과했다.
- 배포 상태: 본 기록 후 backend와 함께 커밋/푸시 및 dashboard blue-green 배포 대상이다.

- 검증: `npm run lint -- src/app/chat/page.tsx` 에러 0개(기존 경고 22개), `npm run build` 통과.
- 배포: 본 문서 기록 후 백엔드 threshold 패치와 함께 커밋/푸시 및 무중단 배포를 진행한다.

## 2026-05-20 15:56 KST - Chat TODO manual list deployment fix

- 대상: 채팅창 하단/아티팩트 tasks TODO를 실제 작업 리스트 제목으로 직접 추가/관리하는 UI 반영 누락.
- 원인: `src/app/chat/page.tsx`와 백엔드 TODO API 변경은 소스에 있었지만, 활성 대시보드 컨테이너 정적 번들에는 `/todos` 생성 코드가 없어 사용자 브라우저 화면에 반영되지 않았다. 자동 배포는 cron PATH에 `nginx` 경로가 없어 upstream 검증 단계에서 false-fail로 롤백되고 있었다.
- 반영: `deploy.sh`에 `/usr/sbin` 포함 PATH를 명시해 cron/자동 동기화 환경에서도 `nginx -t`와 reload가 정상 실행되게 했다.
- 배포: `bash deploy.sh`로 dashboard blue-green 배포 완료. active 슬롯은 `aads-dashboard:3100`, standby는 `aads-dashboard-green:3101`.
- 검증: 외부 `https://aads.newtalk.kr/_next/static/chunks/app/chat/page-2dd488c1106b05b1.js`에서 `/todos` 호출 7건 확인, backend OpenAPI에서 `/chat/sessions/{session_id}/todos` 확인, `nginx -t` 통과.
- 남은 사항: Visual QA API 결과는 `UNKNOWN`으로 통과 판정하지 않음. 저장된 브라우저 로그인 자격증명이 없어 로그인 후 실제 클릭 QA는 미실행.

## 2026-05-20 16:42 KST - Chat interrupted response visibility and continue bubble

- 대상: `be533af6-c514-4bbc-b71c-bb68705addc0` 등 채팅창에서 응답 중단 후 부분 응답이 사라지거나, placeholder 문구가 새 응답 버블로 계속 쌓이는 현상.
- 원인: 1자 이상 표시 정책이 실제 LLM partial과 UI 상태문구(`분석 중`, `세션 생성 중`)를 구분하지 못해 placeholder-only 텍스트까지 `interrupted_partial`로 승격될 수 있었다. 또한 regenerate/이어쓰기 경로는 스트리밍 상태만 켜고 즉시 표시용 placeholder를 추가하지 않아 응답 버블이 늦게 보였다.
- 반영: `src/app/chat/page.tsx`에 placeholder-only 문구 필터를 추가해 실제 DB partial은 1자라도 표시하되 UI 상태문구만 단독 버블로 승격하지 않게 했다. 중단 응답의 사고 과정 요약은 기본 펼침으로 표시하고, 중단 응답의 재생성 버튼은 즉시 `이어서 생성 중` placeholder를 삽입한 뒤 최종 응답으로 in-place 교체한다.
- 검증: `npx eslint src/app/chat/page.tsx` 에러 0개(기존 경고 22개), `npm run build` 통과. 백엔드 관련 파일은 `python3 -m py_compile app/services/chat_service.py app/services/model_selector.py app/routers/chat.py` 통과.
- 배포: 본 변경 커밋 후 dashboard blue-green 배포 대상.

## 2026-05-27 08:51 KST - Chat stale interrupt auto resend

- 대상: 세션 `f31f1238-fdc8-4405-8893-351226e06bda`에서 스트리밍이 멈춘 뒤 추가 지시를 보내면 user 버블만 저장되고 assistant 응답이 생성되지 않는 현상.
- 원인: 프론트가 `streamingRef/waitingBgRef`를 기준으로 `/interrupt`를 호출했고, 백엔드가 stale runtime을 `queued=false`로 반환해도 기존 코드는 입력 복원만 하고 일반 전송을 자동 재시도하지 않았다.
- 반영: `src/app/chat/page.tsx`에서 `/interrupt`가 `queued=false`를 반환하면 streaming/waiting/finalizing ref를 즉시 정리하고 같은 내용을 일반 `sendMessage()`로 자동 재전송한다. 사용자는 다시 입력하지 않아도 다음 턴이 생성된다.
- 검증: `npx eslint src/app/chat/page.tsx` 에러 0개(기존 경고 21개), `npm run build` 통과.

## 2026-06-05 16:18 KST - Chat running placeholder completion badge guard

- 대상: 세션 `7e4a270f-0134-4f8b-bf6d-04b08e66e002`에서 DB 실행은 `running`인데 마지막 `streaming_placeholder` 버블이 완료처럼 표시되는 현상.
- 원인: `MessageItem` 완료 배지 조건이 `isActiveStreaming`에만 의존했다. SSE/브라우저 재연결이 끊겨 전역 streaming 플래그가 꺼지면, `intent='streaming_placeholder'` 메시지도 일반 assistant 완료 배지 블록으로 들어갈 수 있었다.
- 반영: `src/app/chat/page.tsx`에서 `isVisiblyStreaming = isActiveStreaming || isStreamingPlaceholder`로 렌더 기준을 통합했다. placeholder는 전역 streaming 플래그가 꺼져도 `생성 중` 배지를 유지하고 `완료` 배지를 표시하지 않는다.
- 검증: 본 변경 커밋 전 `npm run build`와 운영 API/컨테이너 상태를 확인한다.

## 2026-06-05 16:37 KST - Chat continued partial badge guard

- 대상: 새 지시가 들어와 이전 응답 partial이 `intent='continued'`로 보존된 뒤에도 하단에 `응답 중단` 또는 `완료` 배지가 표시되는 현상.
- 원인: DB는 일부 partial을 `continued`로 보정했지만 `model_used='interrupted'`가 남아 있고, 프론트 배지 조건이 `model_used`만 보고 장애 중단으로 분류했다.
- 반영: `src/app/chat/page.tsx`에 `isContinuedMessage()`를 추가해 `continued`는 별도 `이어서 생성됨` 출처 배지만 표시하고, `응답 중단`/`완료` 배지 조건에서 제외했다.
- 검증: `npx tsc --noEmit --pretty false`, `npm run build`, dashboard blue-green 배포 후 health/release 확인 대상.

## 2026-06-11 10:49 KST - AADS signup onboarding copy follow-up

- 배경: 일반 사용자가 처음 가입/로그인할 때 사용 흐름을 이해하기 어렵고, `/signup` 화면이 AADS 도메인에서도 `KakaoBot 회원가입`으로 보이는 문제가 확인됐다.
- 조치:
  - `src/app/signup/page.tsx`의 AADS 기본 가입 화면 문구를 `AADS 워크스페이스 회원가입`으로 수정했다.
  - 가입 후 `조직명과 팀원 권한을 설정합니다` 안내 문구를 추가해 `/onboarding` 흐름을 명시했다.
- 검증:
  - `npx eslint src/app/signup/page.tsx` 통과.
  - `bash deploy.sh`로 dashboard blue-green 배포 완료. active 슬롯은 `aads-dashboard:3100`, standby는 `aads-dashboard-green:3101`이다.
  - Browser Bridge 스냅샷 기준 `https://aads.newtalk.kr/signup?v=a8ce6b2`에서 수정 문구가 표시된다.
- 주의:
  - 배포 스크립트 Step 7 QA는 `UNKNOWN`으로 종료되어 통과로 간주하지 않는다. 수동 검증으로 화면 문구와 컨테이너 health를 확인했다.
  - Browser Bridge에서 가입 폼 입력 후 submit 이벤트가 API 요청으로 이어지지 않아 브라우저 가입 제출 E2E는 미확정이다. API 직접 검증 기준 customer tenant 생성, agenda 0건, customer briefing scope는 정상이다.

## 2026-06-12 12:11 KST - Admin home middleware auth URL fix

- 대상: CEO 계정이 `/chat` 홈 버튼으로 `/` 이동 시 관리자 홈 대신 `/chat`으로 되돌아가는 현상.
- 원인: middleware의 내부 `/auth/me` 확인 URL을 `new URL("/auth/me", "http://aads-server:8080/api/v1/")`로 만들면 `/api/v1` 경로가 버려져 `http://aads-server:8080/auth/me`를 호출했다. 이 404가 관리자 권한 없음으로 처리되어 CEO도 `/chat`으로 리다이렉트됐다.
- 반영: `src/middleware.ts`에서 상대 경로를 `auth/me`로 바꿔 실제 호출 대상이 `http://aads-server:8080/api/v1/auth/me`가 되도록 수정했다.
- 검증 예정: `npx tsc --noEmit --pretty false`, dashboard blue-green 배포, 공개 도메인 `https://aads.newtalk.kr/` 쿠키 기반 CEO/일반 사용자 리다이렉트 분리 확인.

## 2026-06-12 12:40 KST - Chat admin home Link cleanup

- 대상: 채팅 상단 `Dashboard` 홈 버튼.
- 반영: `src/components/chat/ChatLayout.tsx`의 `/` 이동 버튼을 `<a href="/">`에서 Next `Link`로 교체했다. 이동 대상은 그대로 `/`이며, CEO/internal admin은 middleware와 `/auth/me`의 `is_internal_admin` 판정으로 어드민 홈에 접근한다.
- 검증: `npx eslint src/middleware.ts src/components/ClientLayout.tsx src/components/Sidebar.tsx src/app/login/page.tsx src/components/chat/ChatLayout.tsx src/app/chat/ChatSidebar.tsx` 통과. `bash /root/aads/aads-dashboard/deploy.sh`로 release `7698f43ae41a` blue-green 배포 완료. Step 7 QA는 `UNKNOWN`이라 수동 health/API 검증으로 보완 필요.

## 2026-06-12 13:47 KST - Admin user session audit UI and faster admin navigation

- 배경: CEO가 어드민 메뉴 클릭 후 이동이 느리고 페이지 접근이 불안정하며, 관리자가 사용자별 세션을 접근 확인할 수 있어야 한다고 지시했다.
- 조치:
  - `src/app/admin/users/page.tsx` 사용자 행에 `세션 보기`를 추가해 해당 사용자의 tenant 세션과 메시지 상세를 관리자 화면에서 열람할 수 있게 했다.
  - `src/app/admin/sessions/page.tsx`에 이메일/tenant/세션명 검색, tenant/사용자/최근 질문 컬럼, 메시지 상세 패널을 추가했다.
  - `src/lib/api.ts`에 `/admin/sessions` 필터 파라미터와 `/admin/sessions/{session_id}` 상세 API 타입을 추가했다.
  - `src/middleware.ts`에서 메뉴 이동마다 서버 측 `/auth/me`를 재호출하던 관리자 판정을 제거했다. 일반 사용자 데이터 차단은 `ClientLayout`과 백엔드 admin API 권한으로 유지한다.
  - `src/lib/auth.ts`에서 `/auth/me` 결과를 단기 캐시해 클라이언트 라우트 이동 시 중복 인증 왕복을 줄였다.
- 검증:
  - `npx eslint src/app/admin/users/page.tsx src/app/admin/sessions/page.tsx src/lib/auth.ts src/middleware.ts` 통과.
  - `npx tsc --noEmit --pretty false` 통과.
  - 운영 API 검증: CEO 토큰 `/admin/sessions?email=objgood@naver.com` 200/3건, 일반 사용자 토큰 `/admin/sessions` 403 확인.
- 주의:
  - 과거 세션은 서버 DB에 작성자 ID가 없으므로 사용자 active tenant membership 기준으로 노출된다. 신규 세션은 서버 `chat_sessions.user_id`로 작성자 단위 추적된다.

## 2026-06-12 13:19 KST - Chat home button cookie recovery

- 대상: CEO 계정이 채팅창 홈 버튼으로 `/` 이동 시 관리자 홈 접근이 간헐적으로 막히는 현상.
- 원인: 채팅 API는 `localStorage.aads_token`을 사용하지만 Next middleware는 `aads_token` 쿠키만 검사한다. 과거 로그인 세션이나 일부 복구 세션에서 localStorage에는 토큰이 있고 쿠키가 없으면 채팅은 정상 동작해도 `/` 접근은 인증 없음으로 처리될 수 있었다.
- 반영: `src/lib/auth.ts`에 `syncTokenCookieFromStorage()`를 추가하고 `getMe()`/`getToken()` 호출 시 쿠키를 복구한다. `src/app/chat/api.ts`도 채팅 API 토큰 조회 때 쿠키를 복구한다. 채팅 홈 버튼 2곳(`src/app/chat/ChatSidebar.tsx`, `src/components/chat/ChatLayout.tsx`)은 클릭 직전에 쿠키 동기화를 수행한다.
- 검증: `npx eslint src/lib/auth.ts src/app/chat/api.ts src/app/chat/ChatSidebar.tsx src/components/chat/ChatLayout.tsx` 통과. `npm run build` 통과. 운영 API 양 슬롯에서 CEO 테스트 토큰의 `/api/v1/auth/me`가 `is_internal_admin=true`를 반환했고, active dashboard green `http://127.0.0.1:3101/`는 CEO 쿠키로 `200 OK`를 반환했다.
- 주의: 전체 `npm run lint`는 기존 전역 ESLint 부채 265 errors/68 warnings로 실패한다. 이번 변경 파일 대상 lint는 통과했다.

## 2026-06-12 13:50 KST - Admin navigation speed patch reapplied after revert

- 배경: `c3037c8 fix(admin): speed up admin navigation`가 `9a4ad19 Revert "fix(admin): speed up admin navigation"`로 되돌아간 상태를 확인했다. 사용자별 세션 UI는 남아 있었지만, 관리자 메뉴 이동 지연 완화 패치가 빠져 있었다.
- 반영: `src/middleware.ts`에서 서버 측 `/auth/me` 관리자 판정 왕복을 제거하고 토큰 존재 확인만 수행하게 재적용했다. `src/lib/auth.ts`에는 `/auth/me` 30초 캐시를 다시 추가했다. 관리자 데이터 접근 통제는 백엔드 admin API 권한과 `ClientLayout` 클라이언트 가드가 유지한다.
- 검증: `npx eslint src/middleware.ts src/lib/auth.ts src/app/admin/users/page.tsx src/app/admin/sessions/page.tsx` 통과. `npx tsc --noEmit` 통과. 서버 관리자 세션 API 직접 호출 기준 `objgood@naver.com` tenant 세션 3건과 메시지 상세 5건 반환 확인.
- 주의: 신규 배포 전 기존 active release는 `9a4ad19afecf`였으며 Step 7 QA는 `UNKNOWN`이라 수동 API/라우트 검증으로 보완했다.

## 2026-06-12 18:39 KST - Codex usage bar lint-safe refresh

- 배경: 채팅 상단 Codex 사용량바가 `/ops/codex-usage`의 빈 `limits` 응답 시 사라지는 문제가 있었고, 서버 active 슬롯은 `ok=true` fallback 응답으로 복구된 상태를 확인했다.
- 반영: `src/components/chat/UsageBar.tsx`의 초기 fetch를 effect 본문 직접 호출에서 `window.setTimeout` 예약 호출로 바꿔 React hooks lint 오류를 제거했다. 표시 로직은 유지했다.
- 검증: `npx eslint src/components/chat/UsageBar.tsx` 통과. 서버 `https://aads.newtalk.kr/api/v1/ops/codex-usage`는 `200 OK`, `ok=true`, `limits[0]` 포함으로 확인했다.
- 주의: Codex relay가 `codex_rpc_timeout`이면 DB fallback이 표시되며, 현재 `oauth_usage_log`의 Codex 모델 기록은 0건이라 실시간 한도 수치가 아니라 안전 표시값이다.

## 2026-06-12 18:54 KST - Codex usage reset time on chat bar

- 배경: 채팅 상단 Codex 사용량바가 Claude처럼 남은 리셋 시간을 표시하지 않았다.
- 원인: `/api/v1/ops/codex-usage`는 `primary.resets_in_sec`, `secondary.resets_in_sec`를 내려주고 있었지만, `src/components/chat/UsageBar.tsx`가 Codex `MiniBar`에 `resetIn`을 전달하지 않았다. 또한 API 응답의 첫 항목이 `codex_bengalfox`일 수 있어 실제 Codex 항목 대신 0% 항목이 표시될 수 있었다.
- 반영: Codex limit 선택은 `limit_id="codex"`를 우선 사용하고, `resets_in_sec`를 `5h`, `1w` 막대 옆에 `4h30m`, `5d14h` 형식으로 표시하도록 수정했다.
- 검증: `npx eslint src/components/chat/UsageBar.tsx` 통과. 운영 API `http://127.0.0.1:8102/api/v1/ops/codex-usage` 기준 `codex` 항목의 5h/1w reset 초 값이 존재함을 확인했다.

## 2026-06-15 12:22 KST - Chat active streaming reconciliation

- 배경: 세션 `95c53d3f-2863-49f5-948e-53e4bab877e2`에서 재시도 후 화면에는 `응답 중단` 버블이 남고, 새로고침하면 같은 실행이 `생성 중` 버블로 바뀌는 표시 불일치가 있었다.
- 원인: 서버 `streaming-status`는 최신 실행을 `running`으로 반환하지만, 프론트의 로컬 interrupted/partial 버블이 polling merge 전에 우선 표시되어 새로고침 전후 상태가 달라졌다.
- 반영: `src/app/chat/page.tsx`에 active streaming reconciliation을 추가했다. `streaming-status.is_streaming=true`이면 같은 execution의 interrupted/partial/draft를 즉시 `streaming_placeholder`로 승격하고, 탭 복귀·세션 진입·5초 폴링·재시도/이어쓰기 스트림 시작/복구 실패 경로 모두 같은 보정 함수를 사용한다.
- 검증: `git diff --check` 통과. `npm run build` 통과. `npm run lint`는 기존 전역 ESLint 부채 264 errors/67 warnings로 실패했으며, 이번 변경 파일에는 신규 error가 확인되지 않았다. DB 직접 조회 기준 해당 세션은 `current_execution_id=e97e2aa4-b729-4595-a15d-e716b0767ef7`, `status=running`, 최신 assistant는 같은 execution의 `streaming_placeholder`였다.

## 2026-06-16 17:49 KST - Chat streaming duplicate and freeze guard

- 배경: 세션 `b0bdd28a-589a-4440-9fcf-8ff84560544c`에서 응답이 바로 끊겨 보이고, 스트리밍 중 추가지시/재시도 시 버블이 중복 생성되며 브라우저가 멈추는 현상이 보고됐다.
- 원인: 해당 실행은 `background_producer_incomplete_exit:missing_done_event`로 자동 재시도 중이었고, DB에는 긴 `streaming_placeholder`가 계속 갱신됐다. 프론트는 같은 내용의 placeholder를 반복 setState하면서 대형 Markdown을 재렌더링했고, 추가지시 로컬 버블과 DB 저장 `queued_interrupt`가 본문 형식 차이로 중복 병합될 수 있었다.
- 반영: `src/app/chat/page.tsx`에서 active streaming reconcile이 동일 content/execution 상태일 때 기존 배열을 그대로 반환하도록 해 불필요한 재렌더를 줄였다. 추가지시 로컬 버블은 `queued_interrupt` intent와 원문 content로 저장하고 동일 본문은 중복 추가하지 않도록 했다. 로컬/DB 추가지시 병합은 과거 `💬 **[추가 지시]**` prefix를 정규화해 같은 버블로 합쳐지게 했다. 사고 과정 라벨은 내부 추론 원문으로 오해되지 않도록 `진행 과정`으로 바꿨다.
- 검증: `git diff --check` 통과. `npm run build` 통과. `npm run lint`는 기존 전역 ESLint 부채 264 errors/67 warnings로 실패했으나 이번 변경 파일에는 신규 error가 확인되지 않았다. DB 직접 조회 기준 문제 세션 최신 실행 `0e1be3a3-5636-4469-9fe0-9ce535525e9c`는 17:48:40 KST `completed`로 닫혔고 assistant 최종 버블은 17,652자로 저장됐다.

## 2026-06-18 09:09 KST - Dashboard deploy QA active API alignment

- 배경: CEO가 blue-green 배포/헬스체크 기준과 대시보드 단독 배포 시 API 연쇄 재시작 방지 여부를 재검토하라고 지시했다.
- 확인: 대시보드 `deploy.sh`는 실제 빌드/standby 동기화 모두 `docker compose ... up -d --build --no-deps`를 사용한다. 다만 Step 7 Visual QA API 기본값이 `http://127.0.0.1:8100`으로 고정되어 API active 슬롯이 `8102`일 때 검증 기준이 어긋날 수 있었다.
- 반영: `deploy.sh` Step 7에서 `/etc/nginx/conf.d/aads-upstream.conf`의 `aads_api` upstream 중 non-backup active 포트를 파싱해 `QA_API_BASE` 기본값으로 사용하도록 수정했다. `AADS_API_BASE` 명시값은 계속 우선한다.
- 검증: `bash -n deploy.sh` 통과. 현재 upstream 기준 active API 포트 파싱 결과는 `8100`이다.

## 2026-06-18 09:12 KST - Chat model dropdown uses full registry

- 배경: CEO가 채팅 모델 추가를 등록된 모든 모델이 드롭다운에 반영되도록 지시했다.
- 확인: 운영 `llm_models` 레지스트리에는 478개 모델이 있고, 기존 채팅/토론 UI는 `/llm-models?active_only=true`만 호출해 실행 가능 모델만 표시했다.
- 반영: `src/app/chat/page.tsx`, `src/components/chat/ModelSelector.tsx`, `src/components/chat/DiscussionPanel.tsx`가 `/llm-models` 전체 레지스트리를 읽도록 변경했다. 실행 가능하지 않은 모델은 드롭다운에 `(비활성)`으로 표시하고 disabled 처리해 등록 현황은 보이되 실수 선택은 막는다.
- 검증: `npx eslint src/components/chat/ModelSelector.tsx src/components/chat/DiscussionPanel.tsx src/app/chat/page.tsx` 통과. 기존 `src/app/chat/page.tsx` 경고 22건은 남아 있으나 신규 error는 없다.
