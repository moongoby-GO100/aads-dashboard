# AADS 채팅 구조 개선 및 기능 고도화 PRD

버전 1.0 · 작성일 2026-09-12 · 상태: 설계 완료, 제품 구현 착수 전 계획.

대상: AADS `/chat`, 연결된 메시지·실행·파일·산출물·인증·운영 경계. 근거: [현재 코드 감사 C01~C32](CURRENT-CODE-AUDIT.md), [공식 출처 W01~W32 및 기존 보고서](SOURCES.md). 상세 구현은 [기술 설계](TECHNICAL-DESIGN.md), 인수·일정은 [검증 및 실행 계획](VERIFICATION-AND-ROLLOUT.md)을 따른다.

## 1. 해결할 문제와 제품 목표

현재 채팅은 생성형 AI 답변뿐 아니라 코드·도구 실행, 추가 지시, 승인, 문서 확인, 모델/계정 상태, 작업 진행을 제공하는 업무 화면이다. 스크롤 직접 장애는 v1에서 안정화됐으나, 상태를 여러 경로가 갱신하고 조회 API까지 복구 동작을 수행하는 구조가 유지보수와 회귀를 어렵게 한다.

사용자가 읽는 위치·작성 중인 입력·이미 생성된 답변·실제 진행 상태를 신뢰할 수 있어야 한다. 긴 대화에서도 입력과 문서 확인이 매끄럽고, 연결이 끊기거나 배포돼도 작업의 의미가 바뀌지 않아야 한다. 개선 결과는 코드 분리량만으로 판정하지 않고 사용자 동작·정합성·성능·복구·운영 증거로 판정한다.

### 목표

1. 스크롤·질문 누락·중복 버블·잘못된 완료·추가 지시 유실을 예방하는 명시적 불변식 확립.
2. 상태·모듈·API 계약을 단일화해 변경 영향과 오류 원인을 추적 가능하게 함.
3. 입력·긴 메시지·도구 로그·산출물을 독립적으로 렌더하고 필요한 데이터만 조회.
4. 현재 기능을 보존하면서 draft 복구, 새 응답 알림, 재연결 상태, 오류 복구 안내 개선.
5. 지원 중인 기술·고정 버전·자동화된 검증·단계 배포로 유지보수 비용 감소.

### 범위 경계

기본 채팅 UX, FE/BE 데이터 계약, 순수 조회, durable command, 보안 경계, 테스트·계측·릴리스는 본 계획에 포함한다. 모델의 지능·가격·제공자 선택 자체, 기존 LLM context 축소, 업무 도구의 전체 재작성, DB/Redis major 업그레이드, 전체 인프라 재배치는 별도 사업 변경으로 취급한다. 장기 실행 checkpoint는 후속 WP10에서 하나의 작업 흐름으로 검증 후 확대한다.

문서 작성 완료와 제품 구현·배포 완료는 별도 상태다. 본 문서는 기능이 이미 구현됐다는 보고가 아니다.

## 2. 사용자와 핵심 시나리오

| 사용자/상황 | 기대 결과 |
|---|---|
| 긴 답변 생성 중 이전 근거를 읽는 사용자 | 화면이 자동으로 이동하지 않고 새 답변 존재만 알림 |
| 생성 중 추가 조건을 입력하는 사용자 | 접수와 실제 반영을 구분하고, 접수된 지시를 재연결 후에도 추적 |
| 모바일에서 한국어 입력·음성·사진을 사용하는 사용자 | IME 오발송 없음, 키보드가 답변/입력창을 가리지 않음, 권한 실패 시 draft 유지 |
| 세션을 자주 바꾸는 사용자 | 각 세션의 draft·읽던 위치 복구, 다른 세션 결과 섞임 없음 |
| 연결/로그인이 만료된 사용자 | 입력과 deep link 유지, 복구/재시도 동작이 명확하고 중복 전송 없음 |
| 도구·문서·코드 결과를 검토하는 사용자 | 채팅을 유지하며 산출물 확인, 실행 가능 HTML은 격리, 원본 다운로드 가능 |
| 운영자·개발자 | report ID로 브라우저→API→execution을 연결하고 실패 sequence를 재현 |
| viewer/member/admin | 서버 권한과 화면 capability 일치, 다른 조직 cache/문서 접근 불가 |

### 대표 사용자 흐름

