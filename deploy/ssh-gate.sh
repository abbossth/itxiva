#!/usr/bin/env bash
# GitHub Actions deploy kaliti uchun majburiy buyruq (authorized_keys: command=...).
# Kalit faqat ikki ishni qila oladi: image yuklash va deploy.sh'ni ishga tushirish.
set -euo pipefail
cmd="${SSH_ORIGINAL_COMMAND:-}"
case "$cmd" in
  "gunzip | docker load")
    gunzip | docker load ;;
  /opt/itxiva/deploy.sh\ *)
    sha="${cmd#/opt/itxiva/deploy.sh }"
    [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "noto'g'ri sha" >&2; exit 2; }
    exec /opt/itxiva/deploy.sh "$sha" ;;
  *)
    echo "ruxsat yo'q: $cmd" >&2; exit 2 ;;
esac
