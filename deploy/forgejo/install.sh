#!/usr/bin/env bash
#
# forgejo-install.sh — Debian 12 üzerine Forgejo yedek sunucusu kurar.
#
# Kurulan bileşenler:
#   - Docker Engine + Compose v2
#   - Forgejo (mirror/backup git sunucusu, SQLite, kayıt kapalı, Actions açık)
#   - Caddy (otomatik TLS + https://update.<domain> üzerinde statik updater dosyaları)
#   - Forgejo Runner (standby: yalnızca "standby" etiketli job'ları alır, boşta kaynak tüketmez)
#   - Haftalık forgejo dump + config yedeği (rclone ile dış depoya opsiyonel)
#   - ufw (22/80/443) + 4 GB swap
#
# Kullanım:
#   sudo ./install.sh --domain git.example.com --update-domain update.example.com \
#        --email admin@example.com [--backup-remote b2:my-bucket] [--dir /opt/forgejo]
#
# Seçenekler:
#   --domain URL           Forgejo alt alan adı (zorunlu)
#   --update-domain URL    Updater dosyaları için alt alan adı (zorunlu)
#   --email ADRES          Let's Encrypt bildirim e-postası (zorunlu)
#   --backup-remote HEDEF  rclone remote:bucket — haftalık dump buraya kopyalanır
#   --deploy-key ANAHTAR   Release upload için SSH public key (forgejo-update
#                          kullanıcısına takılır; verilmezse manuel eklenir)
#   --admin-user AD        Yönetici kullanıcı adı (varsayılan: volkan)
#   --admin-email ADRES    Yönetici e-postası (varsayılan: --email değeri)
#   --admin-pass PAROLA    Yönetici parolası (verilmezse üretilir)
#   --dir DIZIN            Kurulum dizini (varsayılan: /opt/forgejo)
#   --no-runner            Runner'ı kurma
#   --yes                  Tüm onay sorularını otomatik geç
#   --force                Mevcut kurulum dizini varsa üzerine yaz

set -euo pipefail

# ---------------------------------------------------------------- sabitler
FORGEJO_VERSION="${FORGEJO_VERSION:-16}"
RUNNER_VERSION="${RUNNER_VERSION:-13}"
APP_DIR="/opt/forgejo"
DOMAIN="" UPDATE_DOMAIN="" ACME_EMAIL=""
ADMIN_USER="volkan" ADMIN_EMAIL="" ADMIN_PASS=""
BACKUP_REMOTE="" DEPLOY_KEY="" NO_RUNNER=0 ASSUME_YES=0 FORCE=0
KEEP_BACKUPS=4

RED=$'\033[0;31m' GREEN=$'\033[0;32m' YELLOW=$'\033[1;33m' NC=$'\033[0m'
log()  { printf '%s[install]%s %s\n' "$GREEN" "$NC" "$*"; }
warn() { printf '%s[uyari ]%s %s\n' "$YELLOW" "$NC" "$*"; }
die()  { printf '%s[hata  ]%s %s\n' "$RED" "$NC" "$*" >&2; exit 1; }

confirm() {
  [[ $ASSUME_YES -eq 1 ]] && return 0
  read -r -p "$1 [evet/hayir]: " reply
  [[ $reply == "evet" || $reply == "e" || $reply == "y" ]]
}

# ---------------------------------------------------------------- argümanlar
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)         DOMAIN="$2"; shift 2 ;;
    --update-domain)  UPDATE_DOMAIN="$2"; shift 2 ;;
    --email)          ACME_EMAIL="$2"; shift 2 ;;
    --backup-remote)  BACKUP_REMOTE="$2"; shift 2 ;;
    --deploy-key)     DEPLOY_KEY="$2"; shift 2 ;;
    --admin-user)     ADMIN_USER="$2"; shift 2 ;;
    --admin-email)    ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-pass)     ADMIN_PASS="$2"; shift 2 ;;
    --dir)            APP_DIR="$2"; shift 2 ;;
    --no-runner)      NO_RUNNER=1; shift ;;
    --yes|-y)         ASSUME_YES=1; shift ;;
    --force)          FORCE=1; shift ;;
    *) die "Bilinmeyen argüman: $1 (bkz. script başındaki kullanım)" ;;
  esac
done
[[ -n $DOMAIN && -n $UPDATE_DOMAIN && -n $ACME_EMAIL ]] \
  || die "--domain, --update-domain ve --email zorunludur."
