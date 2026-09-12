# 검증·실행·배포·유지보수 계획

버전 1.0 · 2026-09-12 · 제품 구현 전 실행 계획. [PRD](PRD.md)의 FR/NFR, [설계](TECHNICAL-DESIGN.md)의 INV/ADR, [코드 감사](CURRENT-CODE-AUDIT.md)의 C-ID를 연결한다.

## 1. 인수 환경과 fixture

| 축 | 필수 조합 |
|---|---|
| 대화 규모 | 0/1/40/150/500/5,000 message; 100KB 이상 답변·수천 tool event |
| 대화 내용 | 한글 IME·emoji·CRLF·code fence·미완성 Markdown·표·긴 URL·이미지·PDF·HTML·동일 본문 독립 질문 |
| 상태 | idle/queued/running/tool/recovering/finalizing/approval/stopping/completed/interrupted |
| 입력 방식 | wheel·trackpad momentum·touch·keyboard·native scrollbar drag·스크린리더 |
| 브라우저 | 고정된 Playwright Chromium/Firefox/WebKit; 실제 iOS Safari/Android Chrome 별도 |
| viewport | 390×844 mobile, 1440×900 desktop, 회전·safe area·200% zoom·좁은 reflow |
| 네트워크 | 정상/150ms/2s 지연, 순서 역전, 중복 frame, offline/online, 401/403/409/429/500, half-open stream |
| 사용자 경계 | tenant A/B, user A/B, viewer/member/admin, session A/B, branch A/B, 두 탭 |
| 서버 경계 | 단일 slot, blue/green cutover, lease 교체, Redis trim/missing, DB 실패, worker crash |

fixture는 익명 합성 데이터를 기본으로 한다. 운영 세션의 응답 내용·token·첨부·PII를 test fixture로 그대로 복사하지 않는다. 필요한 운영 재현은 ID/상태/높이 변화 등 최소 metadata를 사용한다. 실제 모델 호출은 deterministic fake provider와 분리해 비용·quota 변동이 기능 인수 기준을 흔들지 않게 한다.

## 2. 테스트 계층

1. **순수 unit/property**: reducer·version/completeness·visibility·cursor parser·scope·command idempotency. fast-check 실패 seed와 최소 sequence 저장.
2. **component**: Vitest/React Testing Library, StrictMode 포함. 기본 interaction·focus·ARIA 검증. DOM simulator의 높이 계산으로 실제 scroll correctness를 판정하지 않는다.
3. **browser integration**: Playwright+MSW/로컬 fixture server. 실제 layout, UTF-8 frame chunk, resize, font/image 지연, gesture와 RAF race 검사.
4. **API contract**: Pydantic/OpenAPI/generated TS 계약, legacy/v2 cross-version, projection·tombstone·auth·error payload.
5. **DB/Redis integration**: test container/격리 schema에서 실제 transaction·row lock·claim·cursor·outbox·lease 경합 검사. mock SQL 문자열만으로 통과시키지 않음.
6. **fault/load**: fake model/side effect provider로 queue·network·DB·slot 장애 주입. production을 시험 대상으로 crash시키지 않음.
7. **실기기/보조기기**: 한글 키보드·VoiceOver/NVDA·녹음 권한·스크롤 모멘텀·브라우저 복귀. 자동화 결과와 별도로 서명된 결과 기록.

## 3. FR→검증 추적표

