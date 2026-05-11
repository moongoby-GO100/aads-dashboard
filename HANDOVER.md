# HANDOVER

## 2026-05-11

### AADS-DESIGN-MOD-002
- `/design-modifications` 페이지를 추가해 디자인 수정 요청의 목록, 상세 카드, 작성 폼을 한 화면에서 처리하도록 구성했다.
- 요청 카테고리는 `layout`, `spacing`, `color_token`, `typography`, `component_state`, `content_tone` 6종으로 고정했고, 입력 내용 기반 classifier 추천을 즉시 표시한다.
- 요청 데이터는 `current_state`, `target_state`, `locked_elements`, `affected_routes`, `affected_components`, `acceptance_checks`, `notes`, `requester`를 공통 스키마로 정규화한다.
- 대시보드 홈과 좌측 사이드바에 진입점을 추가했다.

### API/Fallback
- 프론트는 `/design-modification-requests`, `/design-modifications/requests`, `/ops/design-modification-requests`, `/design/requests` 순서로 list/detail/create API를 탐색한다.
- 백엔드 API가 없으면 브라우저 `localStorage`의 `aads-design-modification-requests` 키로 로컬 draft를 저장하고 다시 읽는다.
- list/detail/create 응답은 모두 typed normalizer를 거쳐 화면에서 같은 구조로 소비한다.

### 참고
- 현재 대시보드 저장소에는 별도 테스트 러너 패턴이 없어 테스트 파일은 추가하지 않았다.
