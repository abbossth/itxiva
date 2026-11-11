#!/usr/bin/env bash
# Avtomatik deploy (CD): har daqiqada GitHub'dagi main tekshiriladi. Yangi commit bo'lsa — shu serverda
# Docker image build qilinadi va deploy.sh bilan ikki nusxa navbat bilan yangilanadi (sayt to'xtamaydi).
# Build yoki ishga tushish muvaffaqiyatsiz bo'lsa, sayt eski versiyada qoladi va bu commit qayta urinilmaydi
# (keyingi push yana urinadi). Loglar: journalctl -u itxiva-autodeploy -n 100
set -euo pipefail
exec 9>/tmp/itxiva-autodeploy.lock
flock -n 9 || exit 0

REPO="https://github.com/abbossth/itxiva.git"
DIR=/opt/itxiva
SRC="$DIR/src"

remote="$(git ls-remote "$REPO" refs/heads/main | cut -f1)"
[[ "$remote" =~ ^[0-9a-f]{40}$ ]] || { echo "main topilmadi"; exit 1; }
[ "$remote" = "$(cat "$DIR/current" 2>/dev/null || true)" ] && exit 0
[ "$remote" = "$(cat "$DIR/failed" 2>/dev/null || true)" ] && exit 0

echo "Yangi commit: $remote"
[ -d "$SRC/.git" ] || git clone -q --filter=blob:none "$REPO" "$SRC"
git -C "$SRC" fetch -q origin main
git -C "$SRC" checkout -qf "$remote"
git -C "$SRC" clean -qfdx

# app.env'dagi qiymat (qo'shtirnoqlar olib tashlanadi)
pub() { grep -E "^$1=" /etc/itxiva/app.env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true; }
mkdir -p "$DIR/logs"
LOG="$DIR/logs/build-${remote:0:7}.log"
build() {
  nice -n 10 docker build --progress=plain -t "itxiva:$remote" \
    --build-arg GIT_SHA="$remote" \
    --build-arg NEXT_PUBLIC_APP_URL="$(pub NEXT_PUBLIC_APP_URL)" \
    --build-arg NEXT_PUBLIC_ARENA_WS_URL="$(pub NEXT_PUBLIC_ARENA_WS_URL)" \
    "$SRC" >> "$LOG" 2>&1
}
# Tarmoq xatolari (masalan, shrift yuklanmay qolsa) uchun 3 martagacha urinadi; to'liq log: $LOG
ok=""
for attempt in 1 2 3; do
  echo "--- urinish $attempt ($(date -u +%FT%TZ))" >> "$LOG"
  if build; then ok=1; break; fi
  sleep 30
done
if [ -z "$ok" ]; then
  echo "$remote" > "$DIR/failed"; echo "BUILD XATO: $remote (log: $LOG)"
  grep -E "rror|Failed" "$LOG" | tail -15
  exit 1
fi
# Eski build loglari (oxirgi 20 tasi qoladi)
ls -1t "$DIR"/logs/build-*.log 2>/dev/null | tail -n +21 | xargs -r rm -f

if "$DIR/deploy.sh" "$remote"; then
  rm -f "$DIR/failed"
else
  echo "$remote" > "$DIR/failed"; exit 1
fi
# Build keshi diskni to'ldirmasin (3 kundan eskisi tozalanadi)
docker builder prune -f --filter until=72h >/dev/null 2>&1 || true
