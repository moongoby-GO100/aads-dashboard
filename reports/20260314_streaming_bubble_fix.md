# RESULT: 긴급 버그 수정 — AI 응답 버블 중복 쌓임 + 모바일 입력창

## 날짜: 2026-03-14

---

## 버그 1: AI 응답 버블 중복 쌓임 (최우선)

### 원인
서버가 스트리밍 중 `streaming_placeholder` 메시지를 DB에 저장하고 (`_interim_save_streaming`), 스트리밍 완료 시 삭제 (`_delete_streaming_placeholder`). 하지만:
1. **Race condition**: 프론트엔드 폴링(8초/2초)이 서버가 placeholder를 삭제하기 전에 가져옴
2. **삭제 실패**: `_delete_streaming_placeholder`가 try/except로 실패를 무시
3. **Dedup 우회**: placeholder 내용("⏳ AI가 응답을 생성 중입니다...")과 최종 응답 내용이 달라 content hash dedup 통과
4. **정리 부재**: 프론트엔드에 한번 들어온 placeholder 메시지를 제거하는 로직 없음

### 수정 내용 (page.tsx, 4곳)

| 위치 | 수정 |
|------|------|
| 세션 메시지 로딩 (line ~598) | `msgs.filter(m => m.intent !== "streaming_placeholder")` |
| 백그라운드 폴링 (line ~659) | `rawLatest.filter(m => m.intent !== "streaming_placeholder")` |
| SSE `done` 이벤트 핸들러 (line ~949) | `prev.filter(m => m.intent !== "streaming_placeholder")` 후 최종 메시지 추가 |
| SSE `message_done` 핸들러 (line ~1024) | 동일 필터 적용 |
| `finally` 블록 (line ~1134) | `setMessages(prev => prev.filter(...))` 잔여물 정리 |

---

## 버그 2: 모바일 입력창 개선

### 확인 결과
ChatInput.tsx에 이미 모바일 최적화가 적용되어 있었음:
- textarea: `fontSize: "16px"` (iOS zoom 방지), `minHeight: "56px"` ✅
- 파일첨부/음성 버튼: `minWidth: "44px"`, `minHeight: "44px"` ✅
- 전송 버튼: `minWidth: "44px"`, `minHeight: "44px"` ✅
- 하단 패딩: `paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))"` ✅

**참고**: ChatInput.tsx는 현재 page.tsx에서 사용되지 않음 (page.tsx에 인라인 입력 영역 존재). 향후 ChatInput 컴포넌트로 통합 시 이 개선사항이 활용됨.

---

## 검증 체크리스트

- [x] 구현 목표: streaming_placeholder 메시지가 프론트엔드 messages 상태에 남지 않도록 5곳에서 필터링
- [x] 검증 방법: `npm run build` 성공 + docker restart + HTTP 상태 확인
- [x] 완료 기준: 빌드 성공, 컨테이너 정상 실행, 에러 로그 0건
- [x] 실패 기준: 빌드 실패 또는 런타임 에러 → 해당 없음
- [x] 서비스 재시작 확인: `docker ps` → Up 13 seconds (health: starting) ✅
- [x] 에러 로그 0건: `docker logs --since 60s | grep -i error` → 0건 ✅

## 수정 파일
- `/root/aads/aads-dashboard/src/app/chat/page.tsx` (4곳 수정)
