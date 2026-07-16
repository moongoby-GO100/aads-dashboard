# 긴급 버그 수정 결과 — 2026-03-14

## 버그 1: AI 응답 버블 중복 누적 (최우선)

### 원인
- SSE `type === 'done'` 이벤트 수신 시 `full`이 빈 문자열이어도 빈 AI 메시지를 messages 배열에 추가
- 빈 content의 assistant 메시지가 매번 쌓여 "AI 응답 생성 중..." 같은 빈 버블이 누적

### 수정 (`page.tsx`)
- `done` 핸들러: `full.trim()` 체크 추가 → 빈 텍스트일 때 빈 AI 메시지 추가 방지
- 기존 `break` + `setStreaming(false)` + `setToolLogs([])` 확인 (이미 적용됨)
- `message_done` (legacy fallback)에도 동일하게 `setStreaming(false)` + `break` 확인

## 버그 2: 모바일 입력창 크기 개선

### 수정 (`ChatInput.tsx`)
- 기존 적용 확인: fontSize 16px (iOS zoom 방지), minHeight 56px, 버튼 44x44px, safe-area-inset-bottom
- 추가 수정:
  - 입력 영역 padding 8px → 10px
  - 모바일 placeholder 축약: "메시지 입력..." (화면 < 768px)
  - 힌트 텍스트 모바일에서 숨김 (`hidden md:block`)

---

## 검증 체크리스트

- [x] 구현 목표: (1) 빈 AI 버블 누적 방지, (2) 모바일 입력 UX 개선
- [x] 검증 방법: Docker 빌드 + 컨테이너 재시작 + health check
- [x] 완료 기준: 빌드 성공, 컨테이너 healthy, HTTP 응답 정상
- [x] 실패 기준: 빌드 실패 또는 컨테이너 unhealthy → 해당 없음
- [x] 서비스 재시작 확인: `docker ps` → `aads-dashboard Up 33 seconds (healthy)`
- [x] 에러 로그 0건: `docker logs --since 30s | grep -i error` → 출력 없음
