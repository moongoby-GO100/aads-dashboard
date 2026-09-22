#!/usr/bin/env bash
# 공개 문서 동기화 — public/.exports-publish 에 적힌 파일만 nginx 무인증 경로로 복사한다.
#
# 왜 필요한가. 루트 경로(`/<name>.html`)는 Next.js 앱 라우트로 들어가 로그인 가드에
# 걸려 307 로 리다이렉트된다. 대표님께 링크를 드릴 수 있는 경로는 nginx 가
# `alias /var/www/certbot/exports/` 로 인증 없이 서빙하는 `/exports/` 뿐이다.
# 2026-09-22, PRD HTML 이 이 복사를 받지 못해 `/exports/` 에서 404 였고
# "배포 완료" 보고와 실제 열람 가능 여부가 어긋났다. 그래서 배포에 붙인다.
#
# 왜 와일드카드가 아니라 목록인가. `public/*.html` 을 통째로 밀면 e2e-auth.html 처럼
# 인증 보조용 파일이나 아직 공개 결정이 없는 초안까지 무인증 경로에 노출된다.
# 공개는 되돌리기 어려우므로 파일을 명시적으로 적어야만 나간다.
set -uo pipefail

PUBLIC_DIR="${1:-/root/aads/aads-dashboard/public}"
EXPORT_DIR="${2:-/var/www/certbot/exports}"
MANIFEST="${PUBLIC_DIR}/.exports-publish"

if [[ ! -f "$MANIFEST" ]]; then
    echo "publish_public_docs: 목록 없음 — $MANIFEST (건너뜀)"
    exit 0
fi
if [[ ! -d "$EXPORT_DIR" ]]; then
    echo "publish_public_docs: 대상 경로 없음 — $EXPORT_DIR (건너뜀)"
    exit 0
fi

copied=0
same=0
missing=0
while IFS= read -r line || [[ -n "$line" ]]; do
    name="${line%%#*}"
    name="$(echo "$name" | tr -d '[:space:]')"
    [[ -n "$name" ]] || continue
    if [[ "$name" != "$(basename "$name")" ]]; then
        echo "publish_public_docs: 경로 형태 거부 — $name"
        continue
    fi
    src="$PUBLIC_DIR/$name"
    if [[ ! -f "$src" ]]; then
        echo "publish_public_docs: 원본 없음 — $name"
        missing=$((missing + 1))
        continue
    fi
    dst="$EXPORT_DIR/$name"
    if [[ -f "$dst" ]] && cmp -s "$src" "$dst"; then
        same=$((same + 1))
        continue
    fi
    if cp "$src" "$dst" && chmod 644 "$dst"; then
        copied=$((copied + 1))
        echo "publish_public_docs: 갱신 /exports/$name"
    else
        echo "publish_public_docs: 복사 실패 — $name"
    fi
done < "$MANIFEST"

echo "publish_public_docs: 갱신 ${copied}건, 동일 ${same}건, 원본없음 ${missing}건"
exit 0
