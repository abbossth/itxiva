# Deploy (VPS)

Sayt Rifty VPS'da ishlaydi: `2.26.120.172`, Ubuntu 24.04, Frankfurt. Domen Cloudflare orqali ulanadi.

```
Brauzer → Cloudflare (proxy) → VPS: Caddy (HTTPS) → ilova: 2 nusxa, Docker (127.0.0.1:3000 va :3001)
                                                    → MongoDB Atlas (Frankfurt), Cloudflare R2
"Kiber jang" xonasi → Cloudflare Worker (realtime/)
```

## Yangi versiyani chiqarish

`main`ga push qilish kifoya. Keyin server o'zi:

1. har daqiqada `main`ni tekshiradi (`itxiva-autodeploy.timer`);
2. yangi commitni o'zi build qiladi (`deploy/autodeploy.sh`);
3. ilovaning ikki nusxasini navbat bilan yangilaydi (`deploy/deploy.sh`), shuning uchun sayt to'xtamaydi;
4. yangi versiya javob bermasa, eskisiga qaytadi.

Push'dan keyin yangi versiya odatda 3–5 daqiqada chiqadi. Ochiq sahifalar o'zini avtomatik yangilaydi (`/api/version`).

GitHub Actions (`.github/workflows/ci.yml`) faqat tekshiruvlarni bajaradi: lint, tsc va testlar.

## Server buyruqlari (`ssh root@2.26.120.172`)

| Nima | Buyruq |
|---|---|
| Hozirgi versiya | `cat /opt/itxiva/current` |
| Deploy loglari | `journalctl -u itxiva-autodeploy -n 100` |
| Build logi | `ls -t /opt/itxiva/logs/` |
| Ilova loglari | `docker logs --tail 100 itxiva-a` (yoki `itxiva-b`) |
| Avvalgi versiyaga qaytish | `su deploy -c /opt/itxiva/rollback.sh` |
| Muvaffaqiyatsiz commitni qayta urinish | `rm /opt/itxiva/failed` (keyingi daqiqada build qilinadi) |
| Cron'lar | `systemctl list-timers 'itxiva-*'`, `journalctl -u 'itxiva-cron@*' -n 50` |
| Holat | `docker ps`, `docker stats --no-stream`, `free -h` |

Maxfiy sozlamalar `/etc/itxiva/app.env` faylida turadi (faqat root va deploy o'qiy oladi). O'zgartirgandan keyin `su deploy -c "/opt/itxiva/deploy.sh $(cat /opt/itxiva/current)"` buyrug'ini bajaring.

## Cron

Cron'larni Vercel Cron va GitHub Actions o'rniga systemd timer'lari bajaradi:

- `itxiva-cron-reminders.timer`: har 5 daqiqada `/api/cron/reminders`;
- `itxiva-cron-daily.timer`: har kuni 04:00 UTC da `/api/cron/daily`.

## Serverni noldan qurish

1. `scp -r deploy root@<ip>:/root/itxiva-deploy`
2. `bash /root/itxiva-deploy/setup-server.sh`. Bu skript Docker, Caddy, firewall, fail2ban, swap, deploy foydalanuvchisi va timer'larni o'rnatadi.
3. `/etc/itxiva/app.env` faylini to'ldiring.
4. Cron timer'larini yoqing: `systemctl enable --now itxiva-cron-reminders.timer itxiva-cron-daily.timer`.
5. Cloudflare DNS'da `itxiva.uz` va `www` yozuvlarini yangi IP'ga ko'rsating, Proxied holatida.
6. Firewall'ni faqat Cloudflare uchun ochiq qiling: `bash setup-server.sh --cf-only`.

VPS'da hech qanday ma'lumot saqlanmaydi: baza Atlas'da, fayllar R2'da. Shuning uchun server o'chsa ham ma'lumot yo'qolmaydi.
