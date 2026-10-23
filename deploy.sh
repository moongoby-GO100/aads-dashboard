#!/bin/bash
# AADS Dashboard — Blue-Green Deploy Script
# 용도: 대시보드 코드 변경 후 blue-green 무중단 배포
# 사용법: bash <깨끗한 릴리스 worktree>/deploy.sh [--force]
#   --force   이미 활성인 릴리스라도 다시 배포한다(검증된 이미지는 재사용만 한다).
#   한 SHA 한 이미지: 같은 SHA 이미지를 다시 빌드하는 우회(--rebuild, DEPLOY_REBUILD=1)는 거부한다.
#   기존 태그의 출처 라벨이 맞지 않거나 확인할 수 없으면 덮어쓰지 않고 중단한다(새 승인 SHA 필요).
#
# 역할 분리:
#   SOURCE_DIR = 이 스크립트가 들어 있는 깨끗한 git checkout. 릴리스 코드의 유일한 출처다.
#   STATE_DIR  = 공유 상태 위치(.active_*, deploy-logs, .env.local). 코드 출처로 쓰지 않는다.
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
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
RELEASE_FULL_SHA=""
RELEASE_IMAGE_ID=""
HEALTH_BLUE="http://127.0.0.1:${BLUE_PORT}/login"
HEALTH_GREEN="http://127.0.0.1:${GREEN_PORT}/login"
HEALTH_EXTERNAL="${DASHBOARD_EXTERNAL_HEALTH_URL:-https://aads.newtalk.kr/login}"
NGINX_UPSTREAM="/etc/nginx/conf.d/aads-upstream.conf"
NGINX_UPSTREAM_SOURCE="/root/aads/aads-server/nginx-aads-upstream.conf"
MAX_WAIT=90
# P0/P1 감시 하한. 환경변수로 낮출 수 없다(낮추려는 값은 거부).
readonly MONITOR_MIN_SECONDS=300
readonly MONITOR_MAX_SECONDS=1800
readonly MONITOR_MAX_INTERVAL=60
DEPLOY_MONITOR_ELAPSED_SECONDS=0
UPSTREAM_SWITCHED=false
NGINX_LOCK_HELD=false
LOCKFILE="/tmp/aads-dashboard-deploy.lock"

# --force: 이미 활성인 릴리스라도 다시 배포한다(검증된 이미지는 재사용). 기본값은 건너뜀이다 —
# 실수로 같은 SHA 를 두 번 배포하는 쪽이 훨씬 자주 일어난다.
# 강제 재빌드는 "한 SHA 한 이미지" 계약 위반이므로 플래그/환경변수 모두 거부한다. 아무것도 건드리기 전에 끝낸다.
for _arg in "$@"; do
    case "$_arg" in
        --force|-f) DEPLOY_FORCE=1 ;;
        --rebuild|--rebuild=*)
            echo "[dashboard deploy] FAIL: ${_arg} 는 지원하지 않는다 — 검증된 SHA 이미지는 재빌드하지 않는다(한 SHA 한 이미지). 새 이미지가 필요하면 새 승인 SHA 로 배포한다." >&2
            exit 1
            ;;
    esac
done
case "${DEPLOY_REBUILD:-0}" in
    ""|0) ;;
    *)
        echo "[dashboard deploy] FAIL: DEPLOY_REBUILD=${DEPLOY_REBUILD} 는 지원하지 않는다 — 검증된 SHA 이미지는 재빌드하지 않는다(한 SHA 한 이미지). 새 이미지가 필요하면 새 승인 SHA 로 배포한다." >&2
        exit 1
        ;;
esac
unset DEPLOY_REBUILD
DEPLOY_FORCE="${DEPLOY_FORCE:-0}"
DEPLOY_LOG_DIR="${STATE_DIR}/deploy-logs"
DEPLOY_LOG_FILE="${DEPLOY_LOG_DIR}/dashboard-deploy-$(date '+%Y%m%d-%H%M%S').log"
RELEASE_CONTEXT_DIR=""

mkdir -p "$DEPLOY_LOG_DIR"

if [ -x "/root/aads/aads-server/scripts/verify-bluegreen-release-contract.sh" ]; then
    /root/aads/aads-server/scripts/verify-bluegreen-release-contract.sh /root/aads/aads-server
else
    echo "[dashboard deploy] FAIL: global release contract verifier missing" >&2
    exit 1
fi

log() {
    local line
    line="[$(date '+%H:%M:%S')] $1"
    echo "$line"
    printf '%s\n' "$line" >> "$DEPLOY_LOG_FILE"
}

# 릴리스 코드 출처(SOURCE_DIR)와 공유 상태(STATE_DIR)의 역할을 검증한다.
# 더럽거나 오래된 공유 checkout 이 릴리스에 섞이는 것을 막는다: SOURCE_DIR 는 깨끗해야 하고,
# 릴리스 SHA 는 정확히 SOURCE_DIR 의 HEAD 여야 하며, 빌드는 커밋된 객체(git archive)만 쓴다.
verify_release_source() {
    local top head requested resolved dirty
    if [ ! -d "$STATE_DIR" ] || [ ! -w "$STATE_DIR" ]; then
        log "FAIL: STATE_DIR 를 쓸 수 없다 (${STATE_DIR})"
        return 1
    fi
    top="$(timeout 30 git -C "$SOURCE_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
    if [ -z "$top" ] || [ "$(cd "$top" 2>/dev/null && pwd -P)" != "$SOURCE_DIR" ]; then
        log "FAIL: deploy.sh 는 git 저장소 최상위에서 실행해야 한다 (SOURCE_DIR=${SOURCE_DIR}, toplevel=${top:-none})"
        return 1
    fi
    if ! dirty="$(timeout 60 git -C "$SOURCE_DIR" status --porcelain --untracked-files=normal 2>&1)"; then
        log "FAIL: SOURCE_DIR git status 조회 실패 — 릴리스 중단"
        return 1
    fi
    if [ -n "$dirty" ]; then
        log "FAIL: SOURCE_DIR 가 깨끗하지 않다 — 깨끗한 릴리스 worktree 에서 실행하라 (${SOURCE_DIR})"
        printf '%s\n' "$dirty" | head -10 | while IFS= read -r _l; do log "      ${_l:0:110}"; done
        return 1
    fi
    head="$(timeout 30 git -C "$SOURCE_DIR" rev-parse --verify 'HEAD^{commit}' 2>/dev/null || true)"
    if ! [[ "$head" =~ ^[0-9a-f]{40}$ ]]; then
        log "FAIL: SOURCE_DIR HEAD 를 확인할 수 없다"
        return 1
    fi
    requested="${AADS_RELEASE_SHA:-}"
    if [ -n "$requested" ]; then
        if ! [[ "$requested" =~ ^[0-9a-f]{7,40}$ ]]; then
            log "FAIL: AADS_RELEASE_SHA 형식이 올바르지 않다 (${requested})"
            return 1
        fi
        resolved="$(timeout 30 git -C "$SOURCE_DIR" rev-parse --verify "${requested}^{commit}" 2>/dev/null || true)"
        if [ "$resolved" != "$head" ]; then
            log "FAIL: AADS_RELEASE_SHA(${requested}) 가 SOURCE_DIR HEAD(${head:0:12}) 와 다르다"
            return 1
        fi
    else
        requested="${head:0:12}"
    fi
    # 빌드는 STATE_DIR 의 객체 저장소에서 git archive 로 이 커밋을 꺼낸다. 그 저장소에 없으면 다른 코드를 빌드할 수 없으니 중단한다.
    if ! timeout 30 git -C "$STATE_DIR" cat-file -e "${head}^{commit}" 2>/dev/null; then
        log "FAIL: 릴리스 커밋 ${head:0:12} 가 STATE_DIR 객체 저장소에 없다 — SOURCE_DIR 와 같은 저장소의 worktree 에서 실행하라"
        return 1
    fi
    export AADS_RELEASE_SHA="$requested"
    RELEASE_FULL_SHA="$head"
    log "릴리스 source 검증 완료: ${SOURCE_DIR} @ ${head:0:12} (state=${STATE_DIR})"
}

