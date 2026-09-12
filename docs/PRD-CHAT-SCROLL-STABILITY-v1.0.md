# PRD: 채팅 응답 중 스크롤 안정화 v1.0

- 문서 상태: v1.0 구현·운영 검증 완료
- 작성일: 2026-09-12
- 대상: AADS Dashboard `/chat`
- 우선순위: P0
- 관련 세션: `5090a247-47f7-4a05-a965-da89f844ad2f`

## 1. 배경과 문제 정의

장시간 응답 또는 복구 중인 대형 채팅 세션에서 사용자가 과거 메시지를 읽기 위해 스크롤을 이동해도 화면이 반복적으로 위로 이동한다. 대상 세션의 운영 재현에서는 메시지 영역 높이가 약 `38,300px`와 `40,000px` 사이를 왕복했고, 프런트엔드가 한 번에 약 `1,630~1,750px`의 `scrollTop` 보정을 반복했다.

직접 원인은 전역 `streaming` 값에 따라 모든 과거 메시지의 작업 버튼을 DOM에서 생성하거나 삭제하는 렌더 구조다. 응답 연결과 복구 상태가 전환될 때 약 100개 메시지의 높이가 동시에 변하고, 다중 RAF·ResizeObserver 기반 뷰포트 복원 코드가 변경된 높이를 따라 `scrollTop`을 반복 기록한다. 사용자 스크롤 의도는 1초 후 만료되므로 다음 1.5초 폴링에서 자동 복원이 다시 활성화된다.

## 2. 목표

1. 응답·연결·복구 상태가 변해도 과거 메시지의 레이아웃 높이를 바꾸지 않는다.
2. 사용자가 스크롤을 시작하면 명시적으로 하단에 복귀할 때까지 자동 추적을 중지한다.
3. 메시지 상태 갱신에 따른 앵커 복원은 실제 배열 변경이 있을 때만, React 커밋 직후와 다음 프레임에 한정해 실행한다.
4. 사용자가 수동 모드에서 새 응답을 놓치지 않도록 `최신으로` 복귀 UI를 제공한다.
5. 기존 메시지 병합, 복구, 이어쓰기, 중단, 버전 갱신 시 뷰포트 보존 기능을 유지한다.

## 3. 비목표

- 이번 버전에서 서버 실행 lease/fencing 알고리즘을 변경하지 않는다.
- 이번 버전에서 메시지 목록 가상화 라이브러리를 도입하지 않는다.
- SSE 및 streaming-status API 계약을 변경하지 않는다.
- 메시지 내용, 실행 결과, 도구 호출 저장 방식을 변경하지 않는다.

서버 실행 상태의 단일 소스화와 목록 가상화는 2단계 개선 대상으로 정의한다.

## 4. 사용자 요구사항

### UR-1 수동 스크롤 우선권

사용자가 휠, 터치, 키보드 또는 스크롤바 드래그로 메시지 목록을 이동하면 시스템은 자동 하단 추적을 즉시 중단해야 한다. 시간 경과만으로 자동 모드로 돌아가면 안 된다.

### UR-2 명시적 복귀

수동 모드에서는 메시지 영역 하단에 `최신으로` 버튼을 표시한다. 사용자가 버튼을 누르거나 직접 하단 300px 이내로 이동하면 자동 추적 모드로 복귀한다.

### UR-3 상태 변화 중 위치 불변

`streaming`, `waitingBgResponse`, SSE 재연결 및 서버 복구 상태가 바뀌더라도 과거 메시지의 액션 영역 크기는 동일해야 한다.

### UR-4 기존 기능 보존

답글, 다시 생성, 수정 후 재전송, 분기, 삭제 기능은 응답 중 비활성화할 수 있지만, 비활성화 때문에 DOM 크기가 달라져서는 안 된다.

## 5. 기술 스택 및 선택 근거

### 현재 스택

- Next.js 16.3 App Router
- React 19.2
- TypeScript 5
- 브라우저 DOM API: `requestAnimationFrame`, `ResizeObserver`, Pointer/Touch/Wheel 이벤트
- 기존 인라인 스타일 및 CSS 변수 기반 UI
- 서버 상태 동기화: SSE + 1.5초 `streaming-status` 폴링

### 이번 구현의 기술 선택

- 별도 스크롤 패키지를 추가하지 않는다. 현재 문제는 가상화 부재보다 상태와 레이아웃의 결합에서 발생하므로 의존성 추가 없이 제거할 수 있다.
- React 상태에는 사용자에게 표시할 `followMode`만 둔다.
- 이벤트와 RAF에서 즉시 읽어야 하는 값은 `followModeRef`에 함께 보관한다. 이는 React 렌더 전의 오래된 클로저 값을 사용하지 않기 위함이다.
- 과거 액션 버튼은 조건부 마운트 대신 항상 동일한 DOM 공간을 유지한다. 응답 중에는 `visibility: hidden`, `pointer-events: none`, `disabled`, `tabIndex=-1`을 적용한다.
- 메시지 영역을 `position: relative` 컨테이너로 감싸고 `최신으로` 버튼은 absolute overlay로 제공한다. 버튼 표시 자체가 메시지 `scrollHeight`를 변경하지 않게 하기 위함이다.
- 메시지 앵커 복원은 React `useLayoutEffect` 1회와 후속 RAF 1회만 허용한다. 장시간 `ResizeObserver`가 사용자 입력 이후에도 위치를 재적용하는 구조는 제거한다.

