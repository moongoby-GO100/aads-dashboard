# AADS 채팅 현대화 설계·PRD 문서 묶음

작성일 2026-09-12 · 문서 버전 1.0 · 상태: **현재 코드 검토와 상세 계획 작성 완료 / 제품 구현 전**.

현재 Dashboard `7888271939685b093c0572e935e7f7a3a384be6e`, Server `e50f0ef9f9a397fcb0908fdcd6cb477723a1c2c0`를 기준으로 작성했다. 실제 실행 import와 코드 행·심벌·SHA-256을 확인했으며, 직전 스크롤 안정화 및 backend fencing 후속 수정도 반영했다. 이번 작업은 문서와 문서 검증기 저장이며 제품 변경·앱 배포 보고가 아니다.

최종 재확인 시 Server HEAD는 별도 금융 기능 커밋 `683cfb0d7840463ef38c1d236e229a91a7021c72`로 진행되었다. 기준 커밋과의 차이를 검토하고 채팅 핵심 파일 4개의 SHA-256이 동일함을 확인했다. 따라서 감사 기준 snapshot은 보존하고 후속 커밋 확인 사실을 함께 기록한다.

## 문서 읽기 순서

웹 문서함에서는 [채팅 구조·기능 개선 통합 보고서](20260912_채팅_구조개선_기능개선_PRD_설계_유지보수_재발방지_통합보고서.html)를 연다. `/docs`에서 `채팅` 또는 `20260912`로 검색하면 찾을 수 있다. 통합본은 아래 원문 6개를 생략 없이 포함하며, 목차·문서 간 이동·공식 출처 링크를 제공한다. Markdown 원문은 그대로 유지한다.

| 파일 | 내용 | 주요 추적 ID |
|---|---|---|
| [현재 코드 감사](CURRENT-CODE-AUDIT.md) | 실제 경로·현재 버전·32개 확인 사항·기존 보고서 정정·미측정 영역 | C01~C32 |
| [PRD](PRD.md) | 사용자 흐름·기존 기능 보존·44개 기능 요구·18개 품질 목표 | FR01~FR44, NFR01~NFR18 |
| [상세 기술 설계](TECHNICAL-DESIGN.md) | 상태 소유권·모듈·스크롤·SSE/cursor·API·DB·보안·최신 기술 선택 | INV01~INV15, ADR01~ADR12 |
| [검증 및 실행 계획](VERIFICATION-AND-ROLLOUT.md) | 요구별44개 테스트군·11개 작업 패키지·공수·배포·재발방지·runbook | T01~T44, WP00~WP10 |
| [출처 등록부](SOURCES.md) | 32개 공식 기술 자료 항목과11개 내부 보고서/규칙 항목, 확인일·적용 범위 | W01~W32, R01~R11 |
| [문서 검증기](verify-docs.mjs) | 로컬 링크·ID·요구사항/테스트 coverage 검사 | Node 기본 모듈만 사용 |

## 핵심 판단

스크롤 v1의 action 높이 고정·manual follow mode는 유지한다. 후속 개선은 분산된 viewport write와 state updater 부작용을 제거하고, 실행 상태·연결 상태·메시지 projection을 명시적으로 분리하는 데서 시작한다. 공통 SSE parser, **적용한 event cursor**와 서버 광고 cursor 분리, 순수 조회, durable command를 기반으로 가상화·입력·문서 UX를 개선한다.

이번 재검토에서 계획에 보강한 항목은 다음과 같다.

- build의 `ignoreBuildErrors:true`, Node20 지원 종료, 오래된 React Compiler beta, test 실행 환경 차이.
- full/render GET의 DB repair 및 일부 terminal writer 경로, 추가 지시의 DB 저장 실패 성공 ACK와 조기 applied 표시.
- timestamp-only cursor, 여러 SSE parser·광고/applied cursor 혼합, 늦은 artifact 응답의 scope 검사.
- 생성 HTML 새 창의 raw document.write, JS-readable token, 인증 복귀 hash, Markdown 허용 schema.
- 실제 IME 방어·FileReader·DB interrupt fallback·lease retry 환급처럼 이미 존재하는 개선을 유지해야 할 조건.

공식 자료 확인 결과 Node24 LTS를 runtime 목표로 정하고, 현재 Next16.3.4 기반에서 안정 React Compiler·React store/effect API·TanStack Query·MIT Virtuoso·OpenAPI 생성·Vitest/MSW/fast-check/Playwright를 검증해 채택하도록 설계했다. React19.3은 2026-09-09 출시를 확인해 호환 검증 대상에 넣었다. Next의 Rust Compiler와 browser OpenTelemetry 자동 계측은 실험 상태를 명시했고, 상용 Virtuoso Message List는 기본안에서 구매를 전제하지 않는다. 각 기술 판단의 정확한 공식 링크는 [출처 등록부](SOURCES.md)에 있다.

## 실행 규모와 완료 의미

기본 범위 WP00~WP09는 **26~42 엔지니어링 작업일**의 초기 추정이다. 장기 작업 checkpoint PoC WP10은 추가5~10일이다. 기존 FE 중심 일정에 보안·BE contract·durable command·운영 인수를 더한 범위이므로 직접 비교할 수 없다. 착수 기준선과 실제 담당자를 확정한 뒤 달력 일정으로 재산정한다.

현재 운영 성능·보안 악용·모든 브라우저 동작을 전수 검증했다고 보고하지 않는다. 이번 source typecheck와 정책12개 case는 통과했으며, 실제 브라우저/DB/장애 주입 인수는 구현 단계의 필수 gate로 명세했다. 문서의 수치 목표는 현재 측정값과 구분했다.

## 유지보수 사용법

```bash
node docs/chat-modernization-20260912/verify-docs.mjs
```

구현 PR에는 `C → FR/INV → ADR → T → WP → release SHA`를 연결한다. 실제 테스트 실패를 단순 timer 추가로 덮지 않고, 실패 sequence·owner·재발 방지·임시 코드 제거 조건을 남긴다. 이 검증기는 링크 존재와 식별자 정합성을 검사하며 웹 출처의 지속 유효성·설계의 정확성·실제 제품 테스트를 대신하지 않는다.

외부 자료의 W-ID와 실행 작업의 WP-ID를 구분한다. 새 코드로 행 번호가 바뀌면 symbol·commit·hash로 근거를 갱신한다. 기존 사용자 수정 파일과 운영 runtime 파일은 이번 문서 commit 대상에 포함하지 않는다.

### 웹 열람본 갱신

`publish-docs.mjs`는 설치된 React·react-markdown·remark-gfm으로 script-free HTML을 만들며 추가 패키지를 설치하지 않는다. 원문 변경 후 `node docs/chat-modernization-20260912/publish-docs.mjs`가 출력하는 패치를 적용한다. 이후 `node docs/chat-modernization-20260912/publish-docs.mjs --check`로 원문과 생성본이 일치하는지 확인한다. HTML을 직접 고치지 않는다. 기존 `/docs` 인증과 문서 스캔 허용 경로를 그대로 사용하며, 재스캔으로 목록을 갱신한다.
