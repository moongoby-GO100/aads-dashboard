# AADS Dashboard Handover

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