1. 전송: draft 작성 → 업로드 완료 확인 → 전송 ID 생성 → 서버 영속 접수 → 사용자 bubble 확정 → 실행 진행 → 최종 저장 확인 → 완료 알림.
2. 읽기: 새 응답 추적 → 사용자 스크롤 → 읽기 모드 유지 → 새 응답 수 표시 → `최신으로` 또는 직접 하단 복귀 → 추적 재개.
3. 복구: 연결 끊김 → 기존 내용 유지·연결 표시 → 적용 cursor 이후 replay 또는 일관된 snapshot → 같은 실행/bubble에 재연결 → 최종 상태 확인.
4. 추가 지시: 지시 접수 → queued/처리 중 표시 → 안전한 실행 경계에서 반영 → applied ACK → 최종 결과와 연결. 접수 실패를 성공처럼 표시하지 않음.
5. 중지: 요청 접수 → stopping 표시 → 안전하게 중지되거나 먼저 완료된 실제 결과 표시. 네트워크 reader 중단을 서버 작업 중지로 간주하지 않음.

## 3. 기존 기능 보존 목록

구현 PR마다 해당 기능의 이전/이후 fixture를 연결한다. 보조/미사용 UI의 존재만으로 활성 기능이라고 판정하지 않는다(C22).

| 기능군 | 보존할 동작 | 개선 사항 |
|---|---|---|
| workspace/session | 생성·이름·삭제·pin·tags·최근 세션·hash deep link | scope cache, 빠른 전환의 늦은 응답 차단 |
| 기본 전송 | Enter/Shift+Enter, 빈 입력·중복 submit 차단 | ACK 전 draft 복구, 영속 idempotency |
| 한국어/다국어 | IME composition, 줄바꿈·emoji·혼합 문자 | 실제 모바일 키보드 회귀 검사 |
| 슬래시·멘션 | 명령 검색·키보드 선택·내부/고객 멘션 구분 | combobox 접근성, 선택 후 caret 보존 |
| 음성·화면 공유 | 녹음·변환·사용자 선택 캡처 | 세션 이동/취소 cleanup, 권한 거부 안내 |
| 첨부 | drag/drop·paste·다중 파일·이미지/PDF/video/text | 업로드 진행·실패 재시도·취소·중복 참조 방지 |
| 모델/역할 | 모델·역할·응답 모드·선택 계정 | requested/actual/fallback 표시, 진행 중 변경의 적용 시점 명시 |
| quota/비용 | UsageBar, 사용량·계정 전환·세션 비용 | 버블 토큰 갱신과 독립 구독, credential 비노출 |
| 답변 표시 | Markdown·표·code·인용·sources·품질 표시 | 미완성 Markdown 안정화, 안전한 HTML 허용 정책 |
| 도구/사고 요약 | tool_use/result·상태·thinking summary | 가상화·접기·동일 tool ID 연결, 완료 후 상세 보존 |
| 답글·수정 | reply target·수정 재전송·복사 | 실행 중 capability와 편집 충돌 표시 |
| 재생성·이어쓰기 | 원본 연결·선택 모델 continue | 별도 generation ID, 오래된 응답과 구분 |
| 분기 | branch 생성·목록·부모 맥락 | branch별 데이터/scroll scope, 원본 보존 |
| 삭제·bookmark | 지정 메시지 처리·사용자 메시지 연관 결과 | 서버 원자적 처리·tombstone·복구/보존 정책 |
| 중지·추가 지시 | stop·queued interrupt·수동 resume | durable command receipt/claim/applied ACK |
| 문서 링크 | 내부 링크 우측 패널, 외부 링크 새 창 | 401/404/바이너리 fallback, 가상 목록 target jump |
| 산출물 | 보고서·코드·HTML·차트·이미지·파일·편집·export | lazy load·revision·안전 preview origin |
| 검색·export | 세션/메시지 검색·내보내기·templates | 렌더 cap 밖 결과 이동, 취소·대용량 진행 표시 |
| 업무 연결 | TODO·diff 승인·지시 초안·토론·research | 버튼/권한/명령 상태를 별도 capability로 관리 |
| 알림 | 완료 toast·push·음성·version banner | 사용자 동의·cross-tab 중복 방지·접근성 |
| 화면 설정 | mobile/tablet/desktop·theme·글자 크기 | reflow·zoom·safe area·focus·reduced motion |
| 장애 표시 | error boundary·에러 보고·retry | 부분 오류 격리·report ID·민감정보 제외 |

