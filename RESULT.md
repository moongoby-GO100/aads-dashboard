# kakaobot.newtalk.kr 호스트 기반 라우팅 분리 — RESULT

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
