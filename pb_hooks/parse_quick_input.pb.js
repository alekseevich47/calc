/// <reference path="../pb_data/types.d.ts" />

/**
 * POST /api/parse-quick-input
 * Прокси DeepSeek для свободного текста быстрого ввода смены.
 * Ключ: DEEPSEEK_API_KEY в окружении pocketbase-calc.service.
 */
routerAdd(
  "POST",
  "/api/parse-quick-input",
  (e) => {
    const started = Date.now();
    const body = e.requestInfo().body || {};
    const text = String(body.text || "").trim();
    if (!text) {
      console.error("parse-quick-input reject: empty text");
      throw new BadRequestError("Пустой текст");
    }

    const dictionaries = body.dictionaries || {};
    const dictNums = dictionaries.marking_numbers;
    const numCount = Array.isArray(dictNums) ? dictNums.length : 0;
    console.log(
      "parse-quick-input start",
      "chars=" + text.length,
      "marking_numbers=" + numCount,
    );

    const apiKey = $os.getenv("DEEPSEEK_API_KEY");
    if (!apiKey) {
      console.error("parse-quick-input reject: DEEPSEEK_API_KEY missing");
      throw new BadRequestError("ИИ не настроен на сервере (DEEPSEEK_API_KEY)");
    }

    const model = String($os.getenv("DEEPSEEK_MODEL") || "deepseek-v4-flash");

    const systemPrompt = [
      "Ты парсер смены дорожной разметки. Из свободного русского текста извлеки структуру смены.",
      "Порядок блоков в тексте может быть любым.",
      "Блок «Экипаж» / «Участники» / имена людей — participants (массив строк).",
      "Строки работ: место (НП/Трасса), номер разметки, тип (если есть у номера), количество.",
      "Материал и тариф смены — общие на всю смену; тариф — число ₽/м², null если не указан.",
      "Для markingNumberId используй ТОЛЬКО id из справочника marking_numbers.",
      "Для location, material, markingType — ТОЛЬКО точные name из справочников.",
      "Если место не указано — location: null. Не выдумывай значения.",
      "Ответ — только JSON без markdown:",
      '{"participants":[],"material":null,"tariff":null,"workRows":[{"location":null,"markingNum":"","markingNumberId":null,"markingType":null,"quantity":0}],"warnings":[]}',
    ].join(" ");

    const userPayload = JSON.stringify({
      text: text,
      dictionaries: dictionaries,
    });

    const res = $http.send({
      url: "https://api.deepseek.com/chat/completions",
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPayload },
        ],
      }),
      timeout: 90,
    });

    if (res.statusCode < 200 || res.statusCode >= 300) {
      console.error(
        "parse-quick-input DeepSeek error",
        "status=" + res.statusCode,
        "ms=" + (Date.now() - started),
        res.raw,
      );
      throw new BadRequestError("Ошибка ИИ-сервиса (" + res.statusCode + ")");
    }

    const parsed = res.json || {};
    const content = parsed.choices && parsed.choices[0] && parsed.choices[0].message
      ? String(parsed.choices[0].message.content || "")
      : "";

    if (!content) {
      console.error("parse-quick-input reject: empty AI content", "ms=" + (Date.now() - started));
      throw new BadRequestError("Пустой ответ ИИ");
    }

    let ai;
    try {
      ai = JSON.parse(content);
    } catch (err) {
      console.error(
        "parse-quick-input JSON parse failed",
        "ms=" + (Date.now() - started),
        content,
      );
      throw new BadRequestError("ИИ вернул невалидный JSON");
    }

    const rowCount = Array.isArray(ai.workRows) ? ai.workRows.length : 0;
    console.log(
      "parse-quick-input ok",
      "ms=" + (Date.now() - started),
      "rows=" + rowCount,
      "model=" + model,
    );

    return e.json(200, { ok: true, result: ai });
  },
  $apis.requireAuth(),
);