## 4. 기능 요구사항

`필수`는 해당 단계 인수에 필요하다. 후속 요구사항도 추적 대상이며 일정에 포함한다. 각 FR의 테스트 매핑은 검증 문서 T01~T44에 정의한다.

| ID | 우선순위 | 요구사항 및 관찰 가능한 인수 조건 | 근거 |
|---|---|---|---|
| FR01 | P0 | 읽기 모드는 시간 경과·poll·reconnect·finalize만으로 자동 해제되지 않는다. active gesture 중 프로그램 scroll 0회 | C03~06 |
| FR02 | P0 | 최신 버튼은 layout 밖 overlay; 새 메시지 존재/개수 표시. 클릭/직접 하단 복귀로 추적 재개, focus 보존 | C03/C05 |
| FR03 | P0 | prepend·동일 bubble hydrate·이미지 높이 변경 후 첫 가시 message ID+offset 보존. 삭제된 anchor는 가까운 생존 이웃으로 이동 | C04/C06/C12 |
| FR04 | P0 | 최초 진입·세션 복귀·버전 갱신의 viewport 요청은 최신 session/gesture generation에서만 적용 | C03/C27 |
| FR05 | P0 | SSE 연결 상태와 실행 상태를 별도 표시. disconnect가 completed나 interrupted를 즉시 만들지 않음 | C07/C19 |
| FR06 | P0 | direct/replay/resume/regenerate가 공통 event 처리기를 사용. chunk 분할·중복·한글 byte 경계에도 같은 결과 | C10 |
| FR07 | P0 | 적용 성공한 event ID만 resume cursor에 저장. 광고 high-watermark·snapshot coverage 별도 관리 | C09 |
| FR08 | P0 | 같은 실행의 active→final 전환에서 bubble identity 유지. preview가 full을 덮지 않고 정상 최신 편집은 짧아져도 반영 | C11/C13 |
| FR09 | P0 | status tick은 동시 최대 1개. 취소·세션 epoch·revision 검사 후 데이터 반영. 늦은 응답이 최신 상태를 되돌리지 않음 | C08/C26 |
| FR10 | P1 | 초기 최근 40건 render projection, 이전/이후 cursor 조회. 타임스탬프 같은 메시지 포함 전부 도달 가능 | C13/C15 |
| FR11 | P1 | revision 동일 구간 messages 재조회 0회. 변경 시 delta/변경 ID 상세를 조회, 누락/만료 시 제한적 snapshot 복구 | C14 |
| FR12 | P1 | 가상화해도 읽던 구간·검색 결과·답글 target·키보드 focus를 보존. 이전 대화가 render cap 때문에 접근 불가해지지 않음 | C12 |
| FR13 | P1 | 사용 중 세션의 활성 응답만 token 구독. sidebar·composer·과거 row는 토큰 때문에 전체 재파싱하지 않음 | C02/C05 |
| FR14 | P1 | Markdown fence·표·링크 미완성 상태에서 내용 유지. final 출력·copy·source link는 기준 renderer와 동등 | C25 |
| FR15 | P1 | 긴 tool log는 요약·펼침·page/virtual list 제공, 상세 fetch 실패가 답변을 지우지 않음 | C13/C28 |
| FR16 | P1 | draft를 tenant/user/session/branch별 보존. 로그인·배포 reload·전송 오류 후 내용 복구. 영속 ACK 전 draft 유실 없음 | C22/C23/C27 |
| FR17 | P1 | IME 확정 Enter는 전송하지 않음. slash/mention 선택 우선권, Shift+Enter, 중복 tap 일관 | C22 |
| FR18 | P1 | 업로드 항목별 진행/취소/오류/재시도 제공. 음성 늦은 결과는 원래 draft에만 반영, track·Blob URL 정리 | C22 |
| FR19 | P0 | 전송/추가 지시/stop/resume의 command ID를 재시도에 재사용. 서버 commit 실패는 성공 ACK가 아님 | C17/C21 |
| FR20 | P0 | 추가 지시는 queued/claimed/applied/failed 상태 구분. crash/restart 후 재처리하되 같은 command 부작용 중복 방지 | C17 |
| FR21 | P0 | stop 요청과 실행 종료 구분; terminal execution은 늦은 callback으로 다시 변하지 않음. lease를 잃은 writer는 무효 | C16/C18 |
| FR22 | P1 | 편집·재생성·이어쓰기·분기를 명시 generation/관계로 보존. 내용 유사도만으로 독립된 질문/답변 삭제 금지 | C11/C28 |
| FR23 | P1 | 모델·계정·역할 변경은 현재 실행 또는 다음 실행 적용 여부를 명확히 안내. 실제 모델/비용 provenance 보존 | C28 |
| FR24 | P1 | 산출물 패널 닫힘 상태에서는 목록/상세 eager 요청 억제. 문서 직접 클릭은 해당 문서를 즉시 로드. 세션 간 늦은 결과 격리 | C26/R09 |
| FR25 | P0 | 생성 HTML의 inline preview·새 창·export 경로에 동일 격리 정책. 앱 origin에서 raw document.write 실행 금지 | C24 |
| FR26 | P0 | Markdown URL·HTML 속성·SVG·DOM ID 정책을 schema로 정의. 위험 payload를 렌더해도 앱 권한의 script 실행·credential 접근 없음 | C25 |
| FR27 | P1 | 인증 만료 후 path/search/hash 및 draft 복구. tenant 변경/로그아웃 시 private cache·draft·알림 상태 정리 | C23/C31 |
| FR28 | P1 | viewer/member/admin capability는 서버 권한과 일치. session/message/execution/artifact/file의 cross-tenant 요청 차단 | C21/C23 |
| FR29 | P1 | error boundary는 개별 row/panel에도 적용. 실패 row 재시도로 전체 세션·입력 state 소실 없음 | C28 |
| FR30 | P1 | 완료/복구/오류를 간단히 표시하고 report ID 제공. 연결 오류와 quota·provider·실행 중단을 구분 | C07/C31 |
| FR31 | P1 | 키보드/스크린리더로 목록·입력·메뉴·dialog 조작. 토큰마다 live announce 금지, 완료/오류만 적절히 안내 | C22/C28/W26/W27 |
| FR32 | P1 | 모바일 visual viewport·safe area·회전·zoom·긴 code/table·reduced motion 대응. 새 메시지로 focus를 빼앗지 않음 | C06/C22 |
| FR33 | P1 | 여러 탭의 completed ACK/알림을 dedupe. tab leader 최적화가 실패해도 각 탭에서 정합성 유지 | C31 |
| FR34 | P1 | 검색·export는 전체 권한 범위 데이터를 대상으로 하며 현재 렌더 rows에 제한되지 않음. 취소와 오류 복구 제공 | C12/C28 |
| FR35 | P0 | 모든 조회 API는 상태·본문·terminal을 변경하지 않음. 필요한 repair는 별도 fenced writer가 동일 기능을 담당 | C16 |
| FR36 | P1 | API schema·event schema·generated client가 버전 관리되며 unknown additive event에도 기존 화면 유지 | C10/C21 |
| FR37 | P0 | 전역 오류·성능·scroll 원인·protocol 오류가 release/report ID로 연결. 본문/토큰/첨부 원문은 수집하지 않음 | C29/C31 |
| FR38 | P0 | 새 변경마다 unit·state sequence·API contract·browser 회귀 실행. 필수 실패는 merge/release 차단 | C29/C30 |
| FR39 | P1 | clean image·호환 계약·feature flag·drain·rollback·5분 감시 및 장기 운영 gate가 재현 가능 | C32/R11 |
| FR40 | P2 | 장기 도구 작업을 단계별 checkpoint로 재개. 이미 완료한 외부 side effect를 안전성 확인 없이 다시 실행하지 않음 | C18/C20/W31 |
| FR41 | P1 | 변경된 요구사항은 설계·test ID·runbook·source version까지 연결. 임시 hotfix에 owner/만료/제거 조건 부여 | C02/C32 |
| FR42 | P1 | 지원 종료 runtime·취약 의존성을 정기 식별. 안정판·실험판·상용 기능 구분과 호환/rollback 증거 관리 | C01/W02/W07/W09/W13 |
| FR43 | P1 | UI 경량화 이후 context/memory/RAG 입력과 저장 원본은 정책상 동등. 기존 feature별 원본 content·tool·비용 보존 | C20/R03/R04 |
| FR44 | P1 | 큰 이미지·코드·도구 결과·download는 크기 예산과 지연 로딩으로 UI를 보호. 전체 원본은 권한 있는 상세/export 경로에서 접근 | C06/C13/C32 |

