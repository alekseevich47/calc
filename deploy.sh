#!/usr/bin/env bash
# Универсальный деплой calc с GitHub на VPS.
# Запуск на сервере из /var/www/calc:
#   ./deploy.sh
#   ./deploy.sh --help
#
# По умолчанию: git pull → pnpm install/build → pb_hooks → nginx → restart PB → reload nginx
set -euo pipefail

DOMAIN="${CALC_DOMAIN:-calc.loomixx.ru}"
APP_DIR="${CALC_APP_DIR:-/var/www/calc}"
PB_DIR="${CALC_PB_DIR:-/opt/pocketbase-calc}"
PB_SERVICE="${CALC_PB_SERVICE:-pocketbase-calc}"
NGINX_AVAILABLE="${CALC_NGINX_AVAILABLE:-/etc/nginx/sites-available/calc}"
NGINX_ENABLED="${CALC_NGINX_ENABLED:-/etc/nginx/sites-enabled/calc}"
BRANCH="${CALC_BRANCH:-main}"

DO_PULL=1
DO_BUILD=1
DO_HOOKS=1
DO_NGINX=1
DO_PB_RESTART=1

log()  { printf '==> %s\n' "$*"; }
warn() { printf '!!  %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: ./deploy.sh [options]

  (default)  git pull + build + hooks + nginx + restart PocketBase + reload nginx

Options:
  --skip-pull       не делать git pull
  --skip-build      не pnpm install/build
  --skip-hooks      не копировать pb_hooks
  --skip-nginx      не обновлять nginx
  --skip-pb         не restart PocketBase
  --hooks-only      только hooks + restart PB
  --nginx-only      только nginx (backup → site.conf → nginx -t → reload)
  --build-only      только pull (опц.) + install/build
  -h, --help        эта справка

Env overrides:
  CALC_DOMAIN  CALC_APP_DIR  CALC_PB_DIR  CALC_PB_SERVICE
  CALC_NGINX_AVAILABLE  CALC_NGINX_ENABLED  CALC_BRANCH
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-pull)   DO_PULL=0 ;;
    --skip-build)  DO_BUILD=0 ;;
    --skip-hooks)  DO_HOOKS=0 ;;
    --skip-nginx)  DO_NGINX=0 ;;
    --skip-pb)     DO_PB_RESTART=0 ;;
    --hooks-only)
      DO_PULL=0; DO_BUILD=0; DO_NGINX=0
      DO_HOOKS=1; DO_PB_RESTART=1
      ;;
    --nginx-only)
      DO_PULL=0; DO_BUILD=0; DO_HOOKS=0; DO_PB_RESTART=0
      DO_NGINX=1
      ;;
    --build-only)
      DO_HOOKS=0; DO_NGINX=0; DO_PB_RESTART=0
      DO_BUILD=1
      ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
  shift
done

# Если скрипт лежит в клоне не в /var/www/calc — работаем относительно репо
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/package.json" && -d "$SCRIPT_DIR/deploy" ]]; then
  APP_DIR="$SCRIPT_DIR"
fi

[[ -d "$APP_DIR" ]] || die "APP_DIR not found: $APP_DIR"
cd "$APP_DIR"

need_sudo() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

git_pull() {
  log "git fetch/pull ($BRANCH)"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
  log "HEAD: $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"
}

build_frontend() {
  log "pnpm install + build"
  if [[ ! -f .env ]]; then
    if [[ -f .env.example ]]; then
      warn ".env отсутствует — копирую .env.example (проверь VITE_POCKETBASE_URL)"
      cp .env.example .env
    else
      warn ".env нет — сборка с env окружения / fallback origin"
    fi
  fi
  pnpm install
  pnpm rebuild esbuild @tailwindcss/oxide 2>/dev/null || true
  pnpm build
  [[ -f dist/index.html ]] || die "dist/index.html не собран"
  need_sudo chown -R www-data:www-data dist 2>/dev/null || true
  log "build OK → $APP_DIR/dist"
}

deploy_hooks() {
  log "pb_hooks → $PB_DIR/pb_hooks/"
  [[ -d "$PB_DIR" ]] || die "PocketBase dir missing: $PB_DIR (не путать с /opt/pocketbase)"
  need_sudo mkdir -p "$PB_DIR/pb_hooks"
  if compgen -G "$APP_DIR/pb_hooks/*.pb.js" > /dev/null; then
    need_sudo cp -v "$APP_DIR"/pb_hooks/*.pb.js "$PB_DIR/pb_hooks/"
    need_sudo chown -R www-data:www-data "$PB_DIR/pb_hooks"
  else
    warn "нет файлов pb_hooks/*.pb.js"
  fi
}

restart_pb() {
  log "restart $PB_SERVICE"
  need_sudo systemctl daemon-reload
  need_sudo systemctl restart "$PB_SERVICE"
  need_sudo systemctl --no-pager --full status "$PB_SERVICE" | head -20 || true
}

deploy_nginx() {
  local src_http="$APP_DIR/deploy/nginx.conf.example"
  local src_ssl="$APP_DIR/deploy/nginx.site.conf"
  local src
  local bak

  log "nginx site → $NGINX_AVAILABLE"

  if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
    src="$src_ssl"
    [[ -f "$src" ]] || die "missing $src"
    if [[ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
      warn "нет /etc/letsencrypt/options-ssl-nginx.conf — certbot мог недоустановить SSL snippets"
    fi
    log "TLS cert found → using nginx.site.conf (HTTPS)"
  else
    src="$src_http"
    [[ -f "$src" ]] || die "missing $src"
    warn "нет LE-серта для $DOMAIN → HTTP-only (потом: sudo certbot --nginx -d $DOMAIN)"
  fi

  if [[ -f "$NGINX_AVAILABLE" ]]; then
    bak="${NGINX_AVAILABLE}.bak.$(date +%Y%m%d%H%M%S)"
    need_sudo cp -a "$NGINX_AVAILABLE" "$bak"
    log "backup: $bak"
  fi

  need_sudo cp "$src" "$NGINX_AVAILABLE"
  need_sudo ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"

  if ! need_sudo nginx -t; then
    warn "nginx -t FAILED — откат"
    if [[ -n "${bak:-}" && -f "$bak" ]]; then
      need_sudo cp -a "$bak" "$NGINX_AVAILABLE"
      need_sudo nginx -t
    fi
    die "nginx config rejected"
  fi

  need_sudo systemctl reload nginx
  log "nginx reloaded"
}

# --- main ---
log "deploy calc @ $APP_DIR (domain=$DOMAIN)"

[[ "$DO_PULL"  -eq 1 ]] && git_pull
[[ "$DO_BUILD" -eq 1 ]] && build_frontend
[[ "$DO_HOOKS" -eq 1 ]] && deploy_hooks
[[ "$DO_PB_RESTART" -eq 1 ]] && restart_pb
[[ "$DO_NGINX" -eq 1 ]] && deploy_nginx

log "done"
if [[ "$DO_BUILD" -eq 1 || "$DO_NGINX" -eq 1 ]]; then
  log "check: curl -sI --resolve ${DOMAIN}:443:127.0.0.1 https://${DOMAIN}/ | head -5"
fi
