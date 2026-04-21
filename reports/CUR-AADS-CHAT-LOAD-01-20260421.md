## 요약
- **증상**: AADS 대시보드의 채팅 화면에서 워크스페이스/세션/메시지가 로딩되지 않거나 빈 화면/무한 대기로 보임.
- **원인(핵심)**: **인증 토큰 저장소 불일치**로 인해, 화면 접근은 되지만 API 호출은 401로 실패.
  - `middleware.ts`는 **쿠키(`aads_token`) 존재 여부**로만 페이지 접근을 허용
  - 클라이언트 API 호출은 **localStorage(`aads_token`)만** 읽어 `Authorization: Bearer ...`를 붙여 호출
  - 결과적으로 **쿠키는 있는데 localStorage가 비어있으면** 채팅 페이지는 들어가지만, `/api/v1/chat/workspaces` 등이 모두 **401** → 로딩 실패

## 재현/근거
- **API 상태 확인**
  - `GET https://aads.newtalk.kr/api/v1/health` → **200**
  - `GET https://aads.newtalk.kr/api/v1/chat/workspaces` (Authorization 없이) → **401**
- **코드 근거**
  - `src/middleware.ts`: `request.cookies.get("aads_token")`만 체크 후 통과
  - `src/app/chat/api.ts`, `src/services/chatApi.ts`, `src/lib/api.ts`: 기존에는 `localStorage.getItem("aads_token")`만 사용

## 조치(적용 내용)
클라이언트가 토큰을 읽을 때 **localStorage가 비어 있으면 쿠키(`aads_token`)로 폴백**하도록 수정.

- 변경 파일 (4)
  - `src/app/chat/api.ts`
  - `src/services/chatApi.ts`
  - `src/lib/api.ts`
  - `src/lib/auth.ts`
- 변경 요지
  - `getCookie(name)` 유틸 추가
  - `localStorage` 토큰이 없으면 `document.cookie`에서 동일 키(`aads_token`)를 찾아 사용

## 기대 효과
- **쿠키만 남아있는 환경(브라우저/확장프로그램/스토리지 초기화 등)**에서도 채팅 API가 정상 인증되어 **워크스페이스/세션 로딩이 복구**됨.

## 검증
- **정적 검증**: 타입/린트 에러 없음(대시보드 변경 파일 기준).
- **HTTP 검증(참고)**: 무토큰 호출은 기존대로 401이 정상이며, 로그인 후 쿠키 기반 폴백으로 인증 헤더가 붙어야 함.

## 적용/배포 상태
- **적용 상태**: ✅ 소스 수정 완료 (`aads-dashboard`).
- **배포 상태**: ❌ 미배포 (대시보드 배포 절차에 따라 빌드/배포 필요)

## security_scan / path_check
- **security_scan.sh**: ❌ 저장소/서버 내 스크립트 미발견으로 실행 불가
- **path_check.sh**: ❌ 저장소/서버 내 스크립트 미발견으로 실행 불가
- 권장: `aads-dashboard`에 프로젝트 표준 스크립트로 추가 후, CI/배포 전 필수 실행 단계로 편입

## 후속 체크사항
- [ ] 브라우저에서 `localStorage`를 비운 상태(개발자도구 Application → Local Storage 삭제)로도 **채팅 화면 로딩 정상**인지 확인
- [ ] 토큰 만료 시(서버가 401 반환)에는 **자동 로그아웃 + /login 리다이렉트** UX 추가 여부 검토