lock_value() {
    local key="$1"
    awk -F= -v key="$key" '$1 == key {print $2; exit}' "$LOCKFILE" 2>/dev/null || true
}

lock_pid() {
    local pid
    pid=$(lock_value "pid")
    if [ -z "$pid" ]; then
        pid=$(head -n 1 "$LOCKFILE" 2>/dev/null || true)
    fi
    case "$pid" in
        ''|*[!0-9]*) echo "" ;;
        *) echo "$pid" ;;
    esac
}

pid_cmdline() {
    local pid="$1"
    if [ -r "/proc/${pid}/cmdline" ]; then
        tr '\0' ' ' < "/proc/${pid}/cmdline" 2>/dev/null || true
    fi
}

pid_is_dashboard_deploy() {
    local pid="$1" cmdline
    cmdline=$(pid_cmdline "$pid")
    [[ "$cmdline" == *"deploy.sh"* && "$cmdline" == *"bash"* ]]
}

write_lock() {
    {
        printf 'pid=%s\n' "$$"
        printf 'started_at=%s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
        printf 'host=%s\n' "$(hostname 2>/dev/null || echo unknown)"
        printf 'cwd=%s\n' "$(pwd)"
        printf 'script=%s\n' "$0"
        printf 'log=%s\n' "$DEPLOY_LOG_FILE"
    } > "$LOCKFILE"
}

cleanup_lock() {
    local owner_pid
    owner_pid=$(lock_pid)
    if [ "$owner_pid" = "$$" ]; then
        rm -f "$LOCKFILE"
    fi
}

cleanup_release_context() {
    case "${RELEASE_CONTEXT_DIR:-}" in
        /tmp/aads-dashboard-release.*)
            rm -rf -- "$RELEASE_CONTEXT_DIR"
            ;;
    esac
    RELEASE_CONTEXT_DIR=""
}

cleanup_deploy() {
    if [ "$UPSTREAM_SWITCHED" = "true" ]; then
        revert_cutover "배포 중단(종료 트랩)" || true
    fi
    record_deploy_end
    cleanup_release_context
    cleanup_lock
}


# --- deploy_runs 중앙 원장 기록 헬퍼 (AADS-192) ---
DEPLOY_RUN_ID=""
DEPLOY_RESULT="failed"
# phase 는 "어디까지 갔는지"를 남긴다. 실패로 끝나면 이 값이 멈춘 단계가 된다.
DEPLOY_PHASE="initializing"
# Step 6 에서 active/standby 컨테이너의 image ID(sha256:…)를 채운다. 비어 있으면 NULL 로 기록한다.
DEPLOY_IMAGE_DIGEST=""
DEPLOY_STANDBY_DIGEST=""

_db_exec() {
    local out rc
    out=$(docker exec aads-postgres psql -U aads -d aads -q -t -A -c "$1" 2>&1) || rc=$?
    rc="${rc:-0}"
    if [ "$rc" -ne 0 ] || printf '%s' "$out" | grep -q '^ERROR:'; then
        printf '[db] 원장 기록 실패: %s\n' "$out" >> "$DEPLOY_LOG_FILE" 2>/dev/null || true
        return 1
    fi
    printf '%s' "$out"
    return 0
}

record_deploy_start() {
    local sha="${AADS_RELEASE_SHA:-unknown}"
    DEPLOY_RUN_ID=$(_db_exec "INSERT INTO deploy_runs(project,component,deploy_type,status,phase,release_sha,created_at,updated_at,phase_started_at,requested_at,request_source) VALUES('AADS','dashboard','bluegreen','running','${DEPLOY_PHASE}','${sha}',NOW(),NOW(),NOW(),NOW(),'deploy.sh') RETURNING id" || true)
    DEPLOY_RUN_ID="$(printf '%s' "${DEPLOY_RUN_ID}" | head -n 1 | tr -cd '0-9')"
    if [ -n "$DEPLOY_RUN_ID" ]; then
        log "[db] deploy_runs #${DEPLOY_RUN_ID} 시작 (sha=${sha})"
    else
        log "[db] 원장 기록 생략 — deploy_runs INSERT 실패 (배포는 계속 진행)"
    fi
    return 0
}

record_deploy_phase() {
    DEPLOY_PHASE="$1"
    [ -z "${DEPLOY_RUN_ID}" ] && return 0
    _db_exec "UPDATE deploy_runs SET phase='${DEPLOY_PHASE}', phase_started_at=NOW(), updated_at=NOW() WHERE id=${DEPLOY_RUN_ID}" >/dev/null || true
    return 0
}

# docker inspect {{.Image}} 형식(sha256:<64hex>)만 통과시킨다. 그 외 값은 빈 문자열(→ NULL).
_normalize_image_digest() {
    local v="${1:-}"
    if [[ "$v" =~ ^sha256:[0-9a-f]{64}$ ]]; then
        printf '%s' "$v"
    fi
    return 0
}

# 릴리스 계보 기록 — 실패해도 배포 결과를 바꾸지 않는다(로그만).
# 계보 INSERT 는 deploy_runs 가 success/completed 이고 image_digest = standby_digest 일 때만 들어가므로
# 반드시 성공 UPDATE 이후에 호출한다. 릴리스 커밋은 깨끗한 SOURCE_DIR 의 HEAD 이므로 계보도 SOURCE_DIR 기준으로 기록한다.
record_dashboard_provenance() {
    local run_id="$1"
    local script="${AADS_PROVENANCE_SCRIPT:-}"
    local ref="${AADS_RELEASE_SHA:-}"
    local tmp_script=""
    if [ -z "$ref" ] || [ "$ref" = "unknown" ]; then
        log "[provenance] 건너뜀 — 릴리스 SHA 미확정"
        return 0
    fi
    # 호스트 checkout 은 origin/main 과 갈라져 있을 수 있어 pull 하지 않고 origin/main 의 스크립트 사본을 직접 꺼내 실행한다.
    if [ -z "$script" ]; then
        local rel_path="scripts/record-release-provenance.sh"
        tmp_script="$(mktemp "${TMPDIR:-/tmp}/record-release-provenance.XXXXXX" 2>/dev/null || true)"
        if [ -n "$tmp_script" ] \
            && timeout 60 git -C "$COMPOSE_DIR" fetch -q origin >> "$DEPLOY_LOG_FILE" 2>&1 \
            && git -C "$COMPOSE_DIR" show "origin/main:${rel_path}" > "$tmp_script" 2>> "$DEPLOY_LOG_FILE" \
            && [ -s "$tmp_script" ] \
            && chmod +x "$tmp_script"; then
            script="$tmp_script"
        else
            log "[provenance] WARN: origin/main 스크립트 사용 불가 — 로컬 사본 사용"
            [ -z "$tmp_script" ] || rm -f "$tmp_script"
            tmp_script=""
            script="${COMPOSE_DIR}/${rel_path}"
        fi
    fi
    if [ ! -x "$script" ]; then
        log "[provenance] 건너뜀 — 스크립트 없음: ${script}"
        [ -z "$tmp_script" ] || rm -f "$tmp_script"
        return 0
    fi
    if timeout 120 "$script" \
        --repo "$SOURCE_DIR" \
        --deploy-run-id "$run_id" \
        --project AADS \
        --component dashboard \
        --release-ref "$ref" >> "$DEPLOY_LOG_FILE" 2>&1; then
        log "[provenance] deploy_runs #${run_id} 릴리스 계보 기록 완료"
    else
        log "[provenance] WARN: 릴리스 계보 기록 실패 (배포는 성공 유지)"
    fi
    [ -z "$tmp_script" ] || rm -f "$tmp_script"
    return 0
}

