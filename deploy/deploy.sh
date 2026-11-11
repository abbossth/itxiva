#!/usr/bin/env bash
# Yangi image'ni ikki nusxaga navbat bilan qo'yadi (sayt to'xtamaydi). Biror nusxa yangi versiyada javob
# bermasa — ikkalasi ham avvalgi versiyaga qaytariladi va skript xato bilan tugaydi.
# Ishlatish: deploy.sh <git-sha>   (image oldindan `docker load` qilingan bo'lishi kerak: itxiva:<sha>)
set -euo pipefail
cd /opt/itxiva

NEW="${1:?git sha kerak}"
PREV="$(cat current 2>/dev/null || true)"

wait_healthy() { # <port> <sha>
  for _ in $(seq 1 60); do
    got="$(curl -fsS --max-time 3 "http://127.0.0.1:$1/api/version" 2>/dev/null | sed -n 's/.*"build":"\([^"]*\)".*/\1/p' || true)"
    [ "$got" = "$2" ] && return 0
    sleep 2
  done
  return 1
}

up() { # <service> <tag-a> <tag-b>
  TAG_A="$2" TAG_B="$3" docker compose up -d --no-deps --remove-orphans "$1"
}

rollback() {
  echo "XATO: $NEW javob bermadi" >&2
  docker logs --tail 60 itxiva-a >&2 2>&1 || true
  if [ -n "$PREV" ]; then
    echo "Avvalgi versiyaga qaytilmoqda: $PREV" >&2
    up app_a "$PREV" "$PREV"; wait_healthy 3000 "$PREV" || true
    up app_b "$PREV" "$PREV"; wait_healthy 3001 "$PREV" && echo "Qaytarildi: $PREV" >&2
  fi
  exit 1
}

docker image inspect "itxiva:$NEW" >/dev/null
OLD="${PREV:-$NEW}"
echo "Deploy: ${PREV:-none} -> $NEW"

# 1) A nusxa yangilanadi, B eskisida xizmat qilib turadi
up app_a "$NEW" "$OLD"
wait_healthy 3000 "$NEW" || rollback
# 2) B nusxa yangilanadi, A yangisida xizmat qiladi
up app_b "$NEW" "$NEW"
wait_healthy 3001 "$NEW" || rollback

echo "$NEW" > current
[ -n "$PREV" ] && [ "$PREV" != "$NEW" ] && echo "$PREV" > previous
# Oxirgi 3 ta image qoladi (rollback uchun)
docker images itxiva --format '{{.Tag}}' | grep -v -e "^$NEW\$" -e "^${PREV:-none}\$" | tail -n +2 | xargs -r -I{} docker rmi "itxiva:{}" >/dev/null 2>&1 || true
docker image prune -f >/dev/null
echo "OK: $NEW ishlayapti (2 nusxa)"