| Test ID | 요구사항 | 핵심 시나리오·실패 주입 | 통과 판정 |
|---|---|---|---|
| T01 | FR01 | 읽기 중30초 token/poll/status toggle; wheel/touch/key/drag 각각, 늦은 force RAF | active gesture write0, manual autonomous follow0, 시간 만료 전환 없음 |
| T02 | FR02 | unread 도착·latest 버튼·키보드 focus·직접 하단300px 복귀 | overlay로 높이 변화0, 명시 복귀 후 추적 정상 |
| T03 | FR03 | prepend/full hydrate/앞 이미지 load/font delay/anchor 삭제 | 유효 anchor 오차±2px; 삭제 시 명세 이웃, 무한 보정 없음 |
| T04 | FR04 | A→B→A, 초기 fetch 지연, resize 중 gesture, version reload | 이전 session/gesture intent 폐기, 현재 위치·초안 복원 |
| T05 | FR05 | connected→offline, transport EOF, finalizing→completed | 연결 단절만으로 완료/중단을 표시하지 않음 |
| T06 | FR06 | UTF-8 모든 byte 경계·CRLF·multi-data·comment·빈줄·잘못된 JSON, 4진입 경로 | 공통 reducer 결과 동등; invalid frame은 cursor 진전 없음 |
| T07 | FR07 | high watermark가 applied보다 앞섬, snapshot/replay 경쟁, Redis trim | token skip0, coverage 불일치 재조회, applied cursor만 재연결에 사용 |
| T08 | FR08 | partial→final ID 확정, minimal→full→minimal, 높은 version의 짧은 편집 | render_key 유지, preview 축소0, 정상 편집 반영 |
| T09 | FR09 | status 응답2초, tick1.5초, A/B 응답 역전, abort 뒤 resolved | in-flight status≤1, stale response가 활성 state 변경0 |
| T10 | FR10 | 동일 created_at100건·중간 삭제·앞뒤 cursor·invalid cursor | 모든 ID 정확히 도달, gap/중복0, invalid scope400/권한 오류 |
| T11 | FR11 | revision 그대로5분, edited_at 누락 writer fixture, delete/visibility change | unchanged fetch0, 모든 가시 mutation에서 revision/outbox 증가 |
| T12 | FR12 | 5,000건 history search jump·reply jump·prepend·focus row eviction | target 접근, selection/focus 보존, bounded DOM |
| T13 | FR13 | 초당100 delta×30초, sidebar/composer/history profiler | 활성 slice만 갱신, 입력 latency budget, 전체 Markdown 재파싱 없음 |
| T14 | FR14 | code fence/표/list/reference link 중간 종료·완료·copy | 기준 renderer와 final 의미·링크·copy 동등, streaming layout 안정 |
| T15 | FR15 | tool 시작/result 역순·중복·상세401/500·대형 log | tool ID 단위 일치, 본문 유지, retry/detail 진입 가능 |
| T16 | FR16 | offline submit·ACK 유실·reload·storage 차단/용량·tenant 전환 | 복구 draft와 receipt 연결, 새 사용자 draft 오염0 |
| T17 | FR17 | 실제 한글 조합 Enter, slash/mention, Shift+Enter, 더블tap | 의도한 전송 횟수와 본문 정확, 메뉴/caret 정상 |
| T18 | FR18 | upload 중 session 변경·취소·MIME mismatch·mic 거부·늦은 변환·unmount | 다른 draft 반영0, track/reader/Blob 잔존0, 항목별 복구 |
| T19 | FR19 | 같은 command 동시 POST·서버 commit 실패·commit 후 ACK 유실·다른 payload 같은 key | durable receipt만 성공, duplicate effect0, conflict409 |
| T20 | FR20 | DB receipt→claim→apply 각 경계에서 worker crash, 두 worker claim | claim expiry 복구, applied 조기표시0, command 단위 멱등 |
| T21 | FR21 | stop와done 경합·lease 상실·old owner callback·fence refund 중복 | terminal 불변, 실제 결과 표시, retry 환급정책/비용 정확 |
| T22 | FR22 | 같은 문장 다른 command, regenerate/continue/branch·짧은 edit·delete409 | 독립 메시지 보존, generation/branch 관계·원본 유지 |
| T23 | FR23 | 모델/계정/역할 변경 중 실행·quota fallback·resume override | requested/actual provenance와 비용 일치, 의도된 실행만 변경 |
| T24 | FR24 | panel hidden→open, 직접 문서 링크, A artifact 응답이B보다 늦음 | eager full fetch 억제, 직접 링크 표시, cross-session overwrite0 |
| T25 | FR25 | iframe/새창/export HTML에 script·opener·network·form·postMessage probe | 앱 credential/origin 접근 차단, 허용 preview 기능 유지 |
| T26 | FR26 | SVG/이벤트 속성/DOM clobber/javascript URL/data URI/외부 이미지 fixture | 정책 밖 DOM·실행·navigation 차단, 정상 표/코드/source 유지 |
| T27 | FR27 | `/chat#id`에서401→login, redirect injection, logout/tenant 변경 | hash/draft 복구, 외부 redirect 차단, private cache 정리 |
| T28 | FR28 | 타 tenant session/message/execution/artifact/file ID·viewer write·잘못된 FK 관계 | 서버 object 권한 차단; UI capability 동등 |
| T29 | FR29 | 단일 row render throw·artifact parse failure·chunk load failure | page/composer 유지, 해당 경계 retry와 report ID |
| T30 | FR30 | quota/network/provider/tool/DB 실패·중복 오류 | 원인 category 구분, 민감 raw error 비노출, action 명확 |
| T31 | FR31 | keyboard only·screen reader·virtual row 재진입·dialog/menu | focus 순서/복귀·상태 안내, token flood announce0 |
| T32 | FR32 | soft keyboard·rotation·zoom·320px·긴 table/code·reduced motion | 입력/중지 버튼 접근, 의도치 않은 세로 이동·초점 손실 없음 |
| T33 | FR33 | 두 탭 same execution, tab leader crash·sleep/resume·channel 불가 | completion 알림 dedupe, 데이터 정합성은 leader 없이 유지 |
| T34 | FR34 | cache 밖 search·대형 export·cancel·expired download URL | 전체 scope 결과, pagination/cancel, 권한 재검증 |
| T35 | FR35 | read-only DB role/transaction에서 모든 chat GET, stale 실행 fixture | DML 없음, repair worker가 별도 동등 처리 |
| T36 | FR36 | schema additive/unknown/critical invalid·v1 FE/v2 BE·v2 FE/v1 BE | 호환 fallback, generated type diff 검출, 무음 손실 없음 |
| T37 | FR37 | 토큰/원문 secret sentinel 주입, telemetry schema/label 검사 | secret0, bounded cardinality, report ID correlation |
| T38 | FR38 | 의도적 type error·lint purity·failing regression·missing pytest plugin | 필수 CI/release gate 실패, clean machine 재현 |
| T39 | FR39 | 후보 health fail·routed fail·standby mismatch·active stream drain·old/new protocol | 계약 위반시 전환 차단/rollback, 동일 digest, 종료 증거 |
| T40 | FR40 | step side effect 후 ACK 전 crash·재시작·approval 대기·context checkpoint | 안전한 재개, 모호한 effect는 reconcile/검토, 중복 작업 없음 |
| T41 | FR41 | 문서ID/link drift·임시 hotfix 만료·변경영향 누락 | docs checker/PR template가 누락 표시, owner와 제거 조건 존재 |
| T42 | FR42 | Node24·stable compiler·React19.3·Turbopack 조합별 clean build | 호환/performance/security gate; 실험 옵션은 운영 default로 승격되지 않음 |
| T43 | FR43 | 동일 저장 원본으로 UI40/120·virtual on/off context 생성 비교 | raw context 입력/메모리 호출·원본 tool/usage 정책 동등 |
| T44 | FR44 | 대형 image/code/log, object URL 반복·패널 lazy chunks·cache evict | payload/heap/long task 예산, 권한 있는 원본 접근 유지 |

