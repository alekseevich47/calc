# TASKS_start — деплой, PocketBase, фиксы прототипа

> Атомарный пошаговый план. Каждый пункт — самостоятельная задача с чёткими файлами
> «читать» (контекст) и «редактировать» (результат). Код не пишем, только план.
> Решённые вопросы: ПК-версия = `DesktopHomePage` внутри `HomePage.tsx` (уже в роутинге);
> `HomePcPage.tsx` — мёртвый код, удаляется. Сервер: один VPS с SSH под статику + PocketBase.
> Порядок — блоками ниже, но фактически параллелим инфру/деплой/PocketBase/auth.

---

## Блок 0. Предпосылки инфраструктуры (без этого дальше нельзя нормально собрать/деплоить)

### 0.1 Починить `package.json` и добавить служебные файлы
- **Читать:** `package.json`, `vite.config.ts`.
- **Редактировать:** `package.json` (перенести `react`/`react-dom` из `peerDependencies` в `dependencies`; убрать неиспользуемые `motion`, `@mui/*`, `@emotion/*`, `recharts`, `react-dnd*`, `sonner`, `vaul`, `cmdk`, `react-hook-form`, `react-slick`, `react-responsive-masonry`, `embla-carousel-react`, `input-otp`, `react-popper`, `@popperjs/core`, `next-themes`, `canvas-confetti`, `tw-animate-css`, `react-day-picker` — если не понадобятся под новые формы/датапикер, свериться перед удалением); добавить `scripts.preview`; добавить `scripts.typecheck`/`lint` после п.0.2.
- **Создать:** `.gitignore` (`node_modules`, `dist`, `.env`, `.env.*`, кроме `.env.example`), `tsconfig.json` (+`tsconfig.node.json` при необходимости под vite.config.ts).
- **Установить локально:** `pnpm install` (в проекте `pnpm-workspace.yaml`, значит пакетный менеджер — pnpm) → зафиксировать `pnpm-lock.yaml` в репозитории.

### 0.2 Базовый lint/typecheck (минимально, не блокировать прототип)
- **Создать:** `eslint.config.js` (flat config, minimal: `@typescript-eslint`, `eslint-plugin-react-hooks`).
- **Не трогать:** `src/app/components/ui/*`, инлайн-стили страниц — линт не должен ломать существующий визуал/форматирование.

### 0.3 `public/` и PWA-заготовка (манифест, иконки, meta)
- **Читать:** `index.html`, `.cursor/rules/stack.mdc` (разделы «Дизайн-токены», «Платформы и iOS-ограничения»).
- **Создать:** `public/manifest.webmanifest`, `public/icons/*` (192/512, maskable), `public/favicon.ico`, `public/robots.txt`.
- **Редактировать:** `index.html` — `lang="ru"`, `<link rel="manifest">`, `theme-color` (`#FF6B00`), `apple-mobile-web-app-*` теги, `apple-touch-icon`.
- Онбординг «На экран Домой» (компонент) — отдельная задача в Блоке 3, здесь только манифест/мета.

### 0.4 Service Worker (базовый, для установки PWA + офлайн-кэш статики)
- **Читать:** `vite.config.ts`.
- **Установить:** `vite-plugin-pwa` (генерирует SW + манифест интеграцию, инжектит регистрацию).
- **Редактировать:** `vite.config.ts` (подключить `VitePWA({ registerType: 'autoUpdate', ... })`), `src/main.tsx` (при необходимости — регистрация, если плагин не делает сам).
- Кэшировать пока только статику приложения (app shell). Кэш данных — отдельно, через IndexedDB-слой (Блок 2), не через SW.

---

## Блок 1. Критичные фиксы текущего прототипа (десктоп/роутинг/баги)

