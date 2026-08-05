# Web Push (пробный)

Пробные системные уведомления PWA при закрытом приложении. Можно откатить.

## Что нужно на VPS

1. Импортировать коллекции из `schema.json` (или создать вручную в админке):
   - `notifications` — `from`, `to`, `text`
   - `push_subscriptions` — `user`, `endpoint`, `p256dh`, `auth`

2. Скопировать hooks и скрипт (CI заливает только `dist/`):

```bash
# на сервере, из репо /var/www/calc
cp pb_hooks/send_notification_push.pb.js /var/www/calc/pb_hooks/
# scripts/send-web-push.mjs уже в репо; нужен node_modules/web-push
cd /var/www/calc && pnpm install --prod=false
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
VITE_POCKETBASE_URL=https://urban42.online/calc \
pnpm build
```

5. Перезапуск PB:

```bash
sudo systemctl daemon-reload
sudo systemctl restart pocketbase-calc
```

Nginx менять не нужно — `/calc/api/push-vapid-public-key` идёт через существующий `location /calc/api/`.

## Поведение

- Профиль → «Уведомление» → текст + один получатель из `users` → запись в `notifications`.
- Hook `onRecordAfterCreateSuccess` → `node scripts/send-web-push.mjs` → Web Push.
- SW (`public/push-handler.js`, `importScripts` в vite PWA) показывает баннер ОС.
- Подписка устройства пишется в `push_subscriptions` (при открытии sheet и при входе в AppShell, если permission уже granted).

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
