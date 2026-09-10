# kakaobot.newtalk.kr 호스트 기반 라우팅 분리 — RESULT

## 2026-09-10 - 과거 채팅 파일 링크 아티팩트 열기 보강

### STEP 0 기존 구현 및 충돌 preflight

- 격리 작업 트리: detached HEAD, 수정 전 tracked/untracked 변경 없음.
- `pipeline_jobs`: 이 저장소에는 운영 DB 조회 접점이 없고 화면 설명 참조만 확인되어 DB 조회는 미실행.
- `chat_workspace_change_ledger`: 저장소 내 코드·문서 접점 없음. DB 연결정보를 열람하거나 시크릿을 출력하지 않았으며 운영 DB 조회는 미실행.
- 대상별 분류:
  - [수정] `src/lib/documentLinks.ts`의 `normalizeDocumentHref()`: 기존 절대/상대/컨테이너/tmp/호스트 매핑을 유지하고, URL 전체가 인코딩된 로컬 경로와 현재 배포 호스트 인식을 추가.
  - [수정] `src/app/chat/MarkdownRenderer.tsx`의 공통 링크 렌더러: 기존 파일 칩/마크다운 링크 흐름을 유지하고 현재 호스트의 `/docs` 링크도 패널 대상으로 판정.
  - [수정] `src/app/chat/page.tsx`의 `handleDocumentLinkClickStable()`: 기존 허용 파일 API·아티팩트 탭 흐름을 유지하고 요청 취소, 세션 stale 차단, 동일 출처 제한, 일시 오류 1회 재시도, 빈 응답 실패 처리를 추가.
  - [유지] `src/app/chat/ChatArtifactPanel.tsx`: report/code/html/file 표시와 모바일 overlay 계약이 이미 충족되어 변경하지 않음.
  - [유지] `/project-docs/content` 및 `/api/v1/files/download` 계약: API 보완은 별도 file_api 배치 의존조건이며 이 UI 배치에서 변경하지 않음.
  - [신규] 없음.
  - [삭제] 없음.

### 변경 결과

- 파일 클릭 즉시 기존 우측 아티팩트 패널(모바일은 overlay)을 열고 로딩 상태를 표시한다.
- 새 링크 클릭 또는 세션 전환 시 이전 요청을 취소하며, 늦게 도착한 이전 세션 응답은 상태에 반영하지 않는다.
- 정적 파일 요청은 현재 origin만 허용하며, 프로젝트 문서는 인증이 적용된 중앙 chat API helper를 계속 사용한다.
- 빈 API 응답은 성공으로 처리하지 않는다. 실패 화면에는 내부 원본 경로를 노출하거나 새 탭 이동을 권하지 않고 같은 채팅 링크 재클릭을 안내한다.

### 검증

- PASS: `/root/aads/aads-dashboard`의 설치 의존성을 읽기 전용으로 연결해 `tsc --noEmit --pretty false` 실행, 오류 0건.
- PASS: 관련 4개 파일 ESLint, 오류 0건/기존 경고 23건.
- PASS: `git diff --check`.
- 미실행: 사용자 금지 규칙에 따라 build, commit, push, deploy.
- 화면 미검증: 현재 격리 작업공간에는 로그인 브라우저 세션·route/tool/capture 수단이 없어 세션 `474e1681-c108-49e9-89c4-2f2389d12114`, 타 세션, 모바일 실제 클릭 검증을 수행하지 못함. 운영 API/프로세스 fallback도 배포 전 소스 변경을 검증하지 못하므로 성공 판정에 사용하지 않음.
- 통합 의존조건: file_api 배치가 과거 세션의 `aads-chat-continuity-directive-review.md`를 현재 사용자·테넌트에 허용된 `/project-docs/content` 응답으로 제공해야 최종 `클릭 → 패널 → 원문 일치`를 인증할 수 있음.

### 롤백

- 위 3개 파일의 이번 diff만 되돌리면 된다. 삭제·DB 변경은 없다.

**일시**: 2026-03-26 10:57 KST
**작업**: kakaobot.newtalk.kr 도메인 접속 시 /kakaobot 외 내부 페이지 차단

## 검증 체크리스트

- [x] **구현 목표**: kakaobot.newtalk.kr 도메인 접속 시 `/kakaobot/*` 외 경로를 `/kakaobot`으로 리다이렉트하여 SaaS 사용자에게 내부 페이지(CEO Chat, Ops 등) 노출 차단
- [x] **검증 방법**: curl -H "Host: kakaobot.newtalk.kr" http://localhost:3100/{path} 7개 테스트
- [x] **완료 기준**: kakaobot 도메인에서 비허용 경로 → /kakaobot 리다이렉트, aads 도메인 기존 동작 유지
- [x] **실패 기준**: kakaobot에서 /ops /chat /managers 접근 가능 또는 aads 도메인 접근 불가 → 해당 없음 (모두 통과)
- [x] **서비스 재시작 확인**: `docker ps` → `aads-dashboard Up (healthy)`, 포트 3100 매핑 정상
- [x] **에러 로그 0건**: `docker logs --since 60s aads-dashboard | grep -i error` → 0건

## 테스트 결과

| 테스트 케이스 | 기대 결과 | 실제 결과 | 상태 |
|--------------|----------|----------|------|
| kakaobot `/` | 307 → `/kakaobot` | 307 → `/kakaobot` | PASS |
| kakaobot `/ops` (차단) | 307 → `/kakaobot` | 307 → `/kakaobot` | PASS |
| kakaobot `/chat` (차단) | 307 → `/kakaobot` | 307 → `/kakaobot` | PASS |
| kakaobot `/kakaobot` (인증 있음) | 200 | 200 | PASS |
| kakaobot `/kakaobot` (미인증) | 307 → `/login?redirect=/kakaobot` | 307 → `/login?redirect=%2Fkakaobot` | PASS |
| kakaobot `/login` (허용) | 200 | 200 | PASS |
| aads `/ops` (인증 있음, 전체 접근) | 200 | 200 | PASS |

## 코드 변경

**`src/middleware.ts`**: 기존 코드에 이미 구현 완료. 변경 없이 빌드/배포만 수행.
- `KAKAOBOT_ALLOWED` 화이트리스트: `/kakaobot`, `/login`, `/signup`, `/api`, `/_next`, 정적 파일
- `isKakaobot` 호스트 감지: `hostname.includes("kakaobot.newtalk.kr")`
- 루트 `/` → `/kakaobot` 리다이렉트
- 비허용 경로 → `/kakaobot` 리다이렉트
- aads.newtalk.kr 등 다른 도메인은 기존 로직 그대로 통과

## 배포 정보

- 빌드: `cd /root/aads/aads-server && docker compose -f docker-compose.prod.yml up -d --build aads-dashboard`
- 이미지: `sha256:ba69c313ba77` (Next.js 16.1.6 Turbopack)
- 컨테이너 상태: healthy
