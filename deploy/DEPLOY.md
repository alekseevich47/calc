# Деплой calc на calc.loomixx.ru

Полная инструкция: первый запуск и обновления.

| | |
|---|---|
| URL | `https://calc.loomixx.ru/` |
| Код | `/var/www/calc` |
| Статика | `/var/www/calc/dist` |
| PocketBase calc | `/opt/pocketbase-calc` → `127.0.0.1:8095` |
| Hooks PB | `/opt/pocketbase-calc/pb_hooks/` |
| Другой проект | `/opt/pocketbase` — **не трогать** |

Приложение на **корне** поддомена (`Vite base: '/'`). Same-origin: API — `/api/`, админка PB — `/_/`.

Связанные файлы: `deploy.sh` (обновление с GitHub), `deploy/nginx.conf.example`, `deploy/nginx.site.conf`, `deploy/AI_QUICK_INPUT.md`, `deploy/PUSH_NOTIFICATIONS.md`, `.env.example`.

### Быстрое обновление на сервере

```bash
cd /var/www/calc
./deploy.sh
# или: bash deploy.sh
```

Скрипт: `git pull` → `pnpm install/build` → копия `pb_hooks` → restart `pocketbase-calc`.  
**Nginx по умолчанию не трогает** (чтобы не сбивать 443/certbot). Явно: `bash deploy.sh --nginx`.

```bash
bash deploy.sh --help
bash deploy.sh --hooks-only
bash deploy.sh --nginx-only   # только если нужно обновить sites-available/calc из nginx.site.conf
```

---

## 0. Чеклист первого запуска

1. [ ] DNS A-запись `calc` → IP VPS  
2. [ ] Node 20 + pnpm + nginx + certbot  
3. [ ] PocketBase в `/opt/pocketbase-calc` (порт **8095**)  
4. [ ] `git clone` → `/var/www/calc`  
5. [ ] `.env` + `pnpm build`  
6. [ ] Nginx `sites-available/calc` + TLS  
7. [ ] Схема PB (`schema.json`) + hooks  
8. [ ] Проверка UI / API / SW  

---

## 1. DNS

У регистратора `loomixx.ru`:

- **A** `calc` → IP сервера  

Проверка:

```bash
dig +short calc.loomixx.ru
```

---

## 2. Пакеты на VPS

```bash
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt update
sudo apt install -y nodejs nginx certbot python3-certbot-nginx git unzip curl

sudo corepack enable
sudo corepack prepare pnpm@9 --activate

node -v   # v20.x
pnpm -v
```

Firewall: открыть `80`, `443`, SSH. Порт **8095** наружу **не** открывать.

---

## 3. PocketBase calc (отдельный от `/opt/pocketbase`)

### 3.1 Скачать бинарник

```bash
sudo mkdir -p /opt/pocketbase-calc/pb_hooks
cd /opt/pocketbase-calc

# Версию можно сверить с другим проектом: /opt/pocketbase/pocketbase --version
VER=0.40.2

sudo curl -L -o pb.zip \
  "https://github.com/pocketbase/pocketbase/releases/download/v${VER}/pocketbase_${VER}_linux_amd64.zip"

sudo unzip -o pb.zip pocketbase
sudo chmod +x pocketbase
sudo rm pb.zip

./pocketbase --version
```

ARM-сервер: `linux_arm64` вместо `linux_amd64`.  
Релизы: https://github.com/pocketbase/pocketbase/releases

### 3.2 systemd

Файл `/etc/systemd/system/pocketbase-calc.service`:

```ini
[Unit]
Description=PocketBase calc
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/pocketbase-calc
ExecStart=/opt/pocketbase-calc/pocketbase serve --http=127.0.0.1:8095
Restart=on-failure

# Опционально — ИИ быстрый ввод (см. AI_QUICK_INPUT.md)
# Environment=DEEPSEEK_API_KEY=sk-...
# Environment=DEEPSEEK_MODEL=deepseek-v4-flash

# Опционально — Web Push (см. ниже «VAPID» и PUSH_NOTIFICATIONS.md)
# Environment=VAPID_PUBLIC_KEY=...
# Environment=VAPID_PRIVATE_KEY=...
# Environment=VAPID_SUBJECT=mailto:you@example.com

[Install]
WantedBy=multi-user.target
```

**VAPID (если нужен Web Push):**

| Переменная | Что ставить |
|---|---|
| `VAPID_PUBLIC_KEY` | публичный ключ (длинная строка, обычно начинается с `B…`) |
| `VAPID_PRIVATE_KEY` | парный приватный ключ (**только на сервере**, не в фронт) |
| `VAPID_SUBJECT` | `mailto:ваш@email.com` (контакт для push-сервисов) |

Готовая пара из проекта (уже в `.env.example` / `PUSH_NOTIFICATIONS.md`):