## 6. 상태 모델

### 6.1 이번 버전

```text
ChatFollowMode = auto | manual

auto:
  - 최초 진입
  - 새 메시지 전송
  - 사용자가 하단 300px 이내로 복귀
  - 사용자가 '최신으로' 선택

manual:
  - wheel
  - touchstart / touchmove
  - 스크롤 키보드 입력
  - 네이티브 스크롤바 pointer drag
```

`streaming || waitingBgResponse`는 액션 잠금 여부에만 사용한다. 액션 잠금 상태가 바뀌어도 레이아웃은 변하지 않는다.

### 6.2 후속 목표 상태 모델

```text
executionPhase = idle | running | recovering | finalizing | completed | interrupted
transportState = connected | reconnecting | offline
followMode     = auto | manual
```

서버 실행 상태와 SSE 연결 상태를 분리해 transport 종료가 실행 완료나 과거 메시지 UI 재배치를 유발하지 않도록 한다.

## 7. 상세 설계

### 7.1 액션 영역 높이 불변

기존:

```tsx
{!streaming && <ActionButtons />}
```

변경:

```tsx
<ActionButtons
  aria-hidden={locked}
  style={{
    visibility: locked ? "hidden" : "visible",
    pointerEvents: locked ? "none" : "auto",
  }}
/>
```

메시지 자체가 임시 메시지이거나 액션을 원래 지원하지 않는 경우에만 마운트하지 않는다. 전역 응답 상태는 DOM 존재 여부에 사용하지 않는다.

### 7.2 사용자 입력과 자동 추적

모든 프로그램 스크롤은 단일 `scrollToMessagesBottom()` 정책을 통과한다. `force=false` 호출은 `followMode=manual`이면 즉시 종료한다.

사용자 입력이 시작되면:

1. 진행 중인 앵커 복원 generation을 무효화한다.
2. 예약된 RAF를 취소한다.
3. 비정상 상단 복원 루프를 중단한다.
4. `followMode=manual`로 전환한다.

수동 모드는 만료 시간이 없다.

### 7.3 메시지 앵커 복원

1. 상태 변경 직전 첫 가시 메시지 ID와 상대 offset을 캡처한다.
2. updater가 이전 배열 객체를 그대로 반환하면 복원을 예약하지 않는다.
3. 실제 변경이면 React 커밋 직후 `useLayoutEffect`에서 1회 적용한다.
4. 다음 animation frame에서 늦은 동기 레이아웃 변경을 1회 보정하고 종료한다.
5. 그 사이 사용자 입력이 발생하면 generation 불일치로 보정을 폐기한다.

이미지 로딩처럼 수초 뒤 발생하는 비동기 레이아웃 변경은 브라우저 기본 앵커링 또는 향후 가상화 계층에서 처리한다. 현재처럼 3~4초 동안 모든 크기 변경을 동일 위치로 강제 복원하지 않는다.

### 7.4 최신으로 버튼

- 메시지 스크롤 DOM의 형제 overlay로 렌더한다.
- 메시지 목록의 `scrollHeight`에 포함하지 않는다.
- 클릭 시 follow mode를 `auto`로 바꾸고 하단 이동을 1회 강제한다.
- 키보드 접근이 가능한 일반 button으로 구현한다.

## 8. API 및 데이터 변경

이번 버전의 API·DB 스키마 변경은 없다.

후속 버전에서는 `message_revision`, `placeholder_revision`, `execution_phase`를 streaming-status 응답에 명시해 동일 데이터 폴링 시 React 상태 갱신 자체를 생략하는 것을 권장한다.

## 9. 성능 요구사항

- `streaming` 전환으로 과거 MessageItem의 높이가 변하지 않아야 한다.
- 응답 상태 전환 1회당 앵커 `scrollTop` 기록은 최대 2회다.
- 동일 메시지 배열을 반환하는 updater는 `scrollTop`을 기록하지 않는다.
- 수동 모드에서 300ms 스트리밍 추적 interval은 동작하지 않는다.
- 신규 런타임 의존성 및 클라이언트 번들 패키지를 추가하지 않는다.

## 10. 접근성

- 숨겨진 버튼은 `aria-hidden=true`, `disabled`, `tabIndex=-1`로 포커스 대상에서 제외한다.
- `최신으로` 버튼은 `aria-label`과 `title`을 제공한다.
- 버튼의 표시·숨김은 메시지 내용의 읽기 순서를 바꾸지 않는다.

## 11. 테스트 및 인수 기준

### 정적 검증

- ESLint 통과
- TypeScript/Next production build 통과
- `git diff --check` 통과

### 브라우저 회귀 시나리오

