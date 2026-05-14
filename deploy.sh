#!/bin/bash
# AADS Dashboard — Blue-Green Deploy Script
# 용도: 대시보드 코드 변경 후 blue-green 무중단 배포
# 사용법: cd /root/aads/aads-dashboard && bash deploy.sh
#
# 프로세스:
#   1. 비활성 슬롯(blue 또는 green) 이미지 빌드 + 기동
#   2. 헬스체크 통과 시 nginx upstream 전환
#   3. 외부 헬스체크 검증
#   4. 이전 슬롯을 같은 release로 재빌드해 warm standby 동기화
#   5. 실패 시 upstream 롤백

set -euo pipefail

COMPOSE_DIR="/root/aads/aads-server"
COMPOSE_FILE="docker-compose.prod.yml"
BLUE_SERVICE="aads-dashboard"
GREEN_SERVICE="aads-dashboard-green"
BLUE_CONTAINER="aads-dashboard"
GREEN_CONTAINER="aads-dashboard-green"
BLUE_PORT="3100"
GREEN_PORT="3101"
STATE_DIR="/root/aads/aads-dashboard"
HEALTH_BLUE="http://127.0.0.1:${BLUE_PORT}/login"
HEALTH_GREEN="http://127.0.0.1:${GREEN_PORT}/login"
HEALTH_EXTERNAL="${DASHBOARD_EXTERNAL_HEALTH_URL:-https://aads.newtalk.kr/login}"
NGINX_UPSTREAM="/etc/nginx/conf.d/aads-upstream.conf"
MAX_WAIT=90

log() { echo "[$(date '+%H:%M:%S')] $1"; }

write_active_state() {
    local container="$1"
    local port="$2"
    printf '%s\n' "$container" > "${STATE_DIR}/.active_container"
    printf '%s\n' "$port" > "${STATE_DIR}/.active_port"
}

nginx_test() {
    local test_log="/tmp/aads-dashboard-nginx-test.log"
    if command -v nginx >/dev/null 2>&1; then
        if nginx -t >"${test_log}" 2>&1; then
            rm -f "${test_log}"
            return 0
        fi
        cat "${test_log}" >&2 || true
        rm -f "${test_log}"
    fi
    if docker ps --format '{{.Names}}' | grep -Fx "aads-nginx" >/dev/null 2>&1; then
        docker exec aads-nginx nginx -t
        return $?
    fi
    return 1
}

nginx_reload() {
    if command -v nginx >/dev/null 2>&1 && systemctl is-active --quiet nginx 2>/dev/null; then
        systemctl reload nginx
        return $?
    fi
    if command -v nginx >/dev/null 2>&1 && nginx -s reload >/dev/null 2>&1; then
        return 0
    fi
    if docker ps --format '{{.Names}}' | grep -Fx "aads-nginx" >/dev/null 2>&1; then
        docker exec aads-nginx nginx -s reload
        return $?
    fi
    return 1
}

wait_health() {
    local url="$1" max_wait="$2" label="$3"
    local elapsed=0
    while [ "$elapsed" -lt "$max_wait" ]; do
        if wget -q --spider "$url" 2>/dev/null; then
            log "OK: ${label} 헬스체크 통과 (${elapsed}초)"
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    log "FAIL: ${label} 헬스체크 실패 (${max_wait}초 초과)"
    return 1
}

sync_dashboard_standby() {
    local slot="$1" service="$2" container="$3" health_url="$4"
    local args=(-f "$COMPOSE_FILE")

    if [ "$slot" = "green" ]; then
        args+=(--profile green)
    fi

    log "Step 5: 이전 슬롯 standby 동기화 (${container})"
    docker compose "${args[@]}" up -d --build --no-deps "$service"
    if wait_health "$health_url" "$MAX_WAIT" "standby-${slot}"; then
        log "OK: 이전 슬롯 standby 동기화 완료 (${container})"
        return 0
    fi
    log "WARN: 이전 슬롯 standby 동기화 후 헬스체크 실패 (${container})"
    return 0
}

