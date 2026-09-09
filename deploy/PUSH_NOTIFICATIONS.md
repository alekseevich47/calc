# Web Push (пробный)

Пробные системные уведомления PWA при закрытом приложении. Можно откатить.

## Важно: где лежит PocketBase

Сервис `pocketbase-calc`:

- `WorkingDirectory=/opt/pocketbase-calc`
- hooks: **`/opt/pocketbase-calc/pb_hooks/`** (не `/var/www/calc/pb_hooks/`)
- фронт / `scripts` / `node_modules/web-push`: `/var/www/calc`

## Что нужно на VPS

1. Импортировать коллекции из `schema.json` (или создать вручную в админке):
   - `notifications` — `from`, `to`, `text`
   - `push_subscriptions` — `user`, `endpoint`, `p256dh`, `auth`

2. Скопировать hook рядом с бинарником PB:

```bash
scp pb_hooks/send_notification_push.pb.js calc-vps:/opt/pocketbase-calc/pb_hooks/
# скрипт отправки — в репо фронта:
# /var/www/calc/scripts/send-web-push.mjs + pnpm install (web-push)
cd /var/www/calc && pnpm install
```

3. Env в `pocketbase-calc.service` (ключи должны совпадать с `VITE_VAPID_PUBLIC_KEY` при сборке):

```ini
[Service]
Environment=VAPID_PUBLIC_KEY=BO9SpRxKX-YxSc-xbMyBvx5U_RL07CyR6TesIlY47ai-naKW4ZXw74-tpxBdieoEbEqLzBx6tyZo-mYtT8qnbko
Environment=VAPID_PRIVATE_KEY=hUggBoQWFfulkWqemIzyNl-mqF-HPh7y-zyhao2LIrI
Environment=VAPID_SUBJECT=mailto:kkabenyuk@gmail.com
```

4. Сборка фронта с публичным ключом:

```bash
VITE_VAPID_PUBLIC_KEY=BO9SpRxKX-YxSc-xbMyBvx5U_RL07CyR6TesIlY47ai-naKW4ZXw74-tpxBdieoEbEqLzBx6tyZo-mYtT8qnbko \
VITE_POCKETBASE_URL=https://calc.loomixx.ru \
pnpm build
```

5. Перезапуск PB:

```bash
sudo systemctl daemon-reload
sudo systemctl restart pocketbase-calc
```

Nginx менять не нужно — `/api/push-vapid-public-key` идёт через `location /api/` на `calc.loomixx.ru`.

## Поведение

- Профиль → «Уведомление» → текст + получатель из `users` (можно себе) → запись в `notifications`.
- Hook `onRecordAfterCreateSuccess` → `node /var/www/calc/scripts/send-web-push.mjs` → Web Push.
- SW (`public/push-handler.js`, `importScripts` в vite PWA) показывает баннер ОС.
- Подписка устройства пишется в `push_subscriptions` (при открытии sheet; без подписки «Отправить» disabled).

## Если запись в notifications есть, а баннера нет

1. **Админка PB → `push_subscriptions`**: есть ли запись с вашим `user`? Нет → клиент не подписался (смотрите красный текст в sheet: VAPID / разрешение / SW).
2. **Логи hook:**
   ```bash
   sudo journalctl -u pocketbase-calc -n 100 --no-pager | grep send-notification-push
   ```
   - нет строк вообще → hook не в `/opt/pocketbase-calc/pb_hooks/` или PB не перезапущен.
   - только `hook fired` без продолжения → старый hook падал на `collection().name` (обновлён).
   - `no subscriptions` → нет `push_subscriptions` для получателя.
   - `vapidPublic=NO` → нет `Environment=VAPID_*` в unit.
   - `EACCES` на `/tmp/calc-push-*.json` → писать payload в `/var/www/calc/.push-tmp` (исправлено в hook).
3. **Сборка фронта** должна содержать `VITE_VAPID_PUBLIC_KEY` (тот же public, что на сервере). После смены ключа — пересобрать + переустановить PWA / обновить SW.
4. **iPhone:** только установленный PWA, iOS 16.4+; в Safari-вкладке push не работает.
5. Закройте приложение полностью и подождите 2–3 с — баннер при закрытом PWA.

## Ограничения платформ

- **iPhone:** только после «На экран Домой», iOS 16.4+.
- **Android Chrome:** установленный PWA или вкладка; разрешение обязательно.
- Без подписки у получателя запись в PB создаётся, push не уйдёт (лог `no subscriptions`).

## Логи

```bash
sudo journalctl -u pocketbase-calc -f | grep send-notification-push
```

## Откат

Удалить кнопку/sheet в `ProfilePage`, `src/lib/pushNotifications.ts`, `importScripts`, hooks/script, коллекции в PB, env `VAPID_*`.