[[ -n $ADMIN_EMAIL ]] || ADMIN_EMAIL="$ACME_EMAIL"

# ---------------------------------------------------------------- ön kontroller
[[ $EUID -eq 0 ]] || die "root olarak çalıştırın (sudo ./install.sh ...)."
[[ -f /etc/debian_version ]] || die "Bu script yalnızca Debian üzerinde test edildi."
. /etc/os-release
[[ ${VERSION_ID:-} == 12* ]] || warn "Debian 12 bekleniyordu, bulunan: ${PRETTY_NAME:-?} — devam ediliyor."

if [[ -d $APP_DIR && $FORCE -ne 1 ]]; then
  die "$APP_DIR zaten mevcut. Yeniden kurulum için --force kullanın."
fi

public_ip="$(curl -4 -fsS --max-time 10 https://api.ipify.org || true)"
[[ -n $public_ip ]] || public_ip="$(ip -4 -o route get 1.1.1.1 | grep -oP 'src \K\S+' || true)"
for d in "$DOMAIN" "$UPDATE_DOMAIN"; do
  if resolved="$(getent hosts "$d" | awk '{print $1; exit}')" && [[ -n $resolved ]]; then
    if [[ $resolved != "$public_ip" ]]; then
      warn "$d -> $resolved çözülüyor ama bu sunucunun IP'si $public_ip."
      warn "DNS kaydını bu sunucuya yönlendirin; Caddy sertifika için doğru DNS bekler."
      confirm "Yine de devam edilsin mi?" || die "Kullanıcı iptal etti."
    fi
  else
    warn "$d için DNS kaydı bulunamadı. Kurulum devam eder; Caddy DNS düzelince sertifikayı alır."
    confirm "Yine de devam edilsin mi?" || die "Kullanıcı iptal etti."
  fi
done

total_mem_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
(( total_mem_mb >= 1900 )) || warn "RAM ${total_mem_mb} MB — Forgejo için yeterli ama CI build'leri için 4 GB swap şart."

log "Kurulum hedefi: $APP_DIR | domain: $DOMAIN | updater: $UPDATE_DOMAIN"

# ---------------------------------------------------------------- sistem hazırlığı
log "Sistem paketleri güncelleniyor ve kuruluyor..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg ufw rclone tzdata >/dev/null

log "Firewall (ufw) yapılandırılıyor: 22/80/443..."
ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null
ufw allow 80/tcp  >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

if [[ $(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo) -lt 2000 ]]; then
  log "4 GB swap oluşturuluyor..."
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if ! command -v docker >/dev/null 2>&1; then
  log "Docker Engine kuruluyor..."
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 bulunamadı."

# ---------------------------------------------------------------- dizin yapısı
log "Dizin yapısı oluşturuluyor: $APP_DIR"
mkdir -p "$APP_DIR"/{forgejo,caddy-data,caddy-config,update-files,backups,runner}
cd "$APP_DIR"

# ---------------------------------------------------------------- sırlar ve .env
[[ -n $ADMIN_PASS ]] || ADMIN_PASS="$(openssl rand -base64 18)"
SECRET_KEY="$(openssl rand -base64 32)"
INTERNAL_TOKEN="$(openssl rand -base64 64)"

cat > .env <<ENV
DOMAIN=$DOMAIN
UPDATE_DOMAIN=$UPDATE_DOMAIN
ACME_EMAIL=$ACME_EMAIL
FORGEJO_VERSION=$FORGEJO_VERSION
RUNNER_VERSION=$RUNNER_VERSION
SECRET_KEY=$SECRET_KEY
INTERNAL_TOKEN=$INTERNAL_TOKEN
ADMIN_USER=$ADMIN_USER
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASS=$ADMIN_PASS
ENV
chmod 600 .env

# ---------------------------------------------------------------- docker-compose.yml
cat > docker-compose.yml <<'COMPOSE'
name: forgejo-backup