### 1.1 Убрать дублирующий route на `path: "/"`, добавить auth guard
- **Читать:** `src/app/routes.ts`, `src/pages/AuthPage.tsx`, `src/pages/AppShell.tsx`.
- **Редактировать:** `src/app/routes.ts` (например: `/` → `AuthPage`, `/app` или `/home` группа под guard-обёрткой `loader`/wrapper-компонентом).
- **Создать:** `src/app/RequireAuth.tsx` (обёртка-guard, редирект на `/` если нет валидной сессии — сессия появится после Блока 4).
- Пока нет PocketBase-auth — guard временно на основе локального флага/заглушки, потом переключить на реальную проверку (см. Блок 4).

### 1.2 Удалить мёртвый код `HomePcPage.tsx`
- **Читать:** `src/pages/HomePcPage.tsx` (проверить, нет ли уникальной логики/справочников, которых нет в `DesktopHomePage`, — если есть отличия в `MARKING_TYPES` и т.п., сверить со `HomePage.tsx`).
- **Удалить:** `src/pages/HomePcPage.tsx`.
- **Проверить на упоминания:** `src/app/routes.ts`, любые nav-ссылки на `/home-pc` (найдены в самом `HomePcPage.tsx`, но проверить остальные файлы).

### 1.3 Общий portal для модалок/шитов на десктопе
- **Читать:** `src/pages/AppShell.tsx` (desktop-ветка рендера), `src/pages/HistoryPage.tsx` (использование `#phone-portal`), `src/pages/ProfilePage.tsx` (использование `#phone-portal`), `src/pages/HomePage.tsx` (confirm-модалка, `DesktopHomePage`).
- **Редактировать:** `src/pages/AppShell.tsx` — добавить контейнер-portal (например `#app-portal`) и в desktop-, и в mobile-ветке рендера (единый id, чтобы `HistoryPage`/`ProfilePage`/`HomePage` не завязывались на mobile-only разметку).
- **Редактировать:** `src/pages/HistoryPage.tsx`, `src/pages/ProfilePage.tsx` — заменить `#phone-portal` на новый универсальный id.
- **Редактировать:** `src/pages/HomePage.tsx` — убедиться, что `ConfirmSheet`/модалка итогов рендерится и в desktop-ветке (`DesktopHomePage`), не только в mobile.

### 1.4 MiniCalendar — убрать хардкод 390px
- **Читать:** `src/pages/HistoryPage.tsx` (расчёт `left: Math.min(left, 390 - W - 8)`).
- **Редактировать:** `src/pages/HistoryPage.tsx` — считать доступную ширину от реального контейнера (`getBoundingClientRect`/`ResizeObserver` или CSS `clamp`/`position` относительно портала), а не константы.

### 1.5 Разное (мелкие фиксы, по ходу трогаемых файлов)
- **Читать/редактировать:** `src/pages/ProfilePage.tsx` — logout должен сбрасывать состояние сессии, не просто `navigate("/")` (доработать вместе с Блоком 4, когда появится auth-стор).
- **Читать/редактировать:** `src/pages/AuthPage.tsx` — простая валидация (disabled submit при пустых полях), `remember` реально влияет на persist сессии (после Блока 4).
- **Читать:** `src/pages/AppShell.tsx`, `src/pages/HomePage.tsx` — унифицировать `syncStatus` (сейчас independent state в двух местах) в единый источник (см. Блок 2, сервис синка).
- **Читать:** `src/pages/HistoryPage.tsx` (строка с «Всего заработано» — сумма `perPerson()` по сменам) — сверить бизнес-логику деления зарплаты поровну (`.cursor/rules/stack.mdc`, раздел «История») и исправить агрегацию.

---

## Блок 2. Слой данных: PocketBase + локальный кэш/офлайн-очередь

> Здесь код (клиент) пишем, но схему/коллекции/пользователей в PocketBase создаёт пользователь сам — только даю точные инструкции что создавать.

