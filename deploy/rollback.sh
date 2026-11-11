#!/usr/bin/env bash
# Qo'lda avvalgi versiyaga qaytish: rollback.sh [git-sha]  (sha berilmasa — oldingi deploy)
set -euo pipefail
cd /opt/itxiva
TARGET="${1:-$(cat previous)}"
exec /opt/itxiva/deploy.sh "$TARGET"