current_active_slot() {
    if grep -Eq "127\\.0\\.0\\.1:${GREEN_PORT} max_fails=3 fail_timeout=30s;$" "$NGINX_UPSTREAM"; then
        echo "green"
        return 0
    fi
    echo "blue"
}

switch_dashboard_upstream() {
    local target="$1"
    local tmp
    tmp=$(mktemp)
    python3 - "$NGINX_UPSTREAM" "$tmp" "$target" <<'PY'
import sys

src, dst, target = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src, "r", encoding="utf-8").read()
blue_active = "server 127.0.0.1:3100 max_fails=3 fail_timeout=30s;"
blue_active_legacy = "server 127.0.0.1:3100 max_fails=0;"
blue_backup = "server 127.0.0.1:3100 max_fails=3 fail_timeout=30s backup;"
green_active = "server 127.0.0.1:3101 max_fails=3 fail_timeout=30s;"
green_backup = "server 127.0.0.1:3101 max_fails=3 fail_timeout=30s backup;"

text = text.replace(blue_active, "__BLUE_ACTIVE__")
text = text.replace(blue_active_legacy, "__BLUE_ACTIVE__")
text = text.replace(blue_backup, "__BLUE_BACKUP__")
text = text.replace(green_active, "__GREEN_ACTIVE__")
text = text.replace(green_backup, "__GREEN_BACKUP__")

if target == "green":
    text = text.replace("__BLUE_ACTIVE__", blue_backup)
    text = text.replace("__BLUE_BACKUP__", blue_backup)
    text = text.replace("__GREEN_ACTIVE__", green_active)
    text = text.replace("__GREEN_BACKUP__", green_active)
else:
    text = text.replace("__BLUE_ACTIVE__", blue_active)
    text = text.replace("__BLUE_BACKUP__", blue_active)
    text = text.replace("__GREEN_ACTIVE__", green_backup)
    text = text.replace("__GREEN_BACKUP__", green_backup)

open(dst, "w", encoding="utf-8").write(text)
PY
    mv "$tmp" "$NGINX_UPSTREAM"
}

verify_upstream_shape() {
    local blue_count green_count
    blue_count=$(grep -Ec "127\\.0\\.0\\.1:${BLUE_PORT} .*;" "$NGINX_UPSTREAM" || true)
    green_count=$(grep -Ec "127\\.0\\.0\\.1:${GREEN_PORT} .*;" "$NGINX_UPSTREAM" || true)
    if [ "${blue_count}" -lt 1 ] || [ "${green_count}" -lt 1 ]; then
        log "FAIL: upstream 서버 라인 검증 실패 (blue=${blue_count}, green=${green_count})"
        return 1
    fi
    return 0
}

cd "$COMPOSE_DIR"

COMPOSE_ARGS=(-f "$COMPOSE_FILE")

# Step 0: 현재 활성 슬롯 판별
ACTIVE_SLOT=$(current_active_slot)
if [ "$ACTIVE_SLOT" = "blue" ]; then
    TARGET_SLOT="green"
    TARGET_SERVICE="$GREEN_SERVICE"
    TARGET_CONTAINER="$GREEN_CONTAINER"
    TARGET_PORT="$GREEN_PORT"
    TARGET_HEALTH="$HEALTH_GREEN"
    COMPOSE_ARGS+=(--profile green)
    PREV_SLOT="blue"
    PREV_SERVICE="$BLUE_SERVICE"
    PREV_CONTAINER="$BLUE_CONTAINER"
    PREV_HEALTH="$HEALTH_BLUE"
else
    TARGET_SLOT="blue"
    TARGET_SERVICE="$BLUE_SERVICE"
    TARGET_CONTAINER="$BLUE_CONTAINER"
    TARGET_PORT="$BLUE_PORT"
    TARGET_HEALTH="$HEALTH_BLUE"
    PREV_SLOT="green"
    PREV_SERVICE="$GREEN_SERVICE"
    PREV_CONTAINER="$GREEN_CONTAINER"
    PREV_HEALTH="$HEALTH_GREEN"