### 2.1 Установка PocketBase на сервер (выполняет пользователь на VPS)
Инструкция (сервер = тот же VPS, что и статика):
1. Скачать бинарник PocketBase (последний релиз, Linux amd64) с GitHub releases проекта `pocketbase/pocketbase`, распаковать в `/opt/pocketbase/`.
2. Создать systemd unit `/etc/systemd/system/pocketbase.service`: `ExecStart=/opt/pocketbase/pocketbase serve --http=127.0.0.1:8090`, `Restart=always`, рабочая директория `/opt/pocketbase`.
3. `systemctl enable --now pocketbase`.
4. Первый вход в админку через `http://127.0.0.1:8090/_/` (временно через SSH-тоннель: `ssh -L 8090:127.0.0.1:8090 user@server`), создать admin-аккаунт.
5. В Nginx (Блок 3) добавить проксирование `/pb/` или поддомен `pb.<домен>` → `127.0.0.1:8090`, чтобы PocketBase был доступен снаружи по HTTPS.
6. Настроить регулярный backup `pb_data/` (cron + `pocketbase` встроенный backup API либо просто `rsync`/`tar` в cron).

### 2.2 Коллекции PocketBase (создаёт пользователь через админку/миграции)
- **Читать для схемы полей:** `src/pages/HomePage.tsx` (константы `LOCATION_OPTIONS`, `MARKING_NUMS`, `MARKING_TYPES`, `MATERIAL_OPTIONS`, `ALL_PARTICIPANTS`, структура строки таблицы), `src/pages/HistoryPage.tsx` (структура смены `MOCK_SHIFTS`), `.cursor/rules/stack.mdc` (разделы «Главная», «История»).
- Коллекции (auth-коллекция `users` — встроенная, остальные `base`):
  - `users` (встроенная auth) — поля по умолчанию + `full_name`. Регистрации нет — пользователей создаёт админ вручную.
  - `locations` — `name` (текст). Справочник населённых пунктов/трасс.
  - `marking_numbers` — `number` (текст/число), связь с типами (если типы зависят от номера).
  - `marking_types` — `name`, `marking_number` (relation → `marking_numbers`), т.к. тип зависит от номера разметки.
  - `materials` — `name` (краска/пластик).
  - `shifts` — `date` (date), `author` (relation → `users`), `participants` (relation → `users`, multiple), `status` (select: `draft`/`confirmed`), `created`/`updated` (авто).
  - `shift_rows` — `shift` (relation → `shifts`), `location` (relation → `locations`), `marking_number` (relation → `marking_numbers`), `marking_type` (relation → `marking_types`, опционально), `volume` (number), `material` (relation → `materials`), `rate` (number), `amount` (number, можно хранить вычисленным при сохранении), `sort_order` (number).
- Правила доступа (Access Rules) на каждой коллекции: только авторизованные пользователи; `shifts`/`shift_rows` — CRUD для авторизованных (список бригады небольшой, без сложных ролей на MVP); справочники (`locations`, `marking_numbers`, `marking_types`, `materials`) — `read` всем авторизованным, `create/update/delete` только админ (через админку, без API-правил на запись).

### 2.3 Клиент PocketBase во фронтенде
- **Установить:** `pocketbase` (npm пакет — официальный JS SDK).
- **Создать:** `src/lib/pocketbase.ts` (singleton `PocketBase` клиент, base URL из `import.meta.env.VITE_POCKETBASE_URL`, `authStore` persist в `localStorage` — поведение по умолчанию в SDK).
- **Создать:** `.env.example` (`VITE_POCKETBASE_URL=https://pb.<домен>`), реальный `.env` — не коммитить (см. `.gitignore` из 0.1).

### 2.4 Слой офлайн-кэша и очереди синка (IndexedDB)
- **Читать:** `.cursor/rules/stack.mdc` (раздел «Синхронизация» — офлайн-очередь, `navigator.storage.persist()`, индикатор несинхронизированных данных), `src/pages/HomePage.tsx` (где сейчас `rows`/`onSave` — заглушка), `src/pages/HistoryPage.tsx` (где сейчас mock `MOCK_SHIFTS`).
- **Установить:** `idb` (тонкая обёртка над IndexedDB) или `dexie` — выбрать одну (рекомендация: `idb`, т.к. проще и легче).
- **Создать:** `src/lib/db.ts` (схема IndexedDB: таблицы `shifts_cache`, `dictionaries_cache`, `sync_queue`), `src/lib/sync.ts` (логика: при онлайне — вычитать очередь → отправить в PocketBase → обновить кэш; при старте — подтянуть справочники и последние смены в кэш; `navigator.storage.persist()` вызывать здесь при старте приложения).
- **Редактировать:** `src/main.tsx` или `src/app/App.tsx` — инициализация `sync.ts` при старте (подписка на `online`/`offline`, начальная синхронизация).

