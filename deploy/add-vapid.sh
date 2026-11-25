#!/usr/bin/env bash
# Push-bildirishnomalar uchun VAPID kalitlarini serverning o'zida yaratadi va /etc/itxiva/app.env ga qo'shadi
# (bir marta). Maxfiy kalit ekranga chiqmaydi. Ishga tushirish (kompyuterdan):
#   ssh root@2.26.120.172 'bash -s' < deploy/add-vapid.sh
# Keyin ilovani qayta ishga tushiring: cd /opt/itxiva && docker compose up -d --force-recreate app_a app_b
set -euo pipefail
F=/etc/itxiva/app.env
if grep -q '^VAPID_PRIVATE_KEY=' "$F"; then
  echo "VAPID kalitlari allaqachon bor"
  exit 0
fi
docker exec itxiva-a node -e '
const c = require("crypto");
const { publicKey, privateKey } = c.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pj = publicKey.export({ format: "jwk" });
const sj = privateKey.export({ format: "jwk" });
const b = (s) => Buffer.from(s, "base64url");
const pub = Buffer.concat([Buffer.from([4]), b(pj.x), b(pj.y)]).toString("base64url");
process.stdout.write("VAPID_PUBLIC_KEY=" + pub + "\nVAPID_PRIVATE_KEY=" + sj.d + "\nVAPID_SUBJECT=https://www.itxiva.uz\n");
' >> "$F"
echo "VAPID kalitlari qo'shildi ($(grep -c '^VAPID_' "$F") qator)"
