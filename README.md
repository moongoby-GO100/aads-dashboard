# AADS Dashboard

> Phase 2 대시보드 — AADS (Autonomous AI Development System) 실시간 모니터링 웹앱

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-blue)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)

## 개요

AADS 8-agent 파이프라인의 실시간 모니터링 대시보드입니다.  
`aads-server` (FastAPI + LangGraph)와 연동하여 프로젝트 생성·상태 확인·비용 추적을 제공합니다.

**접속 URL**: https://aads.newtalk.kr/

## 기술 스택

| 항목 | 기술 |
|------|------|
| 프레임워크 | Next.js 16.1 (App Router) |
| 언어 | TypeScript 5 |
| 스타일링 | Tailwind CSS 4 |
| 런타임 | Node.js 20 LTS |
| 배포 | Docker (standalone output) |

## 디렉토리 구조

```
src/
├── app/
│   ├── layout.tsx          # 글로벌 레이아웃 (사이드바+헤더)
│   ├── page.tsx            # 메인 대시보드 (프로젝트 목록 + 생성)
│   ├── login/page.tsx      # 로그인 페이지
│   ├── projects/
│   │   ├── page.tsx        # 프로젝트 목록 (pagination)
│   │   └── [id]/
│   │       ├── page.tsx    # 프로젝트 상세 (에이전트 현황)
│   │       ├── stream/     # SSE 실시간 모니터
│   │       └── costs/      # 비용 추적
│   ├── not-found.tsx       # 404 페이지
│   └── error.tsx           # 에러 바운더리
├── components/
│   ├── Sidebar.tsx         # 좌측 네비게이션
│   ├── Header.tsx          # 상단 헤더 (API 상태)
│   ├── ProjectCard.tsx     # 프로젝트 카드
│   ├── AgentStatus.tsx     # 8-agent 파이프라인 시각화
│   ├── CostTracker.tsx     # 비용 추적 + 바 차트
│   ├── SSEMonitor.tsx      # SSE 실시간 로그
│   └── CheckpointList.tsx  # HITL 체크포인트 목록
├── lib/
│   ├── api.ts              # aads-server API 클라이언트
│   ├── auth.ts             # JWT 인증 유틸
│   └── sse.ts              # SSE 연결 유틸
└── types/index.ts          # TypeScript 타입 정의
```

## 환경변수

`.env.local` 파일 생성:

```env
NEXT_PUBLIC_API_URL=https://aads.newtalk.kr/api/v1
```

## 실행 방법

### 개발 모드

```bash
npm install
npm run dev   # http://localhost:3000
```

### 프로덕션 빌드

```bash
npm run build
npm run start
```

### Docker 배포

```bash
docker compose up -d --build
# 포트 3100 → Nginx aads.newtalk.kr/
```

## API 연동

`aads-server` (https://aads.newtalk.kr/api/v1) 엔드포인트:

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/health` | GET | 서버 상태 확인 |
| `/projects` | GET | 프로젝트 목록 (limit, offset) |
| `/projects` | POST | 새 프로젝트 생성 |
| `/projects/{id}/status` | GET | 프로젝트 상태 + 에이전트 현황 |
| `/projects/{id}/costs` | GET | 비용 상세 |
| `/projects/{id}/stream` | POST | SSE 실시간 스트리밍 |
| `/auth/login` | POST | 로그인 (JWT 토큰 반환) |
| `/auth/me` | GET | 내 정보 (JWT 검증) |

## 주요 기능

- **대시보드**: 전체 프로젝트 목록, 새 프로젝트 생성
- **8-agent 파이프라인 시각화**: PM→Supervisor→Architect→Developer→QA→Judge→DevOps→Researcher
- **SSE 실시간 모니터**: 터미널 스타일, 자동 스크롤
- **HITL 체크포인트**: 6단계 타임라인 뷰
- **비용 추적**: 에이전트별 바 차트, 총 비용
- **JWT 인증**: 로그인 + 자동 리다이렉트

## 관련 저장소

- **aads-server**: github.com/moongoby-GO100/aads-server (FastAPI + LangGraph)
- **aads-docs**: github.com/moongoby-GO100/aads-docs (문서, HANDOVER.md)