### 2.5 Подключить реальные данные в UI (заменить mock)
- **Читать/редактировать:** `src/pages/HomePage.tsx` — заменить hardcoded справочники (`LOCATION_OPTIONS` и др.) и `INITIAL_ROWS` на чтение из `src/lib/db.ts` (кэш) с фоновым обновлением из PocketBase через `src/lib/sync.ts`; `onSave` confirm — писать смену+строки в очередь синка (не напрямую в сеть, чтобы работал офлайн).
- **Читать/редактировать:** `src/pages/HistoryPage.tsx` — заменить `MOCK_SHIFTS` на чтение сохранённых смен из кэша/PocketBase (связь Главная↔История, которой сейчас нет).
- **Читать/редактировать:** `src/pages/ProfilePage.tsx` — статистика (`STATS`) считать из реальных смен пользователя вместо mock; статус синка брать из единого источника (`src/lib/sync.ts`), убрать дублирование с `AppShell.tsx` (см. 1.5).
- **Читать/редактировать:** `src/pages/AppShell.tsx` — индикатор сети/синка (`syncStatus`) подключить к `src/lib/sync.ts` вместо локальной заглушки.

### 2.6 Индикатор несинхронизированных данных + `navigator.storage.persist()`
- **Редактировать:** `src/components/shared.tsx` (`StatusBadge`) — учитывать состояние очереди (`sync_queue` не пуста → «не синхронизировано»).
- Уже покрыто вызовом в 2.4 (`navigator.storage.persist()` при старте) — здесь просто сверить, что вызов происходит один раз и не блокирует рендер.

---

## Блок 3. Деплой на VPS через git

