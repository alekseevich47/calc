#!/bin/bash
set -euo pipefail

CONF=/etc/nginx/sites-available/urban
BACKUP="$HOME/urban.bak.swcache.$(date +%Y%m%d%H%M%S)"

cp -a "$CONF" "$BACKUP"
echo "Backup: $BACKUP"

python3 << 'PY'
from pathlib import Path
path = Path("/etc/nginx/sites-available/urban")
text = path.read_text()

# Already patched?
if "location = /calc/sw.js" in text and 'add_header Cache-Control "no-cache"' in text:
    print("ALREADY_PATCHED: /calc/sw.js no-cache present")
    raise SystemExit(0)

old = """# === 9. Фронтенд Калькулятора ===
location = /calc {
    return 301 /calc/;
}

    location /calc/ {
        # Впишите сюда путь к папке, где лежит index.html из Шага 1 (слэш в конце важен!)
        alias /var/www/calc/dist/; 
        index index.html;
        try_files $uri $uri/ /calc/index.html;

        location ~* \\.(?:js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control \"public, no-transform\";
        }
    }"""

new = """# === 9. Фронтенд Калькулятора ===
location = /calc {
    return 301 /calc/;
}

    # SW / HTML / manifest — без долгого кэша (иначе телефон год держит старый SW)
    location = /calc/sw.js {
        alias /var/www/calc/dist/sw.js;
        add_header Cache-Control \"no-cache\" always;
    }
    location = /calc/index.html {
        alias /var/www/calc/dist/index.html;
        add_header Cache-Control \"no-cache\" always;
    }
    location = /calc/manifest.webmanifest {
        alias /var/www/calc/dist/manifest.webmanifest;
        add_header Cache-Control \"no-cache\" always;
        default_type application/manifest+json;
    }
    location ~* ^/calc/(workbox-[^/]+\\.js)$ {
        alias /var/www/calc/dist/$1;
        add_header Cache-Control \"no-cache\" always;
    }

    location /calc/ {
        alias /var/www/calc/dist/;
        index index.html;
        try_files $uri $uri/ /calc/index.html;

        location ~* \\.html$ {
            add_header Cache-Control \"no-cache\" always;
        }

        location ~* \\.(?:js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control \"public, no-transform\";
        }
    }"""

if old not in text:
    raise SystemExit("OLD BLOCK NOT FOUND — abort, config unchanged")
path.write_text(text.replace(old, new, 1))
print("OK replaced calc block")
PY

reload_ok=0
if sudo -n nginx -t 2>/tmp/nginx-t.err; then
  if sudo -n systemctl reload nginx; then
    reload_ok=1
    echo RELOADED
  fi
fi

if [ "$reload_ok" -eq 0 ]; then
  echo "CONFIG_WRITTEN; nginx reload needs passwordless sudo or manual:"
  echo "  sudo nginx -t && sudo systemctl reload nginx"
  cat /tmp/nginx-t.err 2>/dev/null || true
  exit 2
fi

echo "--- verify ---"
curl -sI https://urban42.online/calc/sw.js | tr -d '\r' | grep -iE 'HTTP/|cache-control|expires'
