# PocketBase hook: ИИ-распознавание быстрого ввода

Файл `pb_hooks/parse_quick_input.pb.js` — прокси DeepSeek для свободного текста смены.

## Деплой на VPS

1. Скопировать `pb_hooks/parse_quick_input.pb.js` в каталог hooks PocketBase calc  
   (**`/opt/pocketbase-calc/pb_hooks/`** — рядом с бинарником / `WorkingDirectory` сервиса;  
   не путать с `/var/www/calc/pb_hooks/`).  
   Без этого шага будет **404** на `/api/parse-quick-input`.

   Маршрут в hook: `POST /api/parse-quick-input` (с префиксом `/api/` — иначе Nginx не проксирует).

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
curl -sS -X POST "https://calc.loomixx.ru/api/parse-quick-input" \
  -H "Authorization: Bearer YOUR_PB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"нп, 1.1, 10см, 50\nхп, 150", "dictionaries":{"locations":["Населённый пункт","Трасса"],"materials":["Краска","Пластик"],"marking_numbers":[],"participant_hints":[]}}'
```

Nginx менять **не нужно** — маршрут идёт через `location /api/` на `calc.loomixx.ru`.

## Поведение клиента

- Переключатель **AI** в шапке: вкл. → сразу ИИ; выкл. → парсер + «Распознать с помощью ИИ».
- Запрос: `POST /api/parse-quick-input`.
- Таймаут клиента: 90 с → «Превышено время ожидания».
- Во время ИИ: этапы «Отправляем текст…» → «Анализируем…» → «Проверяем по справочникам…».

## Логи на сервере

```bash
sudo journalctl -u pocketbase-calc -f | grep parse-quick-input
```

Строки: `start`, `ok` (ms, rows), `DeepSeek error`, `JSON parse failed`.

## Стоимость (ориентир)

~3.5–6.5k токенов на запрос (первый, со справочниками); ~0.001 USD с кэшем DeepSeek.