보안 fixture는 앱의 실제 production origin·실 사용자 인증으로 실행하지 않는다. production 검증이 필요하면 기존 승인된 QA tenant·synthetic session을 사용하고 write 범위와 정리 방식을 명시한다.

## 4. WBS 및 의존성

책임자는 역할 단위 제안이다. 실제 담당자는 착수 때 배정한다. 아래 공수는 **1인 엔지니어링 작업일 추정**이며, 운영 승인 대기·모델 비용·외부 인프라 조달은 제외한다. 여러 역할의 병렬 투입에 따른 달력 일정은 팀 배정 후 계산한다. 본 문서 작성에서 agent 병렬 작업을 실행했다는 뜻이 아니다.

| WP | 범위·산출물 | 선행 | 책임 역할 | 추정 | 완료 gate |
|---|---|---|---|---|---|
| WP00 | baseline fixture·C-ID 재확인·browser/device matrix·latency/heap·API writer inventory·버전/lock 조사 | 없음 | FE+BE+QA | 1~2일 | 측정 조건·source SHA·실패 sequence·unknown 목록 고정 |
| WP01 | Node24/타입 gate/안정 compiler 준비, sanitizer·HTML 새창 containment, C16/C17 사고 경로 regression 및 receipt fail-close 선행 수정 | WP00 | FE+BE+보안 | 2~4일 | T25/26/38/42, DB receipt 실패시 성공 표시 금지; runtime/보안은 별도 작은 PR |
| WP02 | 단일 viewport controller·updater 순수화·gesture·anchor·legacy scroll 경로 이관 | WP00/WP01 gate | FE | 2~3일 | T01~04, INV01/02, 새 writer 없음 |
| WP03 | message/execution runtime·event parser 통합·applied cursor·snapshot adapter·capability | WP02 | FE+BE | 3~5일 | T05~09/21/36, legacy 동일 fixture 동등 |
| WP04 | GET read-only·repair worker 이관·typed API·복합cursor·revision/outbox·projection/poll 정책 | WP00/WP03 | BE+FE | 4~6일 | T10/11/19/35/36/43, v1 호환·migration dry run |
| WP05 | durable command/interrupt·claim/applied·retry 회계·late owner guard 전수 정리 | WP03/WP04 | BE | 3~5일 | T19~21/28, fault test 및 pending command 대조 |
| WP06 | components 분리 마무리·가상화·active bubble/Markdown·tool log·image 크기 | WP02~04 | FE+QA | 3~5일 | T03/12~15/31/44, DOM·latency·heap budget |
| WP07 | draft/IME/upload/voice·artifact lazy·검색/링크·편집/분기·모델 provenance | WP03/WP05/WP06 | FE+BE | 3~4일 | T16~18/22~24/27/29/30/33/34 |
| WP08 | 인증 cookie/BFF·CSRF·tenant cache·권한·모바일/접근성 전체 인수 | WP01/WP04/WP07 | 보안+FE+BE+QA | 3~5일 | T25~28/31/32/37, PC agent·login redirect 호환 |
| WP09 | 운영 dashboard·CI·release/rollback 자동화·runbook·문서 drift gate·24h/7d 관측 준비 | WP01~08 | SRE+QA | 2~3일 | T37~39/41, mandatory5분 및 canary 인수 |
| WP10 | 한 장기 작업의 step checkpoint·context handover PoC, side effect reconcile | WP05/WP09 | BE+업무 도구 owner | 5~10일 | T40/43; PoC 결과로 확대 또는 중단 결정 |