fi
log "현재 활성 슬롯: $ACTIVE_SLOT"
log "배포 대상 슬롯: $TARGET_SLOT"

# Step 0.5: 대상 슬롯 잔여 컨테이너 정리
if docker ps -a --format '{{.Names}}' | grep -Fx "$TARGET_CONTAINER" >/dev/null 2>&1; then
    log "Step 0.5: 대상 슬롯 잔여 컨테이너 정리 (${TARGET_CONTAINER})"
    docker rm -f "$TARGET_CONTAINER" >/dev/null 2>&1 || true
fi

# Step 1: 비활성 슬롯 빌드 + 기동
log "Step 1: ${TARGET_SLOT} 슬롯 빌드 및 기동"
docker compose "${COMPOSE_ARGS[@]}" up -d --build --no-deps "$TARGET_SERVICE"
log "OK: ${TARGET_SLOT} 슬롯 기동 완료"

# Step 2: 내부 헬스체크
if ! wait_health "$TARGET_HEALTH" "$MAX_WAIT" "$TARGET_SLOT"; then
    log "FAIL: ${TARGET_SLOT} 슬롯 헬스체크 실패 — 배포 중단"
    exit 1
fi

# Step 3: upstream 전환
log "Step 3: nginx upstream → ${TARGET_SLOT}"
cp "$NGINX_UPSTREAM" "${NGINX_UPSTREAM}.dashboard.bak"
switch_dashboard_upstream "$TARGET_SLOT"
if ! verify_upstream_shape || ! nginx_test; then
    log "FAIL: nginx 설정 검증 실패 — upstream 롤백"
    mv "${NGINX_UPSTREAM}.dashboard.bak" "$NGINX_UPSTREAM"
    exit 1
fi
nginx_reload
log "OK: nginx reload 완료"

# Step 4: 외부 헬스체크
if ! wait_health "$HEALTH_EXTERNAL" 30 "external(${TARGET_SLOT})"; then
    log "FAIL: 외부 헬스체크 실패 — upstream 롤백"
    mv "${NGINX_UPSTREAM}.dashboard.bak" "$NGINX_UPSTREAM"
    nginx_test && nginx_reload
    exit 1
fi
write_active_state "$TARGET_CONTAINER" "$TARGET_PORT"

# Step 5: 이전 슬롯 동기화
if [ "${AADS_DASHBOARD_STOP_PREVIOUS:-false}" = "true" ]; then
    log "Step 5: 이전 슬롯 정리 (${PREV_CONTAINER})"
    docker stop "$PREV_CONTAINER" >/dev/null 2>&1 || true
else
    sync_dashboard_standby "$PREV_SLOT" "$PREV_SERVICE" "$PREV_CONTAINER" "$PREV_HEALTH"
fi

# Step 6: 최종 확인
STATUS=$(docker inspect "$TARGET_CONTAINER" --format='{{.State.Status}}' 2>/dev/null || echo "unknown")
log "배포 완료 — 활성 슬롯: ${TARGET_SLOT}, 상태: $STATUS"
log "AADS Dashboard blue-green 배포 성공"

# Step 7: 프론트엔드 QA 자동 실행
log "Step 7: 프론트엔드 QA 실행 (30초 안정화 대기 후)"
sleep 30
QA_API_BASE="${AADS_API_BASE:-http://127.0.0.1:8100}"
QA_RESPONSE=$(curl -sf -X POST "${QA_API_BASE}/api/v1/visual-qa/full-qa" \
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
    log "⚠️ Step 7: 프론트엔드 QA 실패 — $QA_RESULT (배포는 유지, 알림만)"
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
    log "⚠️ Step 7: QA API 응답 파싱 실패 — 수동 확인 필요"
else
    log "Step 7: ✅ 프론트엔드 QA 통과 — $QA_RESULT"
fi