record_deploy_end() {
    [ -z "${DEPLOY_RUN_ID}" ] && return 0
    local _id="$DEPLOY_RUN_ID"
    DEPLOY_RUN_ID=""
    local _msg
    _msg=$(tail -n 1 "$DEPLOY_LOG_FILE" 2>/dev/null | tr -d "'" | head -c 200 || true)
    [ -n "$_msg" ] || _msg="dashboard deploy failed"
    if [ "$DEPLOY_RESULT" = "success" ]; then
        local _img _stb _gate=""
        _img="$(_normalize_image_digest "${DEPLOY_IMAGE_DIGEST:-}")"
        _stb="$(_normalize_image_digest "${DEPLOY_STANDBY_DIGEST:-}")"
        # fail closed: digest 공백/형식오류/불일치 또는 300초 감시 미달이면 성공 원장·계보를 쓰지 않는다.
        if [ -z "$_img" ] || [ -z "$_stb" ]; then
            _gate="image digest 확인 실패 (active='${DEPLOY_IMAGE_DIGEST:-}', standby='${DEPLOY_STANDBY_DIGEST:-}')"
        elif [ "$_img" != "$_stb" ]; then
            _gate="active/standby image digest 불일치"
        elif ! [[ "${DEPLOY_MONITOR_ELAPSED_SECONDS:-0}" =~ ^[0-9]+$ ]] || [ "${DEPLOY_MONITOR_ELAPSED_SECONDS:-0}" -lt "$MONITOR_MIN_SECONDS" ]; then
            _gate="P0/P1 감시 ${DEPLOY_MONITOR_ELAPSED_SECONDS:-0}초 < ${MONITOR_MIN_SECONDS}초"
        fi
        if [ -n "$_gate" ]; then
            log "[db] FAIL: 성공 기록 차단 — ${_gate}"
            _db_exec "UPDATE deploy_runs SET status='failed', phase='${DEPLOY_PHASE}', phase_completed_at=NOW(), updated_at=NOW(), error_summary='release certification gate: ${_gate//\'/}' WHERE id=${_id}" >/dev/null || true
            return 0
        fi
        if _db_exec "UPDATE deploy_runs SET status='success', phase='completed', phase_completed_at=NOW(), updated_at=NOW(), image_digest='${_img}', standby_digest='${_stb}' WHERE id=${_id}" >/dev/null; then
            log "[db] deploy_runs #${_id} 성공 (image=${_img}, standby=${_stb}, monitor=${DEPLOY_MONITOR_ELAPSED_SECONDS}s)"
            record_dashboard_provenance "$_id" || true
        else
            log "[db] WARN: deploy_runs #${_id} 성공 UPDATE 실패 — 계보 기록 생략"
        fi
    else
        _db_exec "UPDATE deploy_runs SET status='failed', phase='${DEPLOY_PHASE}', phase_completed_at=NOW(), updated_at=NOW(), error_summary='${_msg}' WHERE id=${_id}" >/dev/null || true
        log "[db] deploy_runs #${_id} 실패 (${_msg})"
    fi
    return 0
}
# --- end deploy_runs 헬퍼 ---

# 릴리스 이미지 라벨. 같은 SHA 태그 이미지를 재사용할 때 이 라벨로 출처를 검증한다.
RELEASE_LABEL_KEY="aads.release.sha"

release_image_field() {
    timeout 30 docker image inspect "aads-dashboard:${AADS_RELEASE_SHA}" --format "$1" 2>/dev/null || true
}

# 같은 SHA 태그 이미지 상태 조회. 0=있음(IMAGE_PROBE_ID/LABEL 채움), 1=없음, 2=확인 불가.
# "No such image" 가 명시된 경우만 '없음' 이다. 데몬 오류·타임아웃·형식 오류는 '없음' 이 아니라 확인 불가다.
IMAGE_PROBE_ID=""
IMAGE_PROBE_LABEL=""
probe_release_image() {
    local out rc=0
    IMAGE_PROBE_ID=""
    IMAGE_PROBE_LABEL=""
    out="$(timeout 30 docker image inspect "aads-dashboard:${AADS_RELEASE_SHA}" --format '{{.Id}}' 2>&1)" || rc=$?
    if [ "$rc" -ne 0 ]; then
        if printf '%s' "$out" | grep -qi 'no such image'; then
            return 1
        fi
        return 2
    fi
    IMAGE_PROBE_ID="$(_normalize_image_digest "$out")"
    [ -n "$IMAGE_PROBE_ID" ] || return 2
    IMAGE_PROBE_LABEL="$(release_image_field "{{with .Config.Labels}}{{index . \"${RELEASE_LABEL_KEY}\"}}{{end}}")"
    return 0
}

# 한 SHA 한 이미지. 같은 SHA 이미지가 있고 라벨이 이 릴리스의 전체 SHA 와 일치하면 --force 여도 재사용만 한다.
# 이미지가 확실히 없을 때만 정확히 한 번 빌드한다. 태그가 있는데 라벨이 다르거나 없거나, 상태를 확인할 수 없으면
# 덮어쓰지 않고 중단한다(fail closed) — 새 이미지는 새 승인 SHA 로만 만든다.
ensure_release_image() {
    local id label probe_rc=0
    probe_release_image || probe_rc=$?
    case "$probe_rc" in
        0)
            if [ "$IMAGE_PROBE_LABEL" = "$RELEASE_FULL_SHA" ]; then
                RELEASE_IMAGE_ID="$IMAGE_PROBE_ID"
                log "OK: 검증된 release 이미지 재사용 — 재빌드하지 않음 (aads-dashboard:${AADS_RELEASE_SHA}, ${IMAGE_PROBE_ID})"
                return 0
            fi
            log "FAIL: 기존 aads-dashboard:${AADS_RELEASE_SHA} 의 출처 라벨이 이 릴리스와 맞지 않는다 (label='${IMAGE_PROBE_LABEL}', expected='${RELEASE_FULL_SHA}') — 덮어쓰지 않고 중단한다. 새로운 승인 SHA 로 배포해야 한다."
            return 1
            ;;
        1) ;;
        *)
            log "FAIL: aads-dashboard:${AADS_RELEASE_SHA} 이미지 상태를 확인할 수 없다 — 덮어쓸 위험이 있어 빌드하지 않고 중단한다. 새로운 승인 SHA 로 배포해야 한다."
            return 1
            ;;
    esac
    build_release_image || return 1
    id="$(_normalize_image_digest "$(release_image_field '{{.Id}}')")"
    label="$(release_image_field "{{with .Config.Labels}}{{index . \"${RELEASE_LABEL_KEY}\"}}{{end}}")"
    if [ -z "$id" ] || [ "$label" != "$RELEASE_FULL_SHA" ]; then
        log "FAIL: 빌드한 이미지 검증 실패 (id='${id}', label='${label}')"
        return 1
    fi
    RELEASE_IMAGE_ID="$id"
    log "OK: release 이미지 빌드·검증 완료 (${id})"
}

