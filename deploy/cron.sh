#!/usr/bin/env bash
# Ilovaning cron manzilini CRON_SECRET bilan chaqiradi: cron.sh reminders | daily
set -euo pipefail
NAME="${1:?reminders yoki daily}"
SECRET="$(grep -E '^CRON_SECRET=' /etc/itxiva/app.env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
curl -fsS --max-time 290 --retry 2 --retry-delay 5 \
  -H "Authorization: Bearer $SECRET" \
  "http://127.0.0.1:3000/api/cron/$NAME"
echo