services:
  forgejo:
    image: codeberg.org/forgejo/forgejo:${FORGEJO_VERSION}
    restart: unless-stopped
    environment:
      USER_UID: "1000"
      USER_GID: "1000"
      FORGEJO__server__DOMAIN: ${DOMAIN}
      FORGEJO__server__ROOT_URL: https://${DOMAIN}
      FORGEJO__server__SSH_DOMAIN: ${DOMAIN}
      FORGEJO__server__SSH_PORT: "2222"
      FORGEJO__database__DB_TYPE: sqlite3
      FORGEJO__database__PATH: /data/gitea/forgejo.db
      FORGEJO__security__INSTALL_LOCK: "true"
      FORGEJO__security__SECRET_KEY: ${SECRET_KEY}
      FORGEJO__security__INTERNAL_TOKEN: ${INTERNAL_TOKEN}
      FORGEJO__service__DISABLE_REGISTRATION: "true"
      FORGEJO__service__SHOW_REGISTRATION_BUTTON: "false"
      FORGEJO__actions__ENABLED: "true"
      FORGEJO__mailer__ENABLED: "false"
      FORGEJO__log__LEVEL: info
    volumes:
      - ./forgejo:/data
      - /etc/timezone:/etc/timezone:ro
      - /etc/localtime:/etc/localtime:ro
    ports:
      - "127.0.0.1:3000:3000"   # yalnızca yerel sağlık kontrolü için
      - "2222:22"               # git ssh

  caddy:
    image: caddy:2
    restart: unless-stopped
    depends_on:
      - forgejo
    environment:
      DOMAIN: ${DOMAIN}
      UPDATE_DOMAIN: ${UPDATE_DOMAIN}
      ACME_EMAIL: ${ACME_EMAIL}
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./caddy-data:/data
      - ./caddy-config:/config
      - ./update-files:/srv/update:ro

  runner:
    image: data.forgejo.org/forgejo/runner:${RUNNER_VERSION}
    restart: unless-stopped
    # Image varsayılan kullanıcısı uid 1000 — bind mount'ların ve .runner dosyasının
    # sahibi bu olmalı; docker.sock'a erişim group_add ile veriliyor.
    user: "1000:1000"
    group_add: ["${DOCKER_GID}"]
    working_dir: /data
    depends_on:
      - forgejo
    command: forgejo-runner daemon --config /data/config.yml
    volumes:
      - ./runner:/data
      - /var/run/docker.sock:/var/run/docker.sock
COMPOSE

# ---------------------------------------------------------------- Caddyfile
cat > Caddyfile <<'CADDY'
{
  email {$ACME_EMAIL}
}

{$DOMAIN} {
  reverse_proxy forgejo:3000
}

{$UPDATE_DOMAIN} {
  root * /srv/update/pub
  file_server
  encode gzip
}
CADDY

# ---------------------------------------------------------------- runner (standby) yapılandırması
# Runner yalnızca "standby" etiketli job'ları alır — GitHub'daki workflow'lar
# ubuntu-latest vb. istediği sürece normal zamanda hiç job çekmez.
cat > runner/config.yml <<'RUNNERCFG'
runner:
  capacity: 1
  labels:
    - "standby:docker://gitea/runner-images:ubuntu-latest"
container:
  network: "host"
  privileged: false
RUNNERCFG

# Runner image uid 1000 ile çalışır — bind mount'ı ona devret, docker.sock
# grubuna erişim için GID'i compose'a aktar.
chown -R 1000:1000 "$APP_DIR/runner"
echo "DOCKER_GID=$(stat -c %g /var/run/docker.sock)" >> .env

# ---------------------------------------------------------------- updater dosya dizini
# update-files root sahipliğinde kalır (chroot gereksinimi); deploy kullanıcısı
# yalnızca içindeki pub/ alt dizinine yazabilir. Caddy /srv/update/pub kökünden
# servis eder -> URL değişmez: https://UPDATE_DOMAIN/latest.json
mkdir -p update-files/pub
cat > update-files/README.txt <<'NOTE'
Bu dizin https://UPDATE_DOMAIN üzerinden statik servis edilir (Caddy kökü: pub/).

Release workflow'u, forgejo-update SFTP kullanıcısı üzerinden (chroot:
bu dizin) imzalı latest.json + imzalarını ve SHA256SUMS.txt'yi pub/ altına
kopyalar. Manuel kopyalamak için (root olarak):

  scp release-local/updater/latest.json* root@VPS:/opt/forgejo/update-files/pub/

tauri.conf.json içindeki updater endpoints listesinin başında
https://UPDATE_DOMAIN/latest.json durur; CSP connect-src alan adını içerir.
NOTE