## 5. 비기능 요구사항과 측정 정의

아래는 **제품 목표치**다. 현재 충족한다는 측정 결과가 아니다. WP00 기준선에서 동일 fixture/device/network 조건을 고정한 뒤 검증한다. 실제 사용자 telemetry와 합성 테스트 수치는 섞지 않는다.

| ID | 목표 | 측정·범위 |
|---|---|---|
| NFR01 | active gesture 중 programmatic viewport write 0, manual 자동 follow 0 | wheel/touch/key/drag 30초. 사용자 입력 후 단순 시간 경과로 해제하지 않음 |
| NFR02 | 읽기 anchor offset 오차 ±2 CSS px | 실제 메시지 위쪽 변경·prepend 후 gesture가 끝난 안정 frame. 사용자 이동·anchor 삭제·폰트 크기 직접 변경은 별도 기대값 |
| NFR03 | 표시 권한 있는 질문/최종답변 누락·독립 메시지 오합치기 0 | fixture ID 집합과 표시 projection·서버 원본 비교 |
| NFR04 | 복구 후 최종 content·tool event·상태 일치 100% | duplicate/out-of-order/trim/restart 시나리오. 동일 event 재적용 멱등 |
| NFR05 | idle 5분 messages 요청 0 | 실제 revision 변경·사용자 명령·오류 복구가 없는 구간; status heartbeat는 별도 집계 |
| NFR06 | 초기 전송 payload 기준선 대비 50% 이상 감소 | 동일 40개 visible fixture의 표현 완전성 유지. 큰 단일 본문은 별도 성능 suite |
| NFR07 | 입력 echo·submit local bubble 반영 p95 ≤100ms, 목표 ≤50ms | provider 응답 시작과 분리, 고정 desktop+모바일 CPU 조건 |
| NFR08 | 첫 사용 가능 recent timeline p95 ≤1.5s, 느린 모바일 ≤2.5s | 이미 로그인, API 150ms delay fixture; cold load와 warm session 전환 분리 |
| NFR09 | stream receive→paint p95 ≤100ms | foreground fixture. 백그라운드 탭 throttle 제외·복귀 시간 별도 측정 |
| NFR10 | INP p75 ≤200ms 목표, 50ms 이상 long task 합계 기준선 대비 50% 감소 | 운영 표본 충분한 경우 INP; 로컬 UI는 합성 input latency로 별도 기록 |
| NFR11 | 500/5,000 메시지에서 visible+overscan 중심의 bounded DOM | 기준 viewport 390×844/1440×900에서 row ≤60 목표. focus/readable fallback 예외를 명시하며 데이터 삭제로 달성하지 않음 |
| NFR12 | 50회 세션 전환 후 잔존 reader/timer/mic 0, heap의 지속 증가 없음 | warm-up 후 heap plateau 추세 비교. GC 변동을 절대 0 bytes로 요구하지 않음 |
| NFR13 | 변경 없는 상태 확인 p95 ≤300ms, UI API p95 ≤500ms 목표 | controlled 20 active/100 idle session 부하. DB/provider 비용은 분리 |
| NFR14 | terminal writer에 lease+epoch 조건, stale writer 반영 0 | DB 동시성 fixture 및 SQL/role 검사 |
| NFR15 | scope/HTML/CSRF 보안 필수 케이스 통과, credential telemetry 0 | 기존 exploit 여부를 단정하지 않고 안전한 fixture origin에서 검증 |
| NFR16 | WCAG 2.2 AA 목표 및 대표 보조기기 인수 | 자동 검사+VoiceOver/NVDA+실기기. 44px 모바일 버튼은 프로젝트 UX 기준 |
| NFR17 | 새 chat module type error 0, purity/exhaustive-deps 오류 0 | TypeScript 필수 gate; 기존 전체 repo warning은 baseline 감소, 신규 회피 금지 |
| NFR18 | 이미지 rollback p95 ≤5분 목표, 후보 전환 직후 health 실패 즉시 rollback | DB expand-only·dual read 호환이 검증된 릴리스에 한함 |