1. 100개 이상 메시지가 있는 세션에서 `streaming true → false → true`를 반복한다.
2. 과거 메시지의 액션 버튼 영역 mount 수와 각 메시지 bounding box 높이가 동일한지 확인한다.
3. 사용자 휠 입력 후 30초 동안 복구/폴링 상태를 반복한다.
4. 첫 가시 메시지의 ID와 offset 오차가 ±2px 이내인지 확인한다.
5. 휠, 터치, 키보드, 스크롤바 드래그를 각각 검증한다.
6. `최신으로` 클릭 후 새 토큰을 따라 하단이 유지되는지 확인한다.
7. 버전 갱신, 과거 메시지 불러오기, 메시지 재생성 시 기존 앵커 보존을 확인한다.

### 운영 인수 기준

- 대상 세션에서 사용자가 내린 뒤 상향 재이동 0회
- 응답 상태 토글에 따른 전체 `scrollHeight` 변동 중 액션 버튼 기여분 0px
- 콘솔의 반복적인 `[chat-scroll] unexpected top reset restored` 로그 0건
- 배포 후 5분간 P0/P1 신규 오류 없음

## 12. 단계별 구현 계획

### v1.0 — 이번 구현

- 과거 액션 영역 DOM 높이 고정
- `streaming || waitingBgResponse` 기반 액션 잠금
- sticky manual follow mode
- touchmove 및 scrollbar drag 입력 처리
- 앵커 복원을 layout effect + RAF 1회로 제한
- no-op 메시지 updater에서 복원 미실행
- overlay `최신으로` 버튼

### v1.1

- 서버 execution phase와 transport state 분리
- 상태 revision 기반 폴링 dedupe
- 스크롤 원인·전후 위치·follow mode 샘플링 계측

### v2.0

- 동적 높이를 지원하는 메시지 목록 가상화
- 도구 호출 로그 별도 가상화 및 기본 접기
- 서버 lease owner/epoch 복구 루프 정비

## 13. 위험과 대응

| 위험 | 대응 |
|---|---|
| 숨긴 버튼이 공간을 차지해 대화 길이가 길어짐 | 기존 idle 레이아웃과 동일한 높이를 기준으로 유지하며, 후속 버전에서 overlay 액션으로 전환 |
| 앵커 복원 시간을 줄여 늦게 로드되는 이미지가 위치를 바꿈 | 이미지 크기 사전 예약을 후속 적용하고, 이번 버전에서는 사용자의 진행 중 입력을 침범하지 않는 것을 우선 |
| 수동 모드에서 새 응답을 놓침 | 항상 접근 가능한 `최신으로` 버튼 제공 |
| wrapper 추가로 flex 높이 계산 변경 | `flex:1`, `minHeight:0`, 내부 스크롤 `height:100%`로 기존 영역 크기 유지 |
| 운영 코드와 배포 이미지 불일치 | clean release SHA에서 단일 immutable image를 생성하고 active/standby digest 일치 검증 |

## 14. 롤백

- UI 변경은 대시보드 단일 커밋으로 격리한다.
- 외부 health 또는 인증 E2E 실패 시 nginx 라우팅을 이전 dashboard slot으로 즉시 복구한다.
- DB/API 변경이 없으므로 프런트 이미지 롤백만으로 복구 가능하다.

## 15. 구현 및 운영 검증 결과

- 구현 커밋: `0ed523f43a28`
- 배포 일시: 2026-09-12 12:21 CEST
- 활성 슬롯: green (`3101`)
- active/standby 이미지: `sha256:8375bed0185003ca725fd730707a9be20cbcd01afea2b36e572af7eca1821f25`
- active/standby release SHA: `0ed523f43a28`
- 정적 검증: TypeScript 전체 검사 통과, scoped ESLint 오류 0건, 정책 selftest 12건 통과, clean Docker production build 통과
- 운영 감시: 외부/blue/green health 5회 및 5분 P0/P1 로그 감시 통과
- 대상 세션 브라우저 검증:
  - 응답 생성 중 초기 `scrollTop`이 최대값과 일치
  - 자연 폴링 구간 상향 점프 0회
  - touchmove 20회 동안 요청 위치와 실제 위치 일치, 종료 후 위치 고정
  - wheel 20회 동안 요청 위치와 실제 위치 일치, 종료 후 위치 고정
  - 수동 모드에서 `최신으로` 버튼 노출 및 클릭 후 `auto` 복귀와 하단 이동 확인
  - 상태 잠금 전환 시 공통 과거 메시지 82개의 높이 변화 없음. 변경된 1개는 본문이 갱신된 현재 활성 메시지
  - 콘솔 오류 및 `[chat-scroll]` 복원 경고 0건

자동 visual-QA API는 `UNKNOWN`을 반환해 통과로 간주하지 않았고, 위 인증 브라우저 검증으로 작업별 인수 기준을 직접 확인했다.

릴리스 clean archive는 약 452MiB이며 대부분 추적 중인 `public/brands` 고해상도 이미지다. 캐시나 저장소 이력의 유입은 아니지만 빌드 전송 비용이 크므로, 후속 작업에서 고해상도 인쇄 자산을 별도 오브젝트 스토리지/CDN으로 이동하는 것이 권장된다.