WP00~WP09 합계 **26~42 작업일**, 후속 WP10 포함 **31~52 작업일**의 초기 추정이다. 이전 보고의 FE 중심 8~12일은 이번 보안·API·command·운영 전체 범위와 같지 않다. WP00 종료 때 실제 의존성·실패 수·담당자에 맞춰 재산정한다. 추정치를 완료 약속으로 사용하지 않는다.

### 즉시 위험 우선순위

- C24/C25: 새 창 HTML 격리·sanitizer를 초기 독립 PR로 처리한다. 전체 가상화 완료까지 기다리지 않는다.
- C16: GET 우회 writer를 식별해 lease 검증/동등 repair 테스트를 먼저 준비하고 WP04에서 순수 조회 이관을 완료한다.
- C17: durable save 실패의 성공 ACK부터 막고, WP05에서 claim/apply lifecycle을 완성한다.
- C01/C29: build 타입 검사를 필수로 하고 Node 지원 종료 문제를 초기 해결한다.

## 5. PR 분할과 변경 영향

권장 PR은 각 역할/위험에 맞춰 작게 만든다. 하나의 PR에서 framework upgrade·SSE contract·virtual list·인증 전환을 동시에 수행하지 않는다.

PR 설명 필수 필드: 문제 trigger, C/FR/INV ID, 변경 전후 동작, affected imports/endpoints, DB/API 호환, 테스트 결과·fixture SHA, telemetry 변화, flag/rollback, 남은 제한, 문서 갱신.

새 component는 consumer 확인 후 연결한다. 이관 전후의 동일 fixture를 비교하고 이전 helper를 계속 살아 있는 fallback으로 무기한 두지 않는다. compatibility adapter의 제거 조건은 `기존 client 비율`, `호환 기간`, `owner`, `target release`로 기록한다. commit hook 실패를 우회하지 않는다.

## 6. Feature flag 및 배포 호환

