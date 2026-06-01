# AADS Dashboard Handover

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
