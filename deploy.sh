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
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

COMPOSE_DIR="/root/aads/aads-server"
COMPOSE_FILE="docker-compose.prod.yml"
COMPOSE_PROJECT="aads-server"
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
NGINX_UPSTREAM_SOURCE="/root/aads/aads-server/nginx-aads-upstream.conf"
MAX_WAIT=90
LOCKFILE="/tmp/aads-dashboard-deploy.lock"

log() { echo "[$(date '+%H:%M:%S')] $1"; }

if [ -f "$LOCKFILE" ]; then
    LOCK_PID=$(cat "$LOCKFILE" 2>/dev/null || echo "")
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
        log "FAIL: 대시보드 배포가 이미 진행 중입니다 (PID=$LOCK_PID)"
        exit 1
    fi
    log "WARN: stale dashboard deploy lock 제거 (PID=${LOCK_PID:-unknown})"
    rm -f "$LOCKFILE"
fi
echo $$ > "$LOCKFILE"
trap 'rm -f "$LOCKFILE"' EXIT

if git -C "$STATE_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    export AADS_RELEASE_SHA="${AADS_RELEASE_SHA:-$(git -C "$STATE_DIR" rev-parse --short=12 HEAD)}"
else
    export AADS_RELEASE_SHA="${AADS_RELEASE_SHA:-unknown}"
fi
log "릴리스 SHA: ${AADS_RELEASE_SHA}"

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

container_compose_label() {
    local container="$1" label="$2"
    docker inspect "$container" --format "{{ index .Config.Labels \"$label\" }}" 2>/dev/null || true
}

remove_container_if_foreign() {
    local container="$1" service="$2"
    local project actual_service

    if ! docker ps -a --format '{{.Names}}' | grep -Fx "$container" >/dev/null 2>&1; then
        return 0
    fi

    project=$(container_compose_label "$container" "com.docker.compose.project")
    actual_service=$(container_compose_label "$container" "com.docker.compose.service")
    if [ "$project" != "$COMPOSE_PROJECT" ] || [ "$actual_service" != "$service" ]; then
        log "WARN: 외부 compose 잔여 컨테이너 정리 (${container}, project=${project:-none}, service=${actual_service:-none})"
        docker rm -f "$container" >/dev/null 2>&1 || true
    fi
}

container_release_sha() {
    local container="$1"
    docker inspect "$container" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
        | awk -F= '$1=="AADS_RELEASE_SHA"{print $2; exit}'
}

sync_dashboard_standby() {
    local slot="$1" service="$2" container="$3" health_url="$4"
    local args=(-f "$COMPOSE_FILE")

    if [ "$slot" = "green" ]; then
        args+=(--profile green)
    fi

    log "Step 5: 이전 슬롯 standby 동기화 (${container})"
    remove_container_if_foreign "$container" "$service"
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
import re

src, dst, target = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src, "r", encoding="utf-8").read()

if target == "green":
    blue_line = "    server 127.0.0.1:3100 max_fails=3 fail_timeout=30s backup;"
    green_line = "    server 127.0.0.1:3101 max_fails=3 fail_timeout=30s;"
else:
    blue_line = "    server 127.0.0.1:3100 max_fails=3 fail_timeout=30s;"
    green_line = "    server 127.0.0.1:3101 max_fails=3 fail_timeout=30s backup;"

dashboard_block = (
    "upstream aads_dashboard {\n"
    "    zone aads_dashboard 64k;\n"
    "    least_conn;\n"
    "    # Active slot is the non-backup line. dashboard deploy.sh rewrites 3100/3101.\n"
    f"{blue_line}\n"
    f"{green_line}\n"
    "    keepalive 16;\n"
    "}"
)

text, count = re.subn(
    r"upstream\s+aads_dashboard\s*\{.*?\n\}",
    dashboard_block,
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("aads_dashboard upstream block not found")

open(dst, "w", encoding="utf-8").write(text)
PY
    mv "$tmp" "$NGINX_UPSTREAM"
}

backup_upstream() {
    cp "$NGINX_UPSTREAM" "${NGINX_UPSTREAM}.dashboard.bak"
    if [ -f "$NGINX_UPSTREAM_SOURCE" ]; then
        cp "$NGINX_UPSTREAM_SOURCE" "${NGINX_UPSTREAM_SOURCE}.dashboard.bak"
    fi
}

rollback_upstream() {
    if [ -f "${NGINX_UPSTREAM}.dashboard.bak" ]; then
        mv "${NGINX_UPSTREAM}.dashboard.bak" "$NGINX_UPSTREAM"
    fi
    if [ -f "${NGINX_UPSTREAM_SOURCE}.dashboard.bak" ]; then
        mv "${NGINX_UPSTREAM_SOURCE}.dashboard.bak" "$NGINX_UPSTREAM_SOURCE"
    fi
}

sync_upstream_source() {
    if [ -f "$NGINX_UPSTREAM_SOURCE" ]; then
        cp "$NGINX_UPSTREAM" "$NGINX_UPSTREAM_SOURCE"
    fi
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
remove_container_if_foreign "$TARGET_CONTAINER" "$TARGET_SERVICE"
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
backup_upstream
switch_dashboard_upstream "$TARGET_SLOT"
if ! verify_upstream_shape || ! nginx_test; then
    log "FAIL: nginx 설정 검증 실패 — upstream 롤백"
    rollback_upstream
    exit 1
fi
nginx_reload
sync_upstream_source
log "OK: nginx reload 완료"

# Step 4: 외부 헬스체크
if ! wait_health "$HEALTH_EXTERNAL" 30 "external(${TARGET_SLOT})"; then
    log "FAIL: 외부 헬스체크 실패 — upstream 롤백"
    rollback_upstream
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
TARGET_RELEASE=$(container_release_sha "$TARGET_CONTAINER")
PREV_RELEASE=$(container_release_sha "$PREV_CONTAINER")
if [ -n "$PREV_RELEASE" ] && [ -n "$TARGET_RELEASE" ] && [ "$PREV_RELEASE" != "$TARGET_RELEASE" ]; then
    log "WARN: standby release 불일치 감지 (active=${TARGET_RELEASE}, standby=${PREV_RELEASE})"
elif [ -n "$TARGET_RELEASE" ]; then
    log "OK: dashboard release 확인 (${TARGET_RELEASE})"
fi
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
elif [[ "$QA_RESULT" == "ERROR" || "$QA_RESULT" == "UNKNOWN" || -z "$QA_RESULT" ]]; then
    log "⚠️ Step 7: QA 미확정 — $QA_RESULT (통과로 간주하지 않음, 수동 확인 필요)"
    if [ "${AADS_DASHBOARD_QA_STRICT:-false}" = "true" ]; then
        exit 1
    fi
else
    log "Step 7: ✅ 프론트엔드 QA 통과 — $QA_RESULT"
fi
