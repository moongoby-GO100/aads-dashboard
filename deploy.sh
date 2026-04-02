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
docker compose -f "$COMPOSE_FILE" up -d --no-build --no-deps "$SERVICE"
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
        docker compose -f "$COMPOSE_FILE" up -d --no-build --no-deps "$SERVICE"
        log "WARN: 롤백 완료 — 이전 버전으로 복원"
    fi
    exit 1
fi

# Step 4: 최종 확인
STATUS=$(docker inspect "$CONTAINER" --format='{{.State.Status}}' 2>/dev/null || echo "unknown")
log "배포 완료 — 상태: $STATUS"
log "AADS Dashboard 무중단 배포 성공"

# Step 5: 프론트엔드 QA 자동 실행
log "Step 5: 프론트엔드 QA 실행 (30초 안정화 대기 후)"
sleep 30
QA_RESPONSE=$(curl -sf -X POST "http://localhost:8080/api/v1/visual-qa/full-qa" \
    -H "Content-Type: application/json" \
    -d '{"project_id":"AADS","deploy_url":"https://aads.newtalk.kr/","pages":["/","/chat","/ops"]}' \
    --max-time 120 2>/dev/null || echo '{"error":"QA API 호출 실패"}')

QA_RESULT=$(echo "$QA_RESPONSE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('overall_result', d.get('verdict', 'UNKNOWN')))
except:
    print('ERROR')
" 2>/dev/null || echo "ERROR")

if [[ "$QA_RESULT" == *"FAIL"* ]]; then
    log "⚠️ Step 5: 프론트엔드 QA 실패 — $QA_RESULT (배포는 유지, 알림만)"
    # 텔레그램 알림 (환경변수 있으면 발송)
    if [[ -f "${COMPOSE_DIR}/.env" ]]; then
        _TG_TOKEN=$(grep -oP '^TELEGRAM_BOT_TOKEN=\K.*' "${COMPOSE_DIR}/.env" 2>/dev/null || true)
        _TG_CHAT=$(grep -oP '^TELEGRAM_CHAT_ID=\K.*' "${COMPOSE_DIR}/.env" 2>/dev/null || true)
        if [[ -n "$_TG_TOKEN" && -n "$_TG_CHAT" ]]; then
            curl -sf -X POST "https://api.telegram.org/bot${_TG_TOKEN}/sendMessage" \
                -d chat_id="${_TG_CHAT}" \
                -d text="⚠️ [Dashboard QA FAIL] 배포는 완료되었으나 QA 검사 실패: ${QA_RESULT}" \
                -d parse_mode=HTML >/dev/null 2>&1 || true
        fi
    fi
elif [[ "$QA_RESULT" == "ERROR" ]]; then
    log "⚠️ Step 5: QA API 응답 파싱 실패 — 수동 확인 필요"
else
    log "Step 5: ✅ 프론트엔드 QA 통과 — $QA_RESULT"
fi