build_release_image() {
    if [ "$NGINX_LOCK_HELD" = "true" ]; then
        log "FAIL: nginx 전환 락을 잡은 채 빌드할 수 없다"
        return 1
    fi
    cleanup_release_context
    if ! RELEASE_CONTEXT_DIR="$(mktemp -d /tmp/aads-dashboard-release.XXXXXX)"; then
        log "FAIL: release context 생성 실패"
        return 1
    fi
    if ! git -C "$STATE_DIR" rev-parse --verify "${AADS_RELEASE_SHA}^{commit}" >/dev/null 2>&1; then
        log "FAIL: release SHA를 로컬 저장소에서 확인할 수 없습니다 (${AADS_RELEASE_SHA})"
        return 1
    fi
    # 커밋된 객체만 읽는다(작업트리 파일 불포함). verify_release_source 가 이 SHA 가 깨끗한 SOURCE_DIR 의 HEAD 이고
    # 같은 객체 저장소임을 이미 보장했다.
    if ! git -C "$STATE_DIR" archive --format=tar "$AADS_RELEASE_SHA" | tar -xf - -C "$RELEASE_CONTEXT_DIR"; then
        log "FAIL: release archive/extraction 실패"
        cleanup_release_context
        return 1
    fi
    if [ -f "${STATE_DIR}/.env.local" ]; then
        if ! install -m 600 "${STATE_DIR}/.env.local" "${RELEASE_CONTEXT_DIR}/.env.local"; then
            log "FAIL: release env install 실패"
            cleanup_release_context
            return 1
        fi
    fi
    log "clean release context: ${RELEASE_CONTEXT_DIR} (release=${AADS_RELEASE_SHA})"

    # 같은 이미지를 동시에 빌드하지 않는다.
    #
    # BuildKit 은 동일한 빌드 단계를 병행 빌드 간에 공유한다. 한쪽을 취소하면
    # 다른 쪽도 context canceled 로 함께 죽는다. 2026-09-14 실제로 그렇게
    # deploy_runs #414 를 날렸고, 규칙을 AGENTS.md 에 써넣은 뒤 같은 날 또
    # 어겼다. 문서 규칙은 지켜지지 않는다고 가정하고 여기서 막는다.
    # 실행 파일이 docker 인 프로세스만 본다. pgrep -f 는 같은 문자열을 담은
    # 셸 명령까지 잡아서, 조회하는 쪽이 자기 자신을 빌드로 오인한다
    # (2026-09-14 이 함정에 여러 번 빠졌다).
    local _busy
    _busy=$(ps -eo pid=,comm=,args= 2>/dev/null \
            | awk '$2 == "docker" && /build --tag aads-dashboard:/ {print}' | head -3)
    if [ -n "$_busy" ]; then
        log "FAIL: 같은 이미지를 빌드 중인 프로세스가 있다. 끝난 뒤 다시 시도하라."
        while IFS= read -r _l; do
            [ -n "$_l" ] && log "      ${_l:0:110}"
        done <<< "$_busy"
        return 1
    fi

    local build_rc=0
    timeout 2700 docker build --tag "aads-dashboard:${AADS_RELEASE_SHA}" \
        --label "${RELEASE_LABEL_KEY}=${RELEASE_FULL_SHA}" "$RELEASE_CONTEXT_DIR" || build_rc=$?
    cleanup_release_context
    if [ "$build_rc" -ne 0 ]; then
        log "FAIL: release image build 실패 (exit=${build_rc})"
        return "$build_rc"
    fi
}

if ! verify_release_source; then
    exit 1
fi

if [ -f "$LOCKFILE" ]; then
    LOCK_PID=$(lock_pid)
    LOCK_STARTED_AT=$(lock_value "started_at")
    LOCK_LOG=$(lock_value "log")
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null && pid_is_dashboard_deploy "$LOCK_PID"; then
        log "FAIL: 대시보드 배포가 이미 진행 중입니다 (PID=${LOCK_PID}, started_at=${LOCK_STARTED_AT:-unknown}, log=${LOCK_LOG:-unknown})"
        exit 1
    fi
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
        log "WARN: deploy.sh가 아닌 살아있는 PID의 stale lock 제거 (PID=${LOCK_PID}, cmdline=$(pid_cmdline "$LOCK_PID"))"
    else
        log "WARN: 종료된 PID의 stale dashboard deploy lock 제거 (PID=${LOCK_PID:-unknown}, started_at=${LOCK_STARTED_AT:-unknown}, log=${LOCK_LOG:-unknown})"
    fi
    rm -f "$LOCKFILE"
fi
write_lock
trap cleanup_deploy EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
log "배포 로그: ${DEPLOY_LOG_FILE}"

# nginx upstream is shared by backend and dashboard blue-green deploys.
# The shared lock protects only the nginx cutover. Builds and health checks do
# not mutate shared routing and must not block unrelated API/dashboard builds.
NGINX_SWITCH_LOCK="/tmp/aads-nginx-upstream.lock"
exec 8>"$NGINX_SWITCH_LOCK"
acquire_nginx_switch_lock() {
    if [ "$NGINX_LOCK_HELD" = "true" ]; then return 0; fi
    if ! flock -w 300 8; then
        log "FAIL: nginx upstream 공통 락 획득 실패. 다른 배포가 전환 중입니다."
        return 1
    fi
    NGINX_LOCK_HELD=true
    log "OK: nginx 전환 락 획득"
}

release_nginx_switch_lock() {
    if [ "$NGINX_LOCK_HELD" = "true" ]; then
        flock -u 8
        NGINX_LOCK_HELD=false
        log "OK: nginx 전환 락 해제"
    fi
}