# ---------------------------------------------------------------- deploy kullanıcısı
# forgejo-update: parolasız, shell'i kapalı, SSH ile YALNIZCA internal-sftp ve
# chroot=/opt/forgejo/update-files içinde. Sistemin geri kalanını göremez.
DEPLOY_USER="forgejo-update"
log "Deploy kullanıcısı oluşturuluyor: $DEPLOY_USER (sftp-only, chroot)"
chown root:root "$APP_DIR" "$APP_DIR/update-files"
chmod 755 "$APP_DIR" "$APP_DIR/update-files"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$APP_DIR/update-files/pub" \
    --shell /usr/sbin/nologin "$DEPLOY_USER"
fi
chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/update-files/pub"
chmod 755 "$APP_DIR/update-files/pub"

mkdir -p /etc/ssh/authorized_keys
chmod 755 /etc/ssh/authorized_keys
touch "/etc/ssh/authorized_keys/$DEPLOY_USER"
chmod 600 "/etc/ssh/authorized_keys/$DEPLOY_USER"
if [[ -n $DEPLOY_KEY ]]; then
  printf '%s\n' "$DEPLOY_KEY" > "/etc/ssh/authorized_keys/$DEPLOY_USER"
  log "Deploy SSH public key kaydedildi."
fi

if ! grep -q "Match User $DEPLOY_USER" /etc/ssh/sshd_config; then
  cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak-forgejo
  cat >> /etc/ssh/sshd_config <<SSHD

# --- forgejo-update deploy hesabı (ekleyen: forgejo install.sh) ---
AuthorizedKeysFile .ssh/authorized_keys /etc/ssh/authorized_keys/%u
Match User $DEPLOY_USER
    ChrootDirectory $APP_DIR/update-files
    ForceCommand internal-sftp
    AllowTcpForwarding no
    AllowAgentForwarding no
    AllowStreamLocalForwarding no
    X11Forwarding no
    PermitTTY no
    PasswordAuthentication no
    PubkeyAuthentication yes
SSHD
  if ! sshd -t 2>/dev/null; then
    warn "sshd yapılandırma doğrulaması başarısız — değişiklik geri alınıyor."
    cp /etc/ssh/sshd_config.bak-forgejo /etc/ssh/sshd_config
  else
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null \
      || service ssh reload || warn "sshd yeniden yüklenemedi; manuel: systemctl reload ssh"
    log "sshd yapılandırıldı ve yeniden yüklendi (yedek: /etc/ssh/sshd_config.bak-forgejo)."
  fi
fi
[[ -s "/etc/ssh/authorized_keys/$DEPLOY_USER" ]] || warn \
  "$DEPLOY_USER için SSH public key yok. Sonradan ekleyin: --deploy-key ile yeniden koşun veya" \
  'nano /etc/ssh/authorized_keys/forgejo-update'

# ---------------------------------------------------------------- yedekleme
cat > backup.sh <<BACKUP
#!/usr/bin/env bash
# Forgejo tam yedeği: veritabanı + repo + ayarlar + updater dosyaları.
set -euo pipefail
cd "$APP_DIR"
STAMP=\$(date +%Y%m%d-%H%M)

docker compose exec -T -u 1000 -w /data forgejo forgejo dump \\
  -c /data/gitea/conf/app.ini -f "forgejo-dump-\$STAMP.zip" >/dev/null
mv "./forgejo/forgejo-dump-\$STAMP.zip" "backups/forgejo-dump-\$STAMP.zip"

tar czf "backups/config-\$STAMP.tgz" docker-compose.yml Caddyfile .env update-files

# Eski yedekleri tut (en yeni $KEEP_BACKUPS dump + config)
ls -1t backups/forgejo-dump-*.zip 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
ls -1t backups/config-*.tgz      2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f

BACKUP_REMOTE_PLACEHOLDER
BACKUP
sed -i "s|BACKUP_REMOTE_PLACEHOLDER|if [[ -n \"${BACKUP_REMOTE}\" ]]; then rclone copy backups \"${BACKUP_REMOTE}\" --max-age 8d; fi|" backup.sh
chmod 700 backup.sh

cat > /etc/cron.d/forgejo-backup <<'CRON'
# Haftalık Forgejo yedeği (pazartesi 03:17)
17 3 * * 1 root /opt/forgejo/backup.sh >> /opt/forgejo/backups/backup.log 2>&1
CRON
chmod 644 /etc/cron.d/forgejo-backup