## 6. 데이터·권한·사용자 보호 요구

1. 클라이언트 page size/preview/virtualization은 UI 전용이다. DB 원본·embedding·메모리·모델 입력 범위를 줄이지 않는다.
2. user question, interrupted meaningful partial, final answer, artifact의 의미를 `intent` 문자열 heuristics만으로 삭제하지 않는다. 숨김은 명시된 유형·권한·사용자 filter로 수행한다.
3. 사용자 명령의 durable receipt 이전에는 접수 완료를 알리지 않는다. `applied`는 다운로드/메모리 dequeue가 아니라 실행 checkpoint에 반영됐다는 뜻이다.
4. 개인정보 포함 draft의 기본 저장은 현재 탭 session scope. 장기 보관은 선택 기능이며 기기 분실·로그아웃 정리를 안내한다. 첨부 binary/token은 localStorage에 넣지 않는다.
5. 앱 credential과 생성 HTML 실행 origin을 분리한다. HttpOnly migration 때 기존 bearer와 새 cookie 중 어떤 인증을 사용하는지 모호하게 혼합하지 않는다.
6. 읽기·부작용 명령·승인·관리자 복구의 권한을 분리한다. UI 비활성화만으로 보안을 구현하지 않는다.
7. 원문 로그 수집은 기본 off. 오류 첨부는 구조화된 ID/상태/길이/시간·선별된 사용자 동의 자료만 허용한다.
8. 보관/삭제 기간은 운영 정책으로 확정하고 migration/backup/파일 export까지 일관되게 적용한다. 이 PRD가 법적 보관 기간을 임의 결정하지 않는다.

