# 출처·근거 등록부

문서 버전: 1.0 · 확인일: 2026-09-12 · 범위: 채팅 구조 개선 설계 및 PRD.

공식 문서의 사실과 AADS에 대한 설계 판단을 구분한다. 아래 링크는 실제 열람하거나 공식 검색 결과로 확인한 페이지다. API 문서는 수시로 바뀌므로 구현 PR에서 선택한 패키지의 정확한 버전과 해당 문서·변경 이력을 다시 고정한다. `latest`를 운영 설치 명령으로 사용하지 않는다. 아래 기술의 채택은 이 설계의 제안이며, 현재 설치되어 있다는 뜻이 아니다.

## 외부 공식 자료

| ID | 공식 출처 | 확인한 사실 | 설계 적용·주의 |
|---|---|---|---|
| W01 | [React 19.2 발표, 2025-10-01](https://react.dev/blog/2025/10/01/react-19-2) | Activity, useEffectEvent, 성능 분석 기능 소개 | 현재 React 19.2.3에서 활용 가능한 기능부터 적용 |
| W02 | [React 19.3 발표, 2026-09-09](https://react.dev/blog/2026/09/09/react-19-3) | ViewTransition·Fragment refs 안정화, Trusted Types 지원 | 출시 직후 버전. Next·UI 패키지 호환 검증 후 별도 업그레이드; 토큰마다 화면 전환 애니메이션 금지 |
| W03 | [React useState](https://react.dev/reference/react/useState) | updater는 순수해야 하며 Strict Mode에서 개발 중 재호출 가능 | 현재 updater 내부 RAF/ref 부작용 제거. Strict Mode 재호출이 운영 장애를 이미 일으켰다고 단정하지 않음 |
| W04 | [React useEffectEvent](https://react.dev/reference/react/useEffectEvent) | effect에서 최신 committed 값을 읽는 이벤트 분리, 사용 위치 제한 | stale closure 방지에 한정. 의존성 검사 우회나 일반 클릭 handler 대체 금지 |
| W05 | [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore) | 외부 저장소 구독 및 snapshot 계약 | 활성 응답만 구독; immutable snapshot/reference 안정성 필요. React 렌더링 자체를 우회하는 기술은 아님 |
| W06 | [React Compiler 1.0 발표, 2025-10-07](https://react.dev/blog/2025/10/07/react-compiler-1) | 안정 Compiler 제공, 점진 적용 가능 | 현재 beta 의존성을 검증된 안정판으로 교체하는 후보 |
| W07 | [Next.js 16.3 발표, 2026-08-03](https://nextjs.org/blog/next-16-3) | Turbopack·내비게이션 개선, Rust Compiler는 experimental로 소개 | 현재 Next 16.3.4 유지하며 Turbopack 검증. Rust 경로는 실험 단계만 허용; 발표의 속도 수치를 AADS 예상 효과로 복사하지 않음 |
| W08 | [Next.js reactCompiler 설정](https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler) | 공식 Compiler 설정·점진 적용 옵션 | compiler 설정과 설치 플러그인 버전 일치, build 비교 |
| W09 | [Node.js 공식 release 상태](https://nodejs.org/en/about/previous-releases) | 확인일 기준 Node 20 EOL, Node 24 LTS, Node 26 Current | Node 24 LTS를 운영 목표로 선정. 실제 patch와 Docker digest는 구현 때 고정 |
| W10 | [TanStack Query 취소](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation) | queryFn에 AbortSignal 제공; fetch에 전달해야 취소 반영 | 세션 전환의 늦은 응답 격리. 라이브러리 도입만으로 모든 요청이 자동 중단되는 것은 아님 |
| W11 | [TanStack Query Infinite Queries](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries) | 페이지·커서 기반 무한 조회와 보관 페이지 제한 | canonical message 저장소와 page-id cache 역할 분리 |
| W12 | [Virtuoso 공식 제품·가격 구분](https://virtuoso.dev/pricing/) | react-virtuoso는 MIT, Message List는 별도 상용 제품 | 기본안은 MIT react-virtuoso. 상용 기능을 무료 패키지 기능으로 기재하지 않음 |
| W13 | [Virtuoso Message List Licensing](https://virtuoso.dev/message-list/licensing/) | @virtuoso.dev/message-list 운영 사용에 상용 라이선스 필요 | 비용·조달 결정을 거친 선택안만 가능. 본 계획은 구매를 전제하지 않음 |
| W14 | [WHATWG HTML: Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html) | event/data/id/retry, 빈 줄 경계, 여러 data 줄, 재연결 ID 규칙 | POST·인증 header를 유지하는 fetch 스트림용 공통 parser 계약 |
| W15 | [FastAPI: Generating SDKs](https://fastapi.tiangolo.com/advanced/generate-clients/) | OpenAPI 기반 클라이언트 생성 | Pydantic/OpenAPI 단일 계약에서 TS client 생성. SSE envelope는 별도 schema에도 포함 |
| W16 | [OpenTelemetry JavaScript 상태](https://opentelemetry.io/docs/languages/js/) | traces/metrics stable, logs development, browser instrumentation experimental | 서버 trace와 브라우저 명시적 User Timing/RUM을 우선. 브라우저 자동 계측은 opt-in 검증 |
| W17 | [Playwright Trace viewer](https://playwright.dev/docs/trace-viewer) | 브라우저 동작·DOM·네트워크 trace 분석 | 실패 시 trace 첨부, 실제 사용자 정보 마스킹 |
| W18 | [Vitest Getting Started](https://vitest.dev/guide/) | TypeScript 기반 테스트 실행 지원 | Node 24 기준 고정된 단위·component test 실행기 |
| W19 | [fast-check Introduction](https://fast-check.dev/docs/introduction/) | property-based testing | 이벤트 중복·순서·동시성 불변식을 생성 테스트, 실패 seed 저장 |
| W20 | [MSW Introduction](https://mswjs.io/docs/) | 네트워크 계층 API mocking | UI·API 오류 fixture. 세부 SSE chunk 테스트는 자체 ReadableStream fixture와 병용 |
| W21 | [Zod 공식 소개](https://zod.dev/) | Zod 4와 TypeScript 우선 schema validation | 외부 event runtime 검사 후보. Pydantic 계약과 수기 이중 정의가 어긋나지 않도록 생성·계약 검사 |
| W22 | [react-markdown Security](https://github.com/remarkjs/react-markdown#security) | plugin·URL 처리 변경이 안전성에 영향, sanitize 권고 | 현재 rehypeRaw 경로에 명시적 허용 schema 적용 |
| W23 | [rehype-sanitize 공식 저장소](https://github.com/rehypejs/rehype-sanitize) | schema 기반 HTML AST sanitization, plugin 순서·허용 속성 주의 | raw → highlight/transform → 최종 sanitize; 허용 class·링크 회귀 fixture로 검증 |
| W24 | [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) | 세션 cookie 속성·JS 접근 및 세션 수명 보호 | JS-readable bearer token 축소, 서버 발급 HttpOnly cookie/BFF 단계 전환 |
| W25 | [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) | cookie 인증에서 CSRF token·origin 검증 등 방어 | HttpOnly 전환과 CSRF 방어를 같은 릴리스 계약으로 설계 |
| W26 | [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) | 키보드·초점·상태·대상 크기 등 접근성 기준 | AA 목표. 프로젝트 모바일 target 44px는 별도 UX 목표이며 AA 최소를 44px로 오기하지 않음 |
| W27 | [W3C ARIA23 role=log](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA23) | 순차 정보 추가의 접근성 의미·announce | 가상 목록 전체를 매 토큰 live announce하지 않고 별도 완료 안내 사용 |
| W28 | [MDN overflow-anchor](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow-anchor) | none은 해당 영역 기본 scroll anchoring을 제외 | 현재 none 설정에서 브라우저가 늦은 이미지 이동을 해결한다고 기대하지 않음 |
| W29 | [PostgreSQL SELECT](https://www.postgresql.org/docs/current/sql-select.html) | 순서·row locking·SKIP LOCKED 구문 | 복합 keyset cursor, 짧은 트랜잭션 claim. SKIP LOCKED는 일반 조회 정합성 해법이 아님 |
| W30 | [Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/) / [XREAD](https://redis.io/docs/latest/commands/xread/) | event ID 이후 읽기·trim/보관 전략 | Redis replay는 유한 보관. cursor 만료 시 DB snapshot으로 복구; broadcast UI에 worker consumer group 오용 금지 |
| W31 | [LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence) | checkpoint·thread 기반 실행 상태 보관 | 기존 의존성 활용을 장기 작업 PoC로 검증; 외부 도구의 exactly-once 보장을 대신하지 않음 |
| W32 | [Vercel: Introducing Streamdown](https://vercel.com/changelog/introducing-streamdown) | 미완성 Markdown을 다루는 streaming renderer 소개 | 현재 문서 링크·HTML·차트 렌더 동등성 검증 후 활성 bubble에 한정한 도입 후보 |

W12/W13의 라이선스 구분은 공식 제품 설명을 확인한 것으로, 법률 검토나 구매 완료를 뜻하지 않는다. W29의 `current`는 열람 당시 PostgreSQL 18 문서이며 운영 DB major를 측정한 결과가 아니다.

## 내부 보고서

| ID | 문서 | 이번 반영 |
|---|---|---|
| R01 | [채팅 기능 전수 분석 2026-04-28](../../../aads-server/docs/reports/20260428_CHAT_FEATURE_FULL_AUDIT.md) | 기능 보존 목록의 출발점. 당시 경로·수치는 현재 코드로 재검증 |
| R02 | [경량화 계획 2026-05-06](../../../aads-server/docs/reports/20260506_CHAT_LIGHTWEIGHT_PLAN.md) | 초기 fetch·revision·가상화·artifact lazy load의 이력 |
| R03 | [경량화 계획 v2](../../../aads-server/docs/reports/20260506_CHAT_LIGHTWEIGHT_PLAN_v2.md) | UI payload와 LLM 원본 context 분리 요구 유지 |
| R04 | [경량화 V2 영향·보완 분석](../../../aads-server/docs/reports/20260506_CHAT_LIGHTWEIGHT_V2.md) | preview가 full 본문을 덮지 않음, 도구 hydration 및 context 보호 |
| R05 | [입력 멈춤 조치 2026-05-20](../../../aads-server/docs/reports/20260520_CHAT_INPUT_FREEZE_REMEDIATION.md) | 활성 bubble 구독 분리 계승. 마지막 N줄 임의 Markdown 파싱·provider TTFT 200ms·직접 active 재시작 제안은 대체 |
| R06 | [연속성·컨텍스트 소진 2026-07-28](../../../aads-server/docs/reports/20260728_AADS_STREAM_CONTINUITY_CONTEXT_EXHAUSTION_REPORT.md) | transport와 execution 분리, durable 작업 요구 계승. interrupt가 순수 메모리뿐이라는 당시 진단은 현재와 다름 |
| R07 | [owner/recovery 사고 2026-09-08](../../../aads-server/docs/reports/20260908_chat_interruption_owner_recovery_incident_v2.md) | 이미 구현한 lease·epoch 보호를 재사용하고 잔여 우회 쓰기 점검 |
| R08 | [스크롤 안정화 v1.0](../PRD-CHAT-SCROLL-STABILITY-v1.0.md) | 구현·운영 검증 기록 계승. 단일 writer 및 늦은 이미지 보호의 문서/코드 차이 정정 |
| R09 | [문서 링크·artifact panel PRD](../PRD-DOCUMENT-LINK-ARTIFACT-PANEL-v1.0.md) | 파일 링크·미리보기·다운로드·새 창 기능의 보존 기준 |
| R10 | [Dashboard HANDOVER](../../HANDOVER.md) / [Server HANDOVER](../../../aads-server/HANDOVER.md) | 기능 회귀·배포·복구 변경 이력 |
| R11 | [전역 릴리스 규칙](../../../AGENTS.md) | clean SHA, 단일 image, 짧은 nginx lock, drain, 동일 digest, 5분 감시 |

## 정확도·갱신 규칙

1. 현재 구현의 근거는 [코드 감사](CURRENT-CODE-AUDIT.md)의 C-ID, 파일·심벌·행 및 snapshot SHA다.
2. 설계의 수치 목표는 측정값과 구분한다. 과거 보고서의 사용자 세션 결과는 이번 신규 운영 테스트 결과로 표기하지 않는다.
3. 문서 오류 발견 시 원문을 몰래 수정하지 않고 이 등록부와 신규 결정 기록에 정정 이유를 남긴다.
4. 구현 시작 때 repository HEAD·dirty file·installed version을 다시 확인한다. 외부 지원 상태·라이선스는 설치 시 재확인한다.
5. 참고 자료의 예제는 제품 요구사항을 자동으로 결정하지 않는다. 가상화 패키지, 상태 경계, 장애 처리 방식은 AADS 코드와 테스트 결과를 근거로 선택한다.