| flag 예시 | 의존성 | fallback |
|---|---|---|
| chat.viewport_v2 | baseline 및 DOM controller tests | 현재 v1 사용자 우선 정책 |
| chat.runtime_v2 | v2 reducer+legacy event adapter | legacy runtime; 진행 실행 중 hot swap 금지 |
| chat.protocol_v2 | server capability·schema 지원 | legacy API adapter |
| chat.virtual_list | viewport_v2+runtime_v2 | 비가상 목록 adapter |
| chat.streaming_markdown | renderer 동등성·sanitize | 기존 안전 renderer |
| chat.cookie_auth_v2 | 서버 cookie/CSRF+PC agent callback 호환 | 명시적 auth migration rollback; credential 노출 경로 복원은 별도 보안 판단 |

flag 값은 세션 진입 시 snapshot으로 고정한다. 진행 중 adapter/identity를 바꾸지 않는다. invalid flag 조합은 안전한 조합으로 정규화하고 경고한다. v2 전체를0%로 내려도 backend additive schema와 v1 read가 계속 동작해야 한다.

### 릴리스 절차

1. 미커밋 사용자 변경을 확인하고 깨끗한 committed release worktree를 만든다. 의도한 변경만 commit/push한다.
2. typecheck/lint·필수 tests·generated contract diff·보안 fixture를 통과시킨다.
3. release SHA당 image 한 번만 build, candidate를 `--no-build`로 시작한다.
4. candidate direct health·기능 read-only smoke·protocol compatibility를 확인한다.
5. shared nginx lock은 routing/state marker/즉시 routed health 동안만 사용한다. build/drain/test 중 lock 유지 금지.
6. cutover·외부 health, 기존 active streams drain을 확인한다. 이전 active slot을 먼저 재시작하지 않는다.
7. 이미 만든 동일 digest로 standby를 동기화하고 양 slot SHA/digest를 검증한다.
8. required QA·최소5분 P0/P1 감시가 성공해야 release certified로 기록한다.
9. 30분 active synthetic scenario·24시간 canary·7일 regression 추이를 기록한다. traffic이 적으면 기간만으로 통과하지 않고 sample 부족을 표시한다.

기존 전역 [릴리스 규칙](../../../AGENTS.md)이 우선한다. 앱 변경을 위해 full compose stack을 배포하지 않는다. doc-only 변경은 앱 build/cutover를 유발하지 않는다.

### rollback trigger

즉시 중단: cross-tenant 노출, raw HTML의 앱 권한 실행, 질문/최종답변 소실, terminal 데이터 변조, 승인 없는 side effect 중복, candidate/routed health fail.

canary 중단 목표: 수동 scroll 강탈 재현1건, 동일 fixture 성능 p95 20% 이상 악화가 연속 관측, 오류율 기준선 대비 유의 증가, duplicate replay·cursor gap 증가. 낮은 표본은 원시 건수와 재현 결과로 판단한다. 출처 없는 임의 운영 오류율을 현재 baseline처럼 사용하지 않는다.

UI는 flag 또는 이전 안전 image로 복귀한다. 보안상 취약한 preview 경로로 되돌리지 않고 static preview를 사용한다. DB는 additive schema를 유지하고 command/outbox pending을 보존한다. data corruption은 별도 검증된 복구 절차를 거치며 무조건 재전송으로 덮지 않는다.

## 7. 장기 유지보수 및 재발 방지

### 자동 규칙

- viewport adapter 밖 `scrollTop=`, `scrollTo/scrollIntoView`의 메시지 목록 접근을 lint/architecture test로 검출한다. 사용자가 요청한 다른 패널 scroll은 별도 scope 예외로 문서화한다.
- runtime reducer 밖 message entity mutation·streaming bool 직접 setter 추가를 차단한다.
- query module의 import graph에서 CommandRepository·DML 경로 접근을 금지하고 read-only transaction test를 수행한다.
- protocol event 추가는 schema/legacy adapter/reducer/fixture/docs를 같은 PR에서 수정한다.
- 새 chat module에 ts-nocheck/no-explicit-any 확대·purity/exhaustive-deps 무기한 disable 금지. 불가피한 예외는 이유·owner·만료.
- flag 조합·cross-version contract·source URL/local link·FR/T 누락을 CI로 검출한다.
- dependency bot 제안은 test+license+bundle 검토 후 merge. exact lockfile과 base image digest를 보존한다.
- 위험한 임시 patch script는 호출/cron 사용을 확인하고 active 경로에서 퇴역시킨다. user worktree에 일괄 재적용하지 않는다.

