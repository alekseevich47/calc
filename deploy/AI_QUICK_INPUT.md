# PocketBase hook: ИИ-распознавание быстрого ввода

Файл `pb_hooks/parse_quick_input.pb.js` — прокси DeepSeek для свободного текста смены.

## Деплой на VPS

1. Скопировать `pb_hooks/parse_quick_input.pb.js` в каталог hooks PocketBase calc  
   (рядом с бинарником, обычно `/var/www/calc/pb_hooks/`).

2. В `pocketbase-calc.service` добавить переменные окружения:

```ini
[Service]
Environment=DEEPSEEK_API_KEY=sk-...
Environment=DEEPSEEK_MODEL=deepseek-v4-flash
```

3. Перезапустить сервис:

```bash
sudo systemctl daemon-reload
sudo systemctl restart pocketbase-calc
```

4. Проверка (с JWT авторизованного пользователя):

```bash
curl -sS -X POST "https://urban42.online/calc/api/parse-quick-input" \
  -H "Authorization: Bearer YOUR_PB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"нп, 1.1, 10см, 50\nхп, 150", "dictionaries":{"locations":["Населённый пункт","Трасса"],"materials":["Краска","Пластик"],"marking_numbers":[],"participant_hints":[]}}'
```

Nginx менять **не нужно** — маршрут идёт через существующий `location /calc/api/`.

## Поведение клиента

- Сначала локальный `parseQuickInput` (офлайн).
- ИИ вызывается при свободном формате, ошибке парсера или нераспознанных полях — только онлайн.
- Ключ DeepSeek **не** попадает в фронтенд.

## Стоимость (ориентир)

~3.5–6.5k токенов на запрос (первый, со справочниками); ~0.001 USD с кэшем DeepSeek.