# 감시 설정 검증. 감시를 줄이는 값(rounds*interval < 300)은 조용히 보정하지 않고 거부한다.
MONITOR_INTERVAL=60
MONITOR_DURATION=300
monitor_config() {
    local interval="${AADS_DASHBOARD_MONITOR_INTERVAL_SECONDS:-60}"
    local rounds="${AADS_DASHBOARD_MONITOR_ROUNDS:-5}"
    if ! [[ "$interval" =~ ^[0-9]+$ ]] || ! [[ "$rounds" =~ ^[0-9]+$ ]]; then
        log "FAIL: 모니터링 설정이 숫자가 아니다 (interval='${interval}', rounds='${rounds}')"
        return 1
    fi
    interval=$((10#$interval))
    rounds=$((10#$rounds))
    if [ "$interval" -lt 1 ] || [ "$interval" -gt "$MONITOR_MAX_INTERVAL" ]; then
        log "FAIL: 모니터링 interval 은 1..${MONITOR_MAX_INTERVAL}초여야 한다 (${interval})"
        return 1
    fi
    if [ $((rounds * interval)) -lt "$MONITOR_MIN_SECONDS" ]; then
        log "FAIL: 모니터링 단축 거부 — rounds*interval=$((rounds * interval))초 < ${MONITOR_MIN_SECONDS}초"
        return 1
    fi
    if [ $((rounds * interval)) -gt "$MONITOR_MAX_SECONDS" ]; then
        log "FAIL: 모니터링 설정이 상한을 넘는다 — $((rounds * interval))초 > ${MONITOR_MAX_SECONDS}초"
        return 1
    fi
    MONITOR_INTERVAL="$interval"
    MONITOR_DURATION=$((rounds * interval))
}

log "릴리스 SHA: ${AADS_RELEASE_SHA} (${RELEASE_FULL_SHA})"
record_deploy_start

# 빌드·전환 전에 감시 설정을 검증한다. 단축 설정이면 아무것도 건드리지 않고 중단한다.
if ! monitor_config; then
    exit 1
fi
if [ "${AADS_DASHBOARD_STOP_PREVIOUS:-false}" = "true" ]; then
    log "FAIL: AADS_DASHBOARD_STOP_PREVIOUS=true 는 지원하지 않는다 — same-digest standby 동기화가 필수다"
    exit 1
fi

# 마커 두 개를 각각 임시 파일 → mv 로 쓴다. 어느 쪽이든 실패하면 1 을 돌려준다(호출 측이 이전 마커를 복원한다).
write_active_state() {
    local container="$1" port="$2" name value file tmp
    for name in container port; do
        if [ "$name" = "container" ]; then value="$container"; else value="$port"; fi
        file="${STATE_DIR}/.active_${name}"
        tmp="${file}.new.$$"
        printf '%s\n' "$value" > "$tmp" || { rm -f "$tmp"; return 1; }
        mv -f -- "$tmp" "$file" || { rm -f "$tmp"; return 1; }
    done
}

# 전환 전 활성 마커 스냅샷/복원. 바이트 단위로 보존하며(끝 개행 포함), 원래 없던 마커는 없던 상태로 되돌린다.
# 일반 파일이 아닌 마커(디렉터리·심볼릭 링크 등)는 정확히 복원할 수 없으므로 전환 전에 거부한다.
MARKER_PRESENT_container=false
MARKER_CONTENT_container=""
MARKER_PRESENT_port=false
MARKER_CONTENT_port=""
snapshot_marker() {
    local key="$1" file="${STATE_DIR}/.active_$1" v
    if [ -f "$file" ] && [ ! -L "$file" ]; then
        v="$(cat -- "$file" && printf x)" || return 1
        printf -v "MARKER_PRESENT_${key}" '%s' true
        printf -v "MARKER_CONTENT_${key}" '%s' "${v%x}"
    elif [ -e "$file" ] || [ -L "$file" ]; then
        log "FAIL: 활성 상태 마커가 일반 파일이 아니다 — 정확히 복원할 수 없어 중단 (${file})"
        return 1
    else
        printf -v "MARKER_PRESENT_${key}" '%s' false
        printf -v "MARKER_CONTENT_${key}" '%s' ""
    fi
}

snapshot_active_state() {
    snapshot_marker container || return 1
    snapshot_marker port || return 1
}

restore_marker() {
    local key="$1" file="${STATE_DIR}/.active_$1" present_var="MARKER_PRESENT_$1" content_var="MARKER_CONTENT_$1" tmp cur
    tmp="${file}.restore.$$"
    if [ "${!present_var}" = "true" ]; then
        if [ -f "$file" ] && [ ! -L "$file" ]; then
            cur="$(cat -- "$file" && printf x)" || cur=""
            if [ "$cur" = "${!content_var}x" ]; then
                return 0
            fi
        fi
        printf '%s' "${!content_var}" > "$tmp" || { rm -f "$tmp"; return 1; }
        mv -f -- "$tmp" "$file" || { rm -f "$tmp"; return 1; }
        cur="$(cat -- "$file" && printf x)" || return 1
        [ "$cur" = "${!content_var}x" ] || return 1
    else
        rm -f -- "$file" || return 1
        [ ! -e "$file" ] && [ ! -L "$file" ]
    fi
}

restore_active_state() {
    local rc=0
    restore_marker container || { log "CRITICAL: 활성 상태 마커(.active_container) 복원 실패"; rc=1; }
    restore_marker port || { log "CRITICAL: 활성 상태 마커(.active_port) 복원 실패"; rc=1; }
    return "$rc"
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
        if wget -q --spider --timeout=10 --tries=1 "$url" 2>/dev/null; then
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
        | awk -F= '$1=="AADS_RELEASE_SHA" && !seen {print $2; seen=1}'
}

container_image_id() {
    timeout 30 docker inspect "$1" --format '{{.Image}}' 2>/dev/null || true
}

# active/standby 가 같은 유효 digest 이고 방금 검증한 release 이미지와 같은지 확인한다.
# 조회 실패·공백·형식오류·불일치는 모두 실패다(fail closed). 통과한 값만 원장 변수에 담는다.
verify_release_digests() {
    local release_id="$1" target_container="$2" prev_container="$3" t p
    t="$(_normalize_image_digest "$(container_image_id "$target_container")")"
    p="$(_normalize_image_digest "$(container_image_id "$prev_container")")"
    if [ -z "$t" ] || [ -z "$p" ]; then
        log "FAIL: image digest 조회 실패 또는 공백/형식 오류 (active=${target_container}:'${t}', standby=${prev_container}:'${p}')"
        return 1
    fi
    if [ "$t" != "$p" ]; then
        log "FAIL: active/standby image digest 불일치 (active=${t}, standby=${p})"
        return 1
    fi
    if [ -z "$release_id" ] || [ "$t" != "$release_id" ]; then
        log "FAIL: 컨테이너 digest 가 검증된 release 이미지와 다르다 (container=${t}, release='${release_id}')"
        return 1
    fi
    DEPLOY_IMAGE_DIGEST="$t"
    DEPLOY_STANDBY_DIGEST="$p"
}

sync_dashboard_standby() {
    local slot="$1" service="$2" container="$3" health_url="$4"
    local args=(-f "$COMPOSE_FILE")

    if [ "$slot" = "green" ]; then
        args+=(--profile green)
    fi

    log "Step 5: 이전 슬롯 standby 동기화 (${container})"
    remove_container_if_foreign "$container" "$service"
    docker compose "${args[@]}" up -d --no-build --no-deps "$service" || return 1
    if wait_health "$health_url" "$MAX_WAIT" "standby-${slot}"; then
        log "OK: 이전 슬롯 standby 동기화 완료 (${container})"
        return 0
    fi
    log "FAIL: 이전 슬롯 standby 동기화 후 헬스체크 실패 (${container})"
    return 1
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
    tmp=$(mktemp) || return 1
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
    local py_rc=$?
    if [ "$py_rc" -ne 0 ]; then
        rm -f -- "$tmp"
        return 1
    fi
    mv -- "$tmp" "$NGINX_UPSTREAM" || { rm -f -- "$tmp"; return 1; }
}

file_sum() {
    local sum
    sum="$(sha256sum -- "$1" 2>/dev/null | awk '{print $1}')" || return 1
    [[ "$sum" =~ ^[0-9a-f]{64}$ ]] || return 1
    printf '%s' "$sum"
}

# 이번 실행에서 확보·검증한 백업의 체크섬. 비어 있으면 "검증된 이번 실행 백업 없음" 이다.
UPSTREAM_BACKUP_SUM=""
SOURCE_BACKUP_SUM=""
SOURCE_BACKUP_PRESENT=false
ROLLBACK_ROUTE_OK=false

# 이번 실행의 백업을 새로 만들고 각 단계를 검증한다. 어느 단계든 실패하면 부분 산출물을 지우고 1 을 돌려준다.
# 이전 실행의 .bak 은 재사용하지 않는다: 지우지 않고 .stale 로 치워 두어(수동 복구용) .bak 이름으로 남지 않게 한다.
backup_upstream() {
    local up_bak="${NGINX_UPSTREAM}.dashboard.bak" src_bak="${NGINX_UPSTREAM_SOURCE}.dashboard.bak" f
    UPSTREAM_BACKUP_SUM=""
    SOURCE_BACKUP_SUM=""
    SOURCE_BACKUP_PRESENT=false
    for f in "$up_bak" "$src_bak"; do
        if [ -e "$f" ] || [ -L "$f" ]; then
            mv -f -- "$f" "${f}.stale" || { log "FAIL: 이전 실행의 stale 백업을 치우지 못했다 (${f})"; return 1; }
        fi
    done
    if [ ! -f "$NGINX_UPSTREAM" ]; then
        log "FAIL: nginx upstream 설정 파일이 없다 (${NGINX_UPSTREAM})"
        return 1
    fi
    if ! cp -- "$NGINX_UPSTREAM" "$up_bak" || ! cmp -s -- "$NGINX_UPSTREAM" "$up_bak"; then
        log "FAIL: nginx upstream 백업 생성·검증 실패 (${up_bak})"
        rm -f -- "$up_bak" "$src_bak"
        return 1
    fi
    UPSTREAM_BACKUP_SUM="$(file_sum "$up_bak")" || {
        log "FAIL: nginx upstream 백업 체크섬 계산 실패"
        rm -f -- "$up_bak" "$src_bak"
        UPSTREAM_BACKUP_SUM=""
        return 1
    }
    if [ -f "$NGINX_UPSTREAM_SOURCE" ]; then
        if ! cp -- "$NGINX_UPSTREAM_SOURCE" "$src_bak" || ! cmp -s -- "$NGINX_UPSTREAM_SOURCE" "$src_bak"; then
            log "FAIL: source upstream 백업 생성·검증 실패 (${src_bak})"
            rm -f -- "$up_bak" "$src_bak"
            UPSTREAM_BACKUP_SUM=""
            return 1
        fi
        SOURCE_BACKUP_SUM="$(file_sum "$src_bak")" || {
            log "FAIL: source upstream 백업 체크섬 계산 실패"
            rm -f -- "$up_bak" "$src_bak"
            UPSTREAM_BACKUP_SUM=""
            SOURCE_BACKUP_SUM=""
            return 1
        }
        SOURCE_BACKUP_PRESENT=true
    fi
    log "OK: 이번 실행 nginx upstream 백업 확보·검증 완료"
}

# 이번 실행에서 검증한 백업을 target 으로 되돌리고 체크섬으로 확인한다. 백업 부재·변조·mv 실패·복원 후 불일치는 모두 실패다.
restore_from_backup() {
    local target="$1" want="$2" bak="$1.dashboard.bak" got
    if ! [[ "$want" =~ ^[0-9a-f]{64}$ ]]; then
        log "CRITICAL: 이번 실행에서 검증된 백업이 없어 복원할 수 없다 (${target})"
        return 1
    fi
    if [ ! -f "$bak" ]; then
        log "CRITICAL: 백업 파일이 없어 복원할 수 없다 (${bak})"
        return 1
    fi
    got="$(file_sum "$bak")" || got=""
    if [ "$got" != "$want" ]; then
        log "CRITICAL: 백업 파일이 확보 시점과 다르다 — 복원하지 않는다 (${bak})"
        return 1
    fi
    mv -f -- "$bak" "$target" || { log "CRITICAL: 백업 복원 mv 실패 (${bak} -> ${target})"; return 1; }
    got="$(file_sum "$target")" || got=""
    if [ "$got" != "$want" ]; then
        log "CRITICAL: 복원 후 내용이 백업과 다르다 (${target})"
        return 1
    fi
}

# route(live upstream)와 source 사본을 모두 되돌린다. 둘 중 하나라도 실패하면 1.
rollback_upstream() {
    local rc=0
    ROLLBACK_ROUTE_OK=false
    if restore_from_backup "$NGINX_UPSTREAM" "$UPSTREAM_BACKUP_SUM"; then
        ROLLBACK_ROUTE_OK=true
    else
        rc=1
    fi
    if [ "$SOURCE_BACKUP_PRESENT" = "true" ]; then
        restore_from_backup "$NGINX_UPSTREAM_SOURCE" "$SOURCE_BACKUP_SUM" || rc=1
    fi
    return "$rc"
}

sync_upstream_source() {
    if [ -f "$NGINX_UPSTREAM_SOURCE" ]; then
        cp -- "$NGINX_UPSTREAM" "$NGINX_UPSTREAM_SOURCE" || return 1
        cmp -s -- "$NGINX_UPSTREAM" "$NGINX_UPSTREAM_SOURCE" || return 1
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

# 단조 시계(centisecond). 벽시계 변경(NTP, 수동 변경)의 영향을 받지 않는다. 읽지 못하면 실패다.
monotonic_centiseconds() {
    local up
    read -r up _ < /proc/uptime || return 1
    [[ "$up" =~ ^[0-9]+(\.[0-9]+)?$ ]] || return 1
    awk -v u="$up" 'BEGIN { printf "%d\n", u * 100 }'
}

monitor_sleep() {
    sleep "$1"
}

# 한 회차 점검: external/blue/green health, 컨테이너 실행 상태, 컨테이너 digest, P0/P1 로그.
# 어느 하나라도 조회에 실패하면(타임아웃 포함) 통과가 아니라 실패다.
monitor_probe() {
    local started_at="$1" expected_digest="$2" label="$3" container state image logs hits
    if ! wget -q --spider --timeout=10 --tries=1 "$HEALTH_EXTERNAL" 2>/dev/null; then
        log "FAIL: post-cutover external health 실패 (${label})"
        return 1
    fi
    if ! wget -q --spider --timeout=10 --tries=1 "$HEALTH_BLUE" 2>/dev/null; then
        log "FAIL: post-cutover blue health 실패 (${label})"
        return 1
    fi
    if ! wget -q --spider --timeout=10 --tries=1 "$HEALTH_GREEN" 2>/dev/null; then
        log "FAIL: post-cutover green health 실패 (${label})"
        return 1
    fi
    for container in "$BLUE_CONTAINER" "$GREEN_CONTAINER"; do
        if ! state="$(timeout 30 docker inspect "$container" --format '{{.State.Status}}' 2>/dev/null)" || [ "$state" != "running" ]; then
            log "FAIL: post-cutover 컨테이너 상태 조회 실패 또는 비정상 (${container}, state='${state:-}')"
            return 1
        fi
        image="$(_normalize_image_digest "$(container_image_id "$container")")"
        if [ -z "$image" ] || [ "$image" != "$expected_digest" ]; then
            log "FAIL: post-cutover 컨테이너 digest 조회 실패 또는 불일치 (${container}, got='${image}', expected='${expected_digest}')"
            return 1
        fi
        if ! logs="$(timeout 30 docker logs --since "$started_at" "$container" 2>&1)"; then
            log "FAIL: post-cutover 로그 조회 실패 (${container})"
            return 1
        fi
        if hits="$(printf '%s\n' "$logs" \
            | grep -Eai 'uncaught|unhandled|fatal|panic|out of memory|ENOMEM|EADDRINUSE|ECONNREFUSED|failed to start|cannot find module|TypeError|ReferenceError|SyntaxError|HTTP 500|status=500')"; then
            log "FAIL: post-cutover P0/P1 로그 감지 (${container})"
            printf '%s\n' "$hits" | tail -20 | tee -a "$DEPLOY_LOG_FILE"
            return 1
        fi
    done
    log "OK: post-cutover monitor ${label} external/blue/green health·digest·로그 정상"
}

# 5분 P0/P1 감시. 회차 수가 아니라 단조 시계의 실제 경과시간으로 종료를 결정한다.
# 마지막 점검은 경과 >= 필요시간 이후에 수행되고, 성공 시에만 DEPLOY_MONITOR_ELAPSED_SECONDS 를 채운다.
monitor_post_cutover() {
    local started_at="$1" expected_digest="${2:-}"
    local start now last elapsed required remaining step iter=0 max_iter=2000
    DEPLOY_MONITOR_ELAPSED_SECONDS=0
    monitor_config || return 1
    if [ -z "$(_normalize_image_digest "$expected_digest")" ]; then
        log "FAIL: 모니터링 기준 digest 가 유효하지 않다 ('${expected_digest}')"
        return 1
    fi
    required=$((MONITOR_DURATION * 100))
    if ! start="$(monotonic_centiseconds)"; then
        log "FAIL: 단조 시계를 읽을 수 없다 — 모니터링 불가"
        return 1
    fi
    last="$start"
    log "Step 8: ${MONITOR_DURATION}초 P0/P1 모니터링 시작 (since=${started_at}, interval=${MONITOR_INTERVAL}s, 단조시계 기준)"
    while :; do
        iter=$((iter + 1))
        if [ "$iter" -gt "$max_iter" ]; then
            log "FAIL: 모니터링 반복 상한 초과 — 시계가 진행하지 않는다"
            return 1
        fi
        if ! now="$(monotonic_centiseconds)" || ! [[ "$now" =~ ^[0-9]+$ ]]; then
            log "FAIL: 단조 시계 조회 실패 — 모니터링 중단"
            return 1
        fi
        if [ "$now" -lt "$last" ]; then
            log "FAIL: 단조 시계가 뒤로 갔다 — 모니터링 중단"
            return 1
        fi
        last="$now"
        elapsed=$((now - start))
        if ! monitor_probe "$started_at" "$expected_digest" "t+$((elapsed / 100))s"; then
            return 1
        fi
        if [ "$elapsed" -ge "$required" ]; then
            break
        fi
        remaining=$(((required - elapsed + 99) / 100))
        step="$MONITOR_INTERVAL"
        if [ "$remaining" -lt "$step" ]; then
            step="$remaining"
        fi
        monitor_sleep "$step"
    done
    DEPLOY_MONITOR_ELAPSED_SECONDS=$((elapsed / 100))
    log "OK: ${DEPLOY_MONITOR_ELAPSED_SECONDS}초 P0/P1 모니터링 통과 (최종 점검은 ${MONITOR_DURATION}초 이후)"
}

# 컷오버 실패/중단 시 이전 상태(route·source 사본·활성 마커)를 복구한다. 락을 잡은 채 호출해도, 락이 없어도 안전하다.
# 백업·route·source·마커를 모두 정확히 되돌리고 nginx test/reload 까지 통과했을 때만 0 과 "복구 완료" 를 낸다.
# 하나라도 실패하면 CRITICAL 을 남기고 1 을 돌려준다. 어떤 경우에도 성공 원장/계보로 이어지지 않는다.
revert_cutover() {
    local reason="${1:-cutover 실패}" ok=true
    log "FAIL: ${reason} — upstream 롤백"
    rollback_upstream || ok=false
    restore_active_state || ok=false
    if [ "$ROLLBACK_ROUTE_OK" = "true" ]; then
        if ! nginx_test || ! nginx_reload; then
            log "CRITICAL: 이전 nginx route 복구 후 nginx test/reload 실패"
            ok=false
        fi
    else
        log "CRITICAL: nginx route 파일을 복원하지 못해 reload 하지 않는다"
    fi
    UPSTREAM_SWITCHED=false
    release_nginx_switch_lock
    if [ "$ok" = "true" ]; then
        log "OK: 이전 nginx route 복구 완료"
        return 0
    fi
    log "CRITICAL: 이전 상태 복구 실패 — 수동 확인 필요 (route/source/marker, 남은 *.dashboard.bak 보존)"
    return 1
}

# 후보 헬스 통과 이후의 짧은 nginx 전환. 락은 라우팅 변경~routed health 확인 구간에서만 잡는다.
# 이 함수는 `if ! perform_cutover` 문맥에서 호출되어 errexit 가 꺼져 있다 — 모든 필수 단계를 명시적으로 검사한다.
perform_cutover() {
    local target_slot="$1" target_container="$2" target_port="$3"
    acquire_nginx_switch_lock || return 1
    if ! backup_upstream; then
        log "FAIL: 이번 실행의 nginx upstream 백업을 확보하지 못했다 — nginx 설정/route/marker 를 건드리지 않고 중단"
        release_nginx_switch_lock
        return 1
    fi
    if ! snapshot_active_state; then
        log "FAIL: 활성 상태 마커 스냅샷 실패 — nginx 설정/route/marker 를 건드리지 않고 중단"
        release_nginx_switch_lock
        return 1
    fi
    UPSTREAM_SWITCHED=true
    if ! switch_dashboard_upstream "$target_slot"; then
        revert_cutover "upstream 수정 실패" || true
        return 1
    fi
    if ! verify_upstream_shape || ! nginx_test; then
        revert_cutover "nginx 설정 검증 실패" || true
        return 1
    fi
    if ! nginx_reload; then
        revert_cutover "nginx reload 실패" || true
        return 1
    fi
    if ! sync_upstream_source; then
        revert_cutover "source upstream 동기화 실패" || true
        return 1
    fi
    log "OK: nginx reload 완료"
    if ! wait_health "$HEALTH_EXTERNAL" 30 "external(${target_slot})"; then
        revert_cutover "routed(외부) 헬스체크 실패" || true
        return 1
    fi
    if [ "$(current_active_slot)" != "$target_slot" ]; then
        revert_cutover "upstream 활성 슬롯이 ${target_slot} 와 다르다" || true
        return 1
    fi
    if ! write_active_state "$target_container" "$target_port"; then
        revert_cutover "활성 상태 마커 기록 실패" || true
        return 1
    fi
    UPSTREAM_SWITCHED=false
    release_nginx_switch_lock
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

# Step 0.1: 이미 그 릴리스가 돌고 있으면 빌드하지 않는다.
#
# 2026-09-14 하루에만 같은 SHA 를 두 번 빌드한 일이 두 번 있었다
# (8643a17e → #419·#420, ca252ef09674 → #425·#426). 한 번에 13~15분이고
# 8코어 서버에서 빌드는 부하의 주범이다. 원장에도 같은 SHA 가 두 줄로 남아
# "무엇이 언제 나갔나" 를 읽기 어렵게 만든다.
#
# 재배포가 필요하면 --force 로 명시한다. 기본값이 "건너뜀" 이어야 실수로
# 낭비하지 않는다.
_active_image="$(timeout 30 docker inspect "$PREV_CONTAINER" --format '{{.Config.Image}}' 2>/dev/null || true)"
if [ "${DEPLOY_FORCE:-0}" != "1" ] && [ "$_active_image" = "aads-dashboard:${AADS_RELEASE_SHA}" ]; then
    # 건너뛰기도 인증이다: 두 슬롯이 같은 유효 digest 여야 하고, 감시(300초)를 통과해야 성공으로 기록한다.
    # 이전 배포가 감시 실패로 끝난 릴리스를 "이미 활성" 이라는 이유로 인증 없이 성공 처리하지 않는다.
    _active_id="$(_normalize_image_digest "$(container_image_id "$PREV_CONTAINER")")"
    if verify_release_digests "$_active_id" "$PREV_CONTAINER" "$TARGET_CONTAINER"; then
        log "SKIP: ${AADS_RELEASE_SHA} 가 이미 활성이다 (${PREV_CONTAINER}). 빌드·전환을 건너뛰고 감시만 수행한다."
        log "      재배포하려면 DEPLOY_FORCE=1 또는 --force 를 쓴다."
        record_deploy_phase "already_current"
        record_deploy_phase p0p1_monitoring
        if ! monitor_post_cutover "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$DEPLOY_IMAGE_DIGEST"; then
            log "FAIL: already_current 릴리스의 P0/P1 감시 실패 — 인증 중단"
            exit 1
        fi
        DEPLOY_RESULT="success"
        exit 0
    fi
    log "WARN: ${AADS_RELEASE_SHA} 이미지는 활성이지만 두 슬롯 digest 검증 실패 — 건너뛰지 않고 배포를 진행한다"
fi

# Step 0.5: 대상 슬롯 잔여 컨테이너 정리
remove_container_if_foreign "$TARGET_CONTAINER" "$TARGET_SERVICE"
if docker ps -a --format '{{.Names}}' | grep -Fx "$TARGET_CONTAINER" >/dev/null 2>&1; then
    log "Step 0.5: 대상 슬롯 잔여 컨테이너 정리 (${TARGET_CONTAINER})"
    docker rm -f "$TARGET_CONTAINER" >/dev/null 2>&1 || true
fi

# Step 1: release image를 정확히 한 번 빌드한 뒤 비활성 슬롯을 같은 이미지로 기동
record_deploy_phase build_candidate_image
log "Step 1: release image 1회 빌드 (${AADS_RELEASE_SHA})"
if ! ensure_release_image; then
    log "FAIL: release 이미지 확보 실패 — 배포 중단"
    exit 1
fi
log "Step 1.5: ${TARGET_SLOT} 슬롯 기동 (--no-build)"
docker compose "${COMPOSE_ARGS[@]}" up -d --no-build --no-deps "$TARGET_SERVICE"
log "OK: ${TARGET_SLOT} 슬롯 기동 완료"

# Step 2: 내부 헬스체크
record_deploy_phase candidate_health
if ! wait_health "$TARGET_HEALTH" "$MAX_WAIT" "$TARGET_SLOT"; then
    log "FAIL: ${TARGET_SLOT} 슬롯 헬스체크 실패 — 배포 중단"
    exit 1
fi
_candidate_id="$(_normalize_image_digest "$(container_image_id "$TARGET_CONTAINER")")"
if [ -z "$_candidate_id" ] || [ "$_candidate_id" != "$RELEASE_IMAGE_ID" ]; then
    log "FAIL: 후보 컨테이너가 release 이미지로 기동되지 않았다 (container='${_candidate_id}', release='${RELEASE_IMAGE_ID}') — 배포 중단"
    exit 1
fi

# Step 3: upstream 전환
record_deploy_phase traffic_switch
log "Step 3: nginx upstream → ${TARGET_SLOT}"
if ! perform_cutover "$TARGET_SLOT" "$TARGET_CONTAINER" "$TARGET_PORT"; then
    exit 1
fi
POST_CUTOVER_STARTED_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

# Step 5: 이전 슬롯 동기화 (같은 release 이미지, --no-build)
record_deploy_phase standby_sync
if ! sync_dashboard_standby "$PREV_SLOT" "$PREV_SERVICE" "$PREV_CONTAINER" "$PREV_HEALTH"; then
    log "FAIL: standby 동기화 실패 — release certification 중단"
    exit 1
fi

# Step 6: 최종 확인 — digest 는 fail closed
record_deploy_phase digest_verification
STATUS=$(timeout 30 docker inspect "$TARGET_CONTAINER" --format='{{.State.Status}}' 2>/dev/null || echo "unknown")
TARGET_RELEASE=$(container_release_sha "$TARGET_CONTAINER")
PREV_RELEASE=$(container_release_sha "$PREV_CONTAINER")
if ! verify_release_digests "$RELEASE_IMAGE_ID" "$TARGET_CONTAINER" "$PREV_CONTAINER"; then
    exit 1
fi
if [ "$TARGET_RELEASE" != "$AADS_RELEASE_SHA" ] || [ "$PREV_RELEASE" != "$AADS_RELEASE_SHA" ]; then
    log "FAIL: 컨테이너 release 표식 불일치 (expected=${AADS_RELEASE_SHA}, active=${TARGET_RELEASE:-none}, standby=${PREV_RELEASE:-none})"
    exit 1
fi
log "OK: dashboard release 확인 (${TARGET_RELEASE}), image=${DEPLOY_IMAGE_DIGEST}"
log "cutover 완료 — 활성 슬롯: ${TARGET_SLOT}, 상태: $STATUS"

# Step 7: 프론트엔드 QA 자동 실행
log "Step 7: 프론트엔드 QA 실행 (30초 안정화 대기 후)"
sleep 30
ACTIVE_API_PORT=$(awk '
    $1 == "upstream" && $2 == "aads_api" { in_api=1; next }
    in_api && $1 == "}" { in_api=0 }
    in_api && $1 == "server" && $2 ~ /^127\.0\.0\.1:(8100|8102)$/ && $0 !~ /backup/ {
        split($2, addr, ":")
        print addr[2]
        exit
    }
' "$NGINX_UPSTREAM" 2>/dev/null || true)
QA_API_BASE="${AADS_API_BASE:-http://127.0.0.1:${ACTIVE_API_PORT:-8100}}"
log "Step 7: QA API base=${QA_API_BASE}"
# QA 엔드포인트는 인증이 필요하다. 헤더 없이 부르면 401 이 나고 curl -sf 가
# 실패해 아래 더미 JSON 으로 대체된다. 그러면 파싱 결과가 UNKNOWN 이 되어
# "수동 확인 필요"만 찍힌다 — 2026-09-13 확인 결과 QA 는 이 때문에 한 번도
# 실행된 적이 없었다. 배포마다 같은 줄이 남았지만 아무도 보지 않았다.
#
# 토큰은 컨테이너 안에서 만들어 stdin 으로만 받는다(argv 노출 방지).
QA_TOKEN="$(docker exec -i "${QA_TOKEN_CONTAINER:-aads-server}" python3 - <<'PYTOK' 2>/dev/null || true
import sys
sys.path.insert(0, "/app")
try:
    from app.auth import create_token
    print(create_token(
        "79ee004e-1e2e-490f-aa05-b096814f180d", "moongoby@naver.com",
        is_admin=True, tenant_id="2d701a8c-9596-4757-8588-faa4f7837112",
    ))
except Exception:
    pass
PYTOK
)"
QA_TOKEN="$(printf '%s' "$QA_TOKEN" | tr -d '[:space:]')"

# QA 브라우저가 로그인 상태로 화면을 찍게 한다.
#
# 이게 없으면 /, /chat, /ops 가 전부 로그인 화면으로 찍힌다(2026-09-13 실측:
# 스크린샷 4장이 23,241바이트로 바이트 동일). 감리가 로그인 UI 를 세 번
# 채점하므로 점수에 아무 의미가 없다.
#
# 토큰에 유효기간이 있으므로 QA 직전에 매번 새로 만든다. 크론으로 돌리면
# 만료된 뒤 조용히 로그인 화면으로 되돌아간다 — 화면상으로는 QA 가 도는
# 것처럼 보여 더 나쁘다.
_QA_STATE_REFRESH="${COMPOSE_DIR}/scripts/refresh_qa_storage_state.py"
if [[ -x "$_QA_STATE_REFRESH" ]]; then
    if python3 "$_QA_STATE_REFRESH" >/dev/null 2>&1; then
        log "Step 7: QA 로그인 상태 갱신 완료"
    else
        log "⚠️ Step 7: QA 로그인 상태 갱신 실패 — 로그인 화면을 찍게 된다(점수 무의미)"
    fi
else
    log "⚠️ Step 7: QA 로그인 상태 갱신 스크립트 없음: $_QA_STATE_REFRESH"
fi

if [[ -z "$QA_TOKEN" ]]; then
    log "⚠️ Step 7: QA 토큰 발급 실패 — QA 를 건너뛴다"
    QA_RESPONSE='{"error":"QA 토큰 발급 실패"}'
else
    QA_RESPONSE=$(curl -sf -X POST "${QA_API_BASE}/api/v1/visual-qa/full-qa" \
        -H "Authorization: Bearer ${QA_TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{"project_id":"AADS","deploy_url":"https://aads.newtalk.kr/","pages":["/","/chat","/ops"]}' \
        --max-time 240 2>/dev/null || echo '{"error":"QA API 호출 실패"}')
fi
unset QA_TOKEN

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
elif [[ "$QA_RESULT" == *"PASS"* ]]; then
    log "Step 7: ✅ 프론트엔드 QA 통과 — $QA_RESULT"
else
    # PASS 도 FAIL 도 아닌 값은 전부 미확정으로 둔다.
    #
    # QA 응답의 verdict 는 "CEO 확인 요청" 같은 사람 판단 요청도 돌려준다.
    # 이전 로직은 FAIL 이 아니면 통과로 간주해, 그런 값이 "✅ QA 통과"로
    # 찍혔다. 인증을 붙여 QA 가 실제로 돌기 시작하면 이 구멍이 바로
    # 거짓 통과가 된다 — 판단을 미루자는 응답을 합격으로 읽는 셈이다.
    log "⚠️ Step 7: QA 미확정 — $QA_RESULT (통과로 간주하지 않음, 수동 확인 필요)"
    if [ "${AADS_DASHBOARD_QA_STRICT:-false}" = "true" ]; then
        exit 1
    fi
fi

# 공개 문서 동기화 — public/.exports-publish 목록만 /exports/ 무인증 경로로 복사한다.
# 루트 경로 HTML 은 로그인 가드에 걸려 307 이므로 이 복사가 없으면 대표님 링크가 404 난다(2026-09-22).
bash "${SOURCE_DIR}/scripts/publish_public_docs.sh" "${SOURCE_DIR}/public" || log "WARN: 공개 문서 동기화 실패 (배포는 유지)"

record_deploy_phase p0p1_monitoring
if ! monitor_post_cutover "$POST_CUTOVER_STARTED_AT" "$DEPLOY_IMAGE_DIGEST"; then
    log "FAIL: 배포 후 P0/P1 모니터링 실패 — release certification 중단"
    exit 1
fi

log "배포 완료 — 활성 슬롯: ${TARGET_SLOT}, 상태: $STATUS"
DEPLOY_RESULT="success"
log "AADS Dashboard blue-green 배포 성공"
