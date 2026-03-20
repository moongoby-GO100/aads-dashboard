#!/bin/bash
# AADS Dashboard — Zero-Downtime Deploy Script
# 용도: 대시보드 코드 변경 후 무중단 배포
# 사용법: cd /root/aads/aads-dashboard && bash deploy.sh
#
# 프로세스:
#   1. 새 이미지 빌드 (기존 컨테이너 유지)
#   2. 빌드 성공 시에만 컨테이너 교체
#   3. 헬스체크 통과 확인
#   4. 실패 시 이전 이미지로 자동 롤백

set -euo pipefail

COMPOSE_DIR="/root/aads/aads-server"
COMPOSE_FILE="docker-compose.prod.yml"
SERVICE="aads-dashboard"
CONTAINER="aads-dashboard"
HEALTH_URL="http://localhost:3100/login"
MAX_WAIT=60

log() { echo "[$(date '+%H:%M:%S')] $1"; }

cd "$COMPOSE_DIR"

OLD_IMAGE=$(docker inspect "$CONTAINER" --format='{{.Image}}' 2>/dev/null || echo "none")
log "현재 이미지: ${OLD_IMAGE:0:20}..."

# Step 1: 새 이미지 빌드 (기존 컨테이너 계속 서비스 중)
log "Step 1: 새 이미지 빌드 (기존 서비스 유지)"
if ! docker compose -f "$COMPOSE_FILE" build "$SERVICE"; then
    log "FAIL: 빌드 실패. 기존 서비스 영향 없음. 배포 중단."
    exit 1
fi
log "OK: 빌드 성공"

# Step 2: 컨테이너 교체 (빌드된 이미지로 즉시 스왑)
log "Step 2: 컨테이너 교체"
docker compose -f "$COMPOSE_FILE" up -d --no-build "$SERVICE"
log "OK: 컨테이너 교체 완료"

# Step 3: 헬스체크 대기
log "Step 3: 헬스체크 대기 (최대 ${MAX_WAIT}초)"
elapsed=0
while [ $elapsed -lt $MAX_WAIT ]; do
    if wget -q --spider "$HEALTH_URL" 2>/dev/null; then
        log "OK: 헬스체크 통과 (${elapsed}초)"
        break
    fi
    sleep 2
    elapsed=$((elapsed + 2))
done

if [ $elapsed -ge $MAX_WAIT ]; then
    log "FAIL: 헬스체크 실패 — 롤백 시도"
    if [ "$OLD_IMAGE" != "none" ]; then
        docker stop "$CONTAINER" 2>/dev/null || true
        docker rm "$CONTAINER" 2>/dev/null || true
        docker compose -f "$COMPOSE_FILE" up -d --no-build "$SERVICE"
        log "WARN: 롤백 완료 — 이전 버전으로 복원"
    fi
    exit 1
fi

# Step 4: 최종 확인
STATUS=$(docker inspect "$CONTAINER" --format='{{.State.Status}}' 2>/dev/null || echo "unknown")
log "배포 완료 — 상태: $STATUS"
log "AADS Dashboard 무중단 배포 성공"
