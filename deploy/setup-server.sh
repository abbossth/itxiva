#!/usr/bin/env bash
# Yangi Ubuntu/Debian VPS'ni ITXiva uchun tayyorlaydi (bir marta, root sifatida). Qayta ishga tushirish xavfsiz.
#   bash setup-server.sh            — o'rnatish (80/443 hammaga ochiq: birinchi sertifikat olish uchun)
#   bash setup-server.sh --cf-only  — 80/443 faqat Cloudflare'dan (DNS proxy yoqilgandan keyin)
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "root kerak"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
CF_ONLY="${1:-}"
export DEBIAN_FRONTEND=noninteractive

apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl gnupg ufw fail2ban unattended-upgrades debian-keyring debian-archive-keyring apt-transport-https

# Avtomatik xavfsizlik yangilanishlari
dpkg-reconfigure -f noninteractive unattended-upgrades

# 2 GB swap (xotira keskin oshsa server qotmasin)
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf
fi

# Docker (rasmiy repo)
if ! command -v docker >/dev/null; then
  . /etc/os-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -q && apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

# Caddy (rasmiy repo)
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -yq caddy
fi
mkdir -p /var/log/caddy && chown caddy:caddy /var/log/caddy
# Domen hali boshqa joyga ko'rsatib turgan bo'lsa: CADDYFILE=bootstrap fayl (sertifikat so'rab, Let's Encrypt limitini yemasin)
install -m 0644 "${CADDYFILE:-$HERE/Caddyfile}" /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable caddy && systemctl reload-or-restart caddy

# deploy foydalanuvchisi (GitHub Actions shu bilan kiradi; faqat docker guruhida)
id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG docker deploy
install -d -m 0700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys && chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys

# Ilova papkasi va maxfiy sozlamalar
install -d -m 0755 -o deploy -g deploy /opt/itxiva
install -m 0644 -o deploy -g deploy "$HERE/docker-compose.yml" /opt/itxiva/docker-compose.yml
install -m 0755 -o deploy -g deploy "$HERE/deploy.sh" "$HERE/rollback.sh" "$HERE/autodeploy.sh" /opt/itxiva/
install -m 0755 "$HERE/cron.sh" /opt/itxiva/cron.sh
install -d -m 0750 -o root -g deploy /etc/itxiva
[ -f /etc/itxiva/app.env ] || install -m 0640 -o root -g deploy /dev/null /etc/itxiva/app.env

# Cron (avval Vercel Cron va GitHub Actions qilardi). Faqat o'rnatiladi — domen VPS'ga o'tganda yoqiladi:
#   systemctl enable --now itxiva-cron-reminders.timer itxiva-cron-daily.timer
# (aks holda eslatmalar ikki joydan — Vercel'dan ham, VPS'dan ham — ketib qoladi)
install -m 0644 "$HERE/itxiva-cron@.service" "$HERE/itxiva-cron-reminders.timer" "$HERE/itxiva-cron-daily.timer" /etc/systemd/system/

# Avtomatik deploy (CD): main'ga push → shu server build qiladi va yangilaydi
install -m 0644 "$HERE/itxiva-autodeploy.service" "$HERE/itxiva-autodeploy.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now itxiva-autodeploy.timer

# SSH: faqat kalit bilan
cat > /etc/ssh/sshd_config.d/10-itxiva.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
sshd -t && (systemctl reload ssh 2>/dev/null || systemctl reload sshd)

# fail2ban: SSH'ga parol terish urinishlari
cat > /etc/fail2ban/jail.d/sshd.local <<'CONF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
CONF
systemctl enable --now fail2ban && systemctl restart fail2ban

# Firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
if [ "$CF_ONLY" = "--cf-only" ]; then
  ufw delete allow 80/tcp 2>/dev/null || true
  ufw delete allow 443/tcp 2>/dev/null || true
  for ip in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
    ufw allow proto tcp from "$ip" to any port 80,443 comment cloudflare >/dev/null
  done
else
  ufw allow 80/tcp
  ufw allow 443/tcp
fi
ufw --force enable
ufw status | head -40
echo "Tayyor."