## 7. 기술 활용의 제품 판단

현재 Next 16.3.4를 토대로 Node 24 LTS, 안정 React Compiler, React의 effect/store API, TanStack Query, MIT Virtuoso, OpenAPI 생성, Playwright·Vitest·property test를 적용한다. 상세 버전/대안/도입 조건은 설계 ADR01~ADR12에 있다.

React 19.3은 2026-09-09 공식 출시가 확인됐다([W02](SOURCES.md)). 신규 Trusted Types 지원 등은 호환 검증 계획에 반영한다. 출시에 맞춰 라이브 채팅 전체를 즉시 바꾸는 일정으로 간주하지 않는다. Next 16.3의 Rust Compiler와 OpenTelemetry browser 자동 계측은 공식 문서상 실험 영역을 별도로 표시한다([W07/W16](SOURCES.md)). 상용 Virtuoso Message List의 기능·라이선스를 MIT core와 혼동하지 않는다.

## 8. 단계별 제품 인수

| 단계 | 사용자 가치 | 필수 통과 조건 |
|---|---|---|
| A: WP00~WP04 | 입력·위치·진행 상태 신뢰 확보 | 기준선·HTML 격리·단일 viewport·공통 stream·순수 조회 및 durable receipt 선행 계약 |
| B: WP05~WP07 | 큰 세션·추가 지시·문서 사용 안정화 | revision/cursor·interrupt lifecycle·가상화·draft/첨부·전체 보존 기능 regression |
| C: WP08~WP09 | 인증·운영·업그레이드 지속 가능성 | tenancy/auth·CI·browser 접근성·release/rollback·문서 추적 |
| D: WP10 | 장기 작업 재개 | 한 작업 유형 checkpoint PoC 및 side-effect 중복 방지 증거; 전체 확대는 결과로 결정 |

각 단계의 미완료 요구사항은 다음 단계로 조용히 이동하지 않는다. 잔여 ID·이유·영향·책임 역할·차기 release를 기록한다. 무결성/권한/credential 관련 gate는 feature flag로 감추고 완료로 보고할 수 없다.

## 9. 성공 판단과 운영 유지

출시 직후 5분은 기존 mandatory gate이며 장기 안정성의 증거 전체가 아니다. 30분 active scenario, 24시간 오류/성능 변화, 7일 사용자 코호트 추이를 추가 확인한다. 관측 sample 수·환경·release를 함께 남긴다.

재발 시 한 건의 bug ID에 재현 sequence, 관련 C/FR/T/ADR, 원인, 수정, 회귀 test, rollout 결과를 연결한다. 기존 scroll 복원 timer나 content prefix 예외를 추가할 때도 이 절차를 따른다. PRD는 코드 변경 후 현재형 설명으로 갱신하되, 기존 release의 근거는 별도 snapshot으로 보존한다.