### 3.1 Подготовка сервера (выполняет пользователь по SSH)
1. Установить Node.js LTS (через `nvm` или `apt`/`nodesource`) — нужен для сборки фронтенда на сервере (или собирать в CI, см. 3.3, и заливать только `dist/`).
2. Установить `pnpm` (`corepack enable` или `npm i -g pnpm`).
3. Установить Nginx.
4. Установить `certbot` (Let's Encrypt) для HTTPS.
5. Настроить `ufw`: разрешить `22`, `80`, `443`, закрыть `8090` наружу (PocketBase только через Nginx-проксирование).
6. Создать пользователя без root для деплоя (или деплоить под существующим non-root с sudo только где нужно).
7. DNS: A-запись домена (и поддомена `pb.<домен>`, если решено делать PocketBase на поддомене) → IP сервера.

### 3.2 Git на сервере
1. `git clone <repo>` в `/var/www/calc` (или аналог).
2. Настроить деплой-ключ (SSH deploy key с read-only доступом к репозиторию) для `git pull` без интерактивного логина.
3. Первая сборка: `pnpm install && pnpm run build` → результат в `dist/`.

### 3.3 CI/CD (GitHub Actions) — автодеплой по push в main
- **Создать:** `.github/workflows/deploy.yml` — на push в `main`: checkout → `pnpm install` → `pnpm run build` → деплой через SSH (`appleboy/ssh-action` или `scp`/`rsync` action) — либо (а) собрать в CI и залить только `dist/` на сервер (не нужен Node на проде), либо (б) по SSH сделать `git pull && pnpm install && pnpm run build` на сервере. Рекомендация: вариант (а) — меньше зависимостей на проде, быстрее и безопаснее.
- Секреты в GitHub: `SSH_HOST`, `SSH_USER`, `SSH_KEY` (приватный ключ деплоя), путь на сервере.

### 3.4 Nginx-конфиг
- **Создать (на сервере, вне репозитория, или как референс-файл в репо `deploy/nginx.conf`):**
  - Server block на 80 → редирект на 443.
  - Server block на 443 (`ssl_certificate` от certbot) — `root /var/www/calc/dist;` `try_files $uri /index.html;` (SPA-роутинг под react-router).
  - `location /pb/ { proxy_pass http://127.0.0.1:8090/; }` (или отдельный `server_name pb.<домен>` с собственным TLS-сертификатом, если решили делать поддомен).
  - Заголовки кэширования для статики (`Cache-Control` для `assets/*`, без кэша для `index.html`), заголовки для `manifest.webmanifest`/`sw.js` — no-cache на сам SW.
- **Создать (в репозитории для истории/референса):** `deploy/nginx.conf.example`.

### 3.5 CORS в PocketBase под прод-домен
- Пользователь настраивает в PocketBase (через `.env`/флаги запуска или в самом Nginx, если PocketBase проксируется тем же доменом — тогда CORS не нужен, только если фронтенд и PocketBase на разных origin).
- Если PocketBase на поддомене `pb.<домен>` — указать `VITE_POCKETBASE_URL` в `.env` продовой сборки на этот поддомен, в PocketBase Settings → допустить origin основного домена.

---

## Блок 4. Реальная авторизация через PocketBase (параллельно с Блоком 2)

### 4.1 Auth-стор и guard
- **Читать:** `src/pages/AuthPage.tsx`, `src/lib/pocketbase.ts` (из 2.3).
- **Редактировать:** `src/pages/AuthPage.tsx` — заменить `setTimeout` на `pb.collection('users').authWithPassword(login, password)`; ошибки показывать в форме.
- **Редактировать:** `src/app/RequireAuth.tsx` (из 1.1) — проверять `pb.authStore.isValid`.
- **Редактировать:** `src/pages/ProfilePage.tsx` — logout через `pb.authStore.clear()` + `navigate("/")`.
- «Запомнить меня»: PocketBase JS SDK по умолчанию хранит токен в `localStorage` — де-факто «запомнить» всегда включено; если нужен вариант без запоминания — хранить токен в `sessionStorage` через кастомный `authStore`, переключаемый флагом `remember` из формы.

### 4.2 Пользователи бригады
- Создаются в PocketBase через админку (без публичной регистрации — соответствует `.cursor/rules/stack.mdc`, раздел «Авторизация»).

---

## Блок 5. PWA-финиш (после того как основной функционал стабилен)

### 5.1 Онбординг «На экран Домой» для iOS
- **Читать:** `.cursor/rules/stack.mdc` (раздел «Платформы и iOS-ограничения»), `src/pages/AppShell.tsx`.
- **Создать:** `src/components/IosInstallPrompt.tsx` (детект iOS Safari + не standalone → показ инструкции один раз/с периодичностью, `localStorage` флаг «уже показывали»).
- **Редактировать:** `src/pages/AppShell.tsx` — подключить компонент в общий layout.

### 5.2 Проверка PWA-чеклиста
- Lighthouse PWA audit после деплоя (Блок 3) — manifest, SW, иконки, `theme-color`, offline fallback.

---

## Файлы, которые трогать не нужно (сохранить как есть)

- `src/app/components/ui/*` (shadcn kit) — не подключать без отдельного решения.
- Инлайн-стили, `@keyframes` в `src/components/shared.tsx`, `styles/*.css` — визуал не переписываем.
- `src/app/components/figma/ImageWithFallback.tsx` — не используется, не трогать (не мешает).

## Открытые вопросы (уточнить по ходу, не блокируют старт)

- Домен для продакшена и решение «поддомен `pb.*` vs `/pb/` путь» для PocketBase — нужно до Блока 3.4.
- Список пользователей бригады (для создания в PocketBase, Блок 4.2).
- Нужен ли `tailwind.config` явно (сейчас Tailwind v4 через Vite-плагin без конфига) — пока не трогаем, если не понадобится кастомизация.
