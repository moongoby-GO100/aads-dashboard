#!/usr/bin/env bash
# 대시보드 배포 실행기 — 전용 깨끗한 릴리스 워크트리에서 그 SHA 의 deploy.sh 를 실행한다.
#
# 2026-11-05: 배포가 공용 체크아웃 /root/aads/aads-dashboard/deploy.sh(a66bb96, origin/main 보다 약 800줄
# 뒤처짐)로 돌아 원격 빌드(875bcb3)·QA 스모크(67bd4c96) 같은 수정이 실행되지 않았고, 지난 판을 배포하려다
# 실패한 일도 있었다(deploy_runs #5995). 공용 체크아웃에는 다른 세션의 미커밋 작업이 있어 갱신하지 않는다.
# deploy.sh 는 "SOURCE_DIR 가 깨끗하고 HEAD 가 릴리스 SHA" 이기를 요구하므로, 전용 워크트리를 그 SHA 로 맞춘다.
#
# 사용: AADS_RELEASE_SHA=<sha|비우면 origin/main> aads-dashboard-deploy [deploy.sh 인자...]
set -euo pipefail

REPO="${AADS_DASHBOARD_REPO:-/root/aads/aads-dashboard}"
WT="${AADS_DASHBOARD_RELEASE_WT:-/root/aads/runtime/dashboard-release}"
LOCK="${AADS_DASHBOARD_LAUNCHER_LOCK:-/tmp/aads-dashboard-release-launcher.lock}"

log() { printf '[%s] [launcher] %s\n' "$(TZ=Asia/Seoul date '+%H:%M:%S')" "$*"; }

exec 9>"$LOCK"
if ! flock -n 9; then
    log "FAIL: 다른 대시보드 배포가 실행기를 쓰는 중이다 ($LOCK)"
    exit 75
fi

timeout 120 git -C "$REPO" fetch --quiet origin
want="${AADS_RELEASE_SHA:-origin/main}"
full="$(git -C "$REPO" rev-parse --verify "${want}^{commit}")"
if ! git -C "$REPO" merge-base --is-ancestor "$full" origin/main; then
    log "FAIL: 릴리스 ${full:0:12} 가 origin/main 에 없다 — push 된 커밋만 배포한다"
    exit 2
fi

if [ ! -e "$WT/.git" ]; then
    mkdir -p "$(dirname "$WT")"
    git -C "$REPO" worktree add --detach "$WT" "$full" >/dev/null
else
    # 전용 워크트리다. 사람이 손대지 않으므로 강제로 맞춘다(미추적 파일 포함 정리).
    git -C "$WT" checkout --quiet --detach --force "$full"
    git -C "$WT" clean -fdq -e node_modules -e .next
fi
[ "$(git -C "$WT" rev-parse HEAD)" = "$full" ] || { log "FAIL: 워크트리 HEAD 불일치"; exit 2; }
log "release=${full:0:12} worktree=$WT"

# deploy.sh 가 자체 잠금·검증을 한다. 실행기 잠금은 워크트리를 맞추는 구간과 실행 전체를 감싼다.
AADS_RELEASE_SHA="${full:0:12}" bash "$WT/deploy.sh" "$@"
