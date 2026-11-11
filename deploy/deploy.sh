#!/usr/bin/env bash
# Yangi image'ni ishga tushiradi va tekshiradi; ishlamasa avvalgisiga qaytaradi.
# Ishlatish: deploy.sh <git-sha>   (image oldindan `docker load` qilingan bo'lishi kerak: itxiva:<sha>)
set -euo pipefail
cd /opt/itxiva

NEW="${1:?git sha kerak}"
PREV="$(cat current 2>/dev/null || true)"

wait_healthy() {
  local want="$1"
  for _ in $(seq 1 60); do
    got="$(curl -fsS --max-time 3 http://127.0.0.1:3000/api/version 2>/dev/null | sed -n 's/.*"build":"\([^"]*\)".*/\1/p' || true)"
    [ "$got" = "$want" ] && return 0
    sleep 2
  done
  return 1
}

docker image inspect "itxiva:$NEW" >/dev/null
echo "Deploy: ${PREV:-(yo'q)} -> $NEW"
IMAGE_TAG="$NEW" docker compose up -d --remove-orphans

if wait_healthy "$NEW"; then
  echo "$NEW" > current
  [ -n "$PREV" ] && [ "$PREV" != "$NEW" ] && echo "$PREV" > previous
  # Oxirgi 3 ta image qoladi (rollback uchun)
  docker images itxiva --format '{{.Tag}}' | grep -v -e "^$NEW\$" -e "^${PREV:-none}\$" -e '^latest$' | tail -n +2 | xargs -r -I{} docker rmi "itxiva:{}" >/dev/null 2>&1 || true
  docker image prune -f >/dev/null
  echo "OK: $NEW ishlayapti"
else
  echo "XATO: $NEW 120 soniyada javob bermadi" >&2
  docker logs --tail 80 itxiva-app >&2 || true
  if [ -n "$PREV" ]; then
    echo "Avvalgi versiyaga qaytilmoqda: $PREV" >&2
    IMAGE_TAG="$PREV" docker compose up -d
    wait_healthy "$PREV" && echo "Qaytarildi: $PREV" >&2
  fi
  exit 1
fi