# ---------------------------------------------------------------- başlatma
log "Forgejo + Caddy başlatılıyor (ilk açılış 30-60 sn sürer)..."
docker compose up -d forgejo caddy

log "Servis sağlığı bekleniyor..."
healthy=0
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/api/healthz 2>/dev/null; then healthy=1; break; fi
  sleep 2
done
(( healthy == 1 )) || { docker compose logs --tail 50 forgejo; die "Forgejo 120 sn içinde ayağa kalkmadı (yukarıdaki loglara bakın)."; }
log "Forgejo çalışıyor."

log "Yönetici hesabı oluşturuluyor: $ADMIN_USER"
docker compose exec -T -u 1000 forgejo forgejo admin user create \
  --admin --username "$ADMIN_USER" --password "$ADMIN_PASS" \
  --email "$ADMIN_EMAIL" --must-change-password=false >/dev/null \
  || warn "Yönetici hesabı oluşturulamadı (zaten var olabilir)."

if [[ $NO_RUNNER -eq 0 ]]; then
  log "Standby runner kaydediliyor..."
  if runner_token="$(docker compose exec -T -u 1000 forgejo forgejo actions generate-runner-token 2>/dev/null)"; then
    docker compose run --rm runner forgejo-runner register --no-interactive \
      --config /data/config.yml \
      --instance "https://$DOMAIN" --token "$runner_token" \
      --name vps-standby \
      --labels "standby:docker://gitea/runner-images:ubuntu-latest" >/dev/null
    docker compose up -d runner
    log "Runner kaydedildi (etiket: standby — normal zamanda job almaz)."
  else
    warn "Runner token üretilemedi; runner sonradan kaydedilmeli."
    warn "Manuel adım: docker compose exec -u 1000 forgejo forgejo actions generate-runner-token"
    warn "             docker compose run --rm runner forgejo-runner register --no-interactive --config /data/config.yml \\"
    warn "               --instance https://$DOMAIN --token <TOKEN> --name vps-standby \\"
    warn "               --labels standby:docker://gitea/runner-images:ubuntu-latest"
    warn "             docker compose up -d runner"
  fi
fi

# ---------------------------------------------------------------- özet
echo
echo "======================================================================="
echo " Kurulum tamamlandı."
echo "======================================================================="
echo " Forgejo arayüzü : https://$DOMAIN"
echo " Kullanıcı       : $ADMIN_USER"
echo " Parola          : $ADMIN_PASS   (şimdi kaydedin; .env içinde de durur)"
echo " Git SSH         : ssh://git@$DOMAIN:2222/"
echo " Updater dizini  : $APP_DIR/update-files/pub -> https://$UPDATE_DOMAIN/"
echo " Deploy hesabı   : $DEPLOY_USER (sftp-only, chroot; anahtar: /etc/ssh/authorized_keys/$DEPLOY_USER)"
echo " Yedek scripti   : $APP_DIR/backup.sh (cron: pazartesi 03:17)"
[[ -n $BACKUP_REMOTE ]] && echo " Dış yedek       : $BACKUP_REMOTE (rclone)"
echo "======================================================================="
echo
echo " Sonraki adımlar:"
echo "  1. https://$DOMAIN 'a girip giriş yapın; hesaba 2FA ekleyin."
echo "  2. New Migration -> GitHub ile repo(lar)ı mirror olarak aktarın"
echo "     (This repository will be a mirror işaretli, token ile senkron)."
echo "  3. Yedek testi: $APP_DIR/backup.sh && ls -lh $APP_DIR/backups/"
[[ -n $BACKUP_REMOTE ]] && echo "     rclone config ile '$BACKUP_REMOTE' remote'unun hazır olduğundan emin olun."
echo "  4. Uygulama tarafı: tauri.conf.json updater endpoints başında"
echo "     'https://$UPDATE_DOMAIN/latest.json' var; CSP connect-src bu alan adını içerir."
echo "  5. GitHub Secrets: UPDATE_ENDPOINT_HOST = $DEPLOY_USER@<vps>,"
echo "     UPDATE_ENDPOINT_SSH_KEY = bu hesabın private key'i,"
echo "     UPDATE_ENDPOINT_KNOWN_HOSTS = ssh-keyscan -H $UPDATE_DOMAIN çıktısı."
echo "     Release workflow'u manifest'i otomatik olarak pub/ altına kopyalar."
echo