### 주기별 관리

| 주기 | 점검 |
|---|---|
| 매 PR | 요구/원인/test 연결, API·state 소유권·scope·cleanup·accessibility·payload budget |
| 매 release | source/lock/image SHA, migration 호환, canary·rollback, docs 현재화, 제거 예정 flag 목록 |
| 매주 | 새 오류·scroll/replay/interrupt trend, flaky test, 과거 workaround 만료, API full fetch 증가 |
| 매월 | Node/framework/library 지원 상태·보안 advisory·license, browser 분포·API SLO·dependency 업데이트 |
| 분기 | 접근성 실기기·DB restore 훈련·side effect reconcile 훈련·장기 draft/telemetry 보관·owner 부재 점검 |

### 장애 보고서 필수 내용

incident ID, 최초/마지막 발생 시각 UTC, release/flag 조합, 영향 범위·sample 수, 기대/실제 상태, anonymized event sequence, 실제 원인과 추정 구분, 관련 C/FR/INV/T, 임시 완화·영구 수정, 재현 test seed, rollout/rollback 증거, owner·후속 기한.

단일 사건에 timer·prefix 예외를 추가하고 보고서를 닫지 않는다. 같은 실패 클래스의 기존 workaround도 함께 inventory로 확인한다. `스크롤 점프`처럼 증상 이름만 남기지 않고 writer race/layout delta/cursor gap/state rollback 등 확인된 원인을 기록한다.

## 8. 착수 시 확정할 사항

문서 계획은 아래 정보 없이도 작성했으며 각각 담당 WP에서 확인한다. 미확정 항목을 현재 구현 사실로 쓰지 않는다.

| 미확정 | 확정 담당/시점 | 현재 기본안 |
|---|---|---|
| 실제 mobile/browser 비중·최소 지원 | QA/WP00 | 대표 최신 안정 엔진+실 iOS/Android |
| API latency·INP·heap 운영 기준선 | SRE/WP00 | PRD 수치들은 목표로만 관리 |
| DB major·index·table 중복·migration 시간 | BE/WP00/WP04 | additive migration, 기존 테이블 재사용 우선 |
| preview 전용 origin·인증 cookie/PC agent 연결 | 보안/WP01/WP08 | static sandbox 우선, same-origin raw HTML 금지 |
| draft 장기 보관·telemetry retention | 제품/보안 WP07/WP09 | 탭 session draft·원문 수집 off |
| 상용 Message List 구매 | 제품/조달 | 구매 없는 MIT core 기본안 |
| React19.3/Streamdown/Rust Compiler 승격 | FE/WP06/WP09 | 호환 spike·fixture 동등성 통과 전 기본안 유지 |
| durable step 첫 업무 유형 | BE/업무 owner WP10 | reversible read→문서작성→검증 한 흐름 후보 |

## 작성 검증 기록

- 2026-09-12 현재 source snapshot 재확인, 실제 import 경로와 중복 이름을 구분했다.
- scroll policy 기존12개 사례를 Node20+설치 TypeScript의 in-memory transpile로 실행해12개 통과했다.
- `npx tsc --noEmit --incremental false --pretty false`: **exit0, 통과**. 이번 검사에서 output 파일을 생성하지 않았다.
- 직전 검토의 채팅 scoped ESLint는 오류0/경고19였다. 본 문서 작성에서 이 결과를 새 full-lint 결과로 바꾸어 표기하지 않는다.
- backend 테스트는 이 문서 작성에서 실행하지 않았다. 이전 호스트의 dependency 부족·운영 image pytest 부재를 clean test image 정비 사유로 기록했다.
- `node docs/chat-modernization-20260912/verify-docs.mjs`: 문서 6개, 로컬 링크 73개, 식별자 219개, FR→테스트 매핑 44개 검사 통과. 향후 변경에서도 같은 검증기를 재실행한다.
- 작성 중 추가된 Server `683cfb0d`는 별도 금융 기능 변경이다. 기준 snapshot 대비 변경 파일을 확인하고 채팅 핵심 파일 4개 지문이 동일함을 재확인했다.
- 제품 구현·DB 변경·운영 대화 생성·앱 배포는 이번 문서 작업에 포함하지 않았다.