```ini
Environment=VAPID_PUBLIC_KEY=BO9SpRxKX-YxSc-xbMyBvx5U_RL07CyR6TesIlY47ai-naKW4ZXw74-tpxBdieoEbEqLzBx6tyZo-mYtT8qnbko
Environment=VAPID_PRIVATE_KEY=hUggBoQWFfulkWqemIzyNl-mqF-HPh7y-zyhao2LIrI
Environment=VAPID_SUBJECT=mailto:kkabenyuk@gmail.com
```

Тот же **public** должен быть в сборке фронта как `VITE_VAPID_PUBLIC_KEY`.  
Свою пару: `npx web-push generate-vapid-keys` (на машине с Node). Без push — строки можно не раскомментировать.

Права и запуск:

```bash
sudo chown -R www-data:www-data /opt/pocketbase-calc
sudo systemctl daemon-reload
sudo systemctl enable --now pocketbase-calc
sudo systemctl status pocketbase-calc
```

### 3.3 Первый admin (суперюзер)

Одной командой на VPS (из каталога PB, **до или после** старта сервиса):

```bash
cd /opt/pocketbase-calc
sudo -u www-data ./pocketbase superuser upsert admin@example.com 'СложныйПароль'
```

`upsert` — создать или обновить. Альтернатива: `./pocketbase superuser create EMAIL PASS`.

Потом админка: https://calc.loomixx.ru/_/ (после Nginx) или туннель:

```bash
ssh -L 8095:127.0.0.1:8095 USER@VPS_IP
# http://127.0.0.1:8095/_/
```

### 3.4 Схема коллекций

Импортировать `schema.json` из репозитория (админка → Settings → Import collections) или создать коллекции вручную по схеме.

Проверить Access Rules (особенно `users.createRule` для регистрации, изоляция `shifts` / `shift_rows` по `author`).

---

## 4. Код: git clone → `/var/www/calc`

Подставь свой `ORG/REPO` (например `username/calc`).

### 4.1 Public-репозиторий

```bash
sudo mkdir -p /var/www
sudo chown "$USER":"$USER" /var/www
git clone https://github.com/ORG/REPO.git /var/www/calc
```

### 4.2 Private — deploy key

```bash
ssh-keygen -t ed25519 -C "calc-deploy" -f ~/.ssh/calc_deploy -N ""
cat ~/.ssh/calc_deploy.pub
```

GitHub → репозиторий → **Settings → Deploy keys → Add deploy key** (read-only) → вставить pubkey.

`~/.ssh/config`:

```
Host github.com-calc
  HostName github.com
  User git
  IdentityFile ~/.ssh/calc_deploy
  IdentitiesOnly yes
```

```bash
git clone git@github.com-calc:ORG/REPO.git /var/www/calc
```

---

## 5. Env и первая сборка

```bash
cd /var/www/calc
cp .env.example .env
nano .env
```

Минимум в `.env`:

```bash
VITE_POCKETBASE_URL=https://calc.loomixx.ru

# если нужен Web Push — тот же public key, что VAPID_PUBLIC_KEY в systemd:
# VITE_VAPID_PUBLIC_KEY=BOxxxx...
```

Сборка:

```bash
pnpm install
pnpm build
# → /var/www/calc/dist/
```

Если pnpm 11 пишет `ERR_PNPM_IGNORED_BUILDS` / `Ignored build scripts: esbuild, @tailwindcss/oxide` — в репо уже разрешено в `pnpm-workspace.yaml` (`allowBuilds: true`). Подтяни свежий `main` и снова `pnpm install && pnpm build`. Временно без git:

```bash
# интерактивно:
pnpm approve-builds
# или сразу:
pnpm rebuild esbuild @tailwindcss/oxide
pnpm build
```

Права (чтобы nginx читал статику):

```bash
sudo chown -R www-data:www-data /var/www/calc/dist
# или chmod/ACL по вашей политике; исходники могут оставаться у deploy-пользователя
```

---

## 6. Nginx + HTTPS

### 6.1 Конфиг

Референс в репо: `deploy/nginx.conf.example`.

```bash
sudo cp /var/www/calc/deploy/nginx.conf.example /etc/nginx/sites-available/calc
sudo ln -sf /etc/nginx/sites-available/calc /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**Не** править конфиги других проектов. Файл сайта — `calc`; внутри `server_name calc.loomixx.ru`.

В примере сначала только **`listen 80`** (без ssl). Иначе `nginx -t` падает: `no "ssl_certificate" is defined`. TLS добавляет certbot.

### 6.2 TLS

```bash
sudo certbot --nginx -d calc.loomixx.ru
```

Certbot допишет `listen 443 ssl`, пути к сертификатам и редирект. На новых nginx вместо `listen … http2` будет `http2 on;` — это нормально.

### 6.3 Проверка кэша SW

```bash
curl -sI https://calc.loomixx.ru/sw.js | grep -i cache-control
# ожидается: Cache-Control: no-cache
```

Или скрипт: `bash deploy/fix-nginx-sw-cache.sh` (проверка URL).

---

## 7. Hooks PocketBase

`git pull` / CI **не** кладут hooks в каталог PB. Копировать вручную:

```bash
sudo cp /var/www/calc/pb_hooks/*.pb.js /opt/pocketbase-calc/pb_hooks/
sudo chown -R www-data:www-data /opt/pocketbase-calc/pb_hooks
sudo systemctl restart pocketbase-calc
```

| Hook | Зачем |
|---|---|
| `parse_quick_input.pb.js` | ИИ-быстрый ввод → DeepSeek |
| `send_notification_push.pb.js` | Web Push после записи в `notifications` |

Для push также нужны `scripts/send-web-push.mjs` и зависимость `web-push` в `/var/www/calc` (`pnpm install`). Подробности: `deploy/PUSH_NOTIFICATIONS.md`, `deploy/AI_QUICK_INPUT.md`.

---

## 8. Секреты

### На сервере (основной путь — git clone)

| Что | Где |
|---|---|
| Deploy key (private repo) | GitHub Deploy keys + `~/.ssh/calc_deploy` |
| `VITE_POCKETBASE_URL` | `/var/www/calc/.env` при `pnpm build` |
| `VITE_VAPID_PUBLIC_KEY` | `.env` при сборке (если push) |
| `VAPID_*` | только `pocketbase-calc.service` |
| `DEEPSEEK_API_KEY` | только `pocketbase-calc.service` |
| SSH к VPS | личный ключ; не в репозиторий |

`.env` и приватные ключи **не коммитить**.

### GitHub Actions (опционально)

Workflow: `.github/workflows/deploy.yml` — собирает `dist/` и заливает rsync на `/var/www/calc/dist/`.

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Значение |
|---|---|
| `SSH_HOST` | IP / hostname VPS |
| `SSH_USER` | пользователь SSH |
| `SSH_KEY` | приватный ключ деплоя (PEM целиком) |

В workflow порт сейчас **22171**, URL сборки — `https://calc.loomixx.ru`.  
Hooks через Actions **не** деплоятся — копировать вручную (раздел 7).

Если деплоишь только через `git pull` на сервере — Secrets для Actions не обязательны.

---

## 9. Обновление (повторные выгрузки)

Рекомендуется:

```bash
cd /var/www/calc
bash deploy.sh
# или: chmod +x deploy.sh && ./deploy.sh
```

Вручную:

```bash
cd /var/www/calc
git pull
pnpm install
pnpm build

# если менялись hooks:
sudo cp pb_hooks/*.pb.js /opt/pocketbase-calc/pb_hooks/
sudo systemctl restart pocketbase-calc
```

Nginx reload — только если менялся конфиг сайта (или через `./deploy.sh` / `./deploy.sh --nginx-only`).

После смены SW на телефоне иногда: очистить данные сайта / переустановить PWA («На экран Домой»).

---

## 10. Проверка после деплоя

1. https://calc.loomixx.ru/ — открывается UI  
2. Логин / регистрация работают  
3. https://calc.loomixx.ru/_/ — админка PB  
4. API отвечает через тот же origin (`/api/...`)  
5. `curl -sI https://calc.loomixx.ru/sw.js` → `Cache-Control: no-cache`  
6. ИИ (если ключ): `POST https://calc.loomixx.ru/api/parse-quick-input` — см. `AI_QUICK_INPUT.md`  
7. Логи PB: `sudo journalctl -u pocketbase-calc -f`

---

## 11. Карта URL

| Путь | Назначение |
|---|---|
| `/` | SPA (PWA) |
| `/home`, `/history`, `/profile`, `/register` | маршруты приложения |
| `/api/*` | PocketBase API |
| `/_/*` | админка PocketBase |
| `/sw.js`, `/manifest.webmanifest` | PWA (no-cache) |

---

## 12. Типичные ошибки

| Симптом | Причина |
|---|---|
| Чёрный экран / 404 ассетов | Собрали со старым `base: '/calc/'` или не тот `root` в nginx |
| 404 на ИИ / push API | Hook не в `/opt/pocketbase-calc/pb_hooks/` или PB не перезапущен |
| Старое приложение на телефоне | `sw.js` кэшируется год — нет no-cache location |
| Логин «нет сети» при онлайн | Неверный `VITE_POCKETBASE_URL` в сборке |
| Сломан другой проект | Правили общий nginx / `/opt/pocketbase` вместо calc |

---

## Краткая шпаргалка

```bash
# первый раз (после DNS, Node, PB, clone, nginx+certbot):
cd /var/www/calc && cp .env.example .env   # VITE_POCKETBASE_URL=https://calc.loomixx.ru
pnpm install && pnpm build
sudo cp pb_hooks/*.pb.js /opt/pocketbase-calc/pb_hooks/
sudo systemctl restart pocketbase-calc

# дальше обновления:
cd /var/www/calc && ./deploy.sh
```
