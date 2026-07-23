/**
 * Парсер быстрого ввода по шаблону:
 * строки работы → место / № / тип / кол-во;
 * последняя строка → материал / тариф.
 *
 * Ключевые слова — только из `quickInputKeywords.ts`.
 */

import {
  markingTypesByNumberId,
  type Dictionaries,
  type MarkingNumberItem,
} from "./db";
import { locationZone } from "./markingValue";
import {
  LOCATION_KEYWORDS,
  MARKING_NUM_ALIASES,
  MARKING_NUMBER_VARIANT_ALIASES,
  MARKING_TYPE_SIZE_ALIASES,
  MATERIAL_KEYWORDS,
  QUANTITY_UNIT_WORDS,
  TARIFF_KEYWORD,
  TARIFF_UNIT_WORDS,
} from "./quickInputKeywords";

export type ParsedField<T> = { value: T; recognized: boolean };

export type ParsedQuickRow = {
  location: ParsedField<string>;
  markingNum: ParsedField<string>;
  markingNumberId: ParsedField<string>;
  markingType: ParsedField<string>;
  volume: ParsedField<number>;
};

export type ParsedMaterialTariff = {
  material: ParsedField<string>;
  tariff: ParsedField<number>;
};

export type ParseQuickInputResult = {
  workRows: ParsedQuickRow[];
  materialTariff: ParsedMaterialTariff | null;
  error?: string;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Границы «слова» с учётом кириллицы (JS `\b` кириллицу не считает словом). */
function keywordRegex(keyword: string): RegExp {
  const esc = escapeRegExp(keyword);
  return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "iu");
}

function sortLongestFirst(items: string[]): string[] {
  return [...items].sort((a, b) => b.length - a.length || a.localeCompare(b, "ru"));
}

function blankOut(s: string, start: number, end: number): string {
  return s.slice(0, start) + " ".repeat(Math.max(0, end - start)) + s.slice(end);
}

function findKeyword(haystack: string, keyword: string): { start: number; end: number } | null {
  const re = keywordRegex(keyword);
  const m = re.exec(haystack);
  if (!m || m.index == null) return null;
  return { start: m.index, end: m.index + m[0].length };
}

function findLongestKeyword(
  haystack: string,
  keywords: string[],
): { keyword: string; start: number; end: number } | null {
  let best: { keyword: string; start: number; end: number } | null = null;
  for (const kw of sortLongestFirst(keywords)) {
    const hit = findKeyword(haystack, kw);
    if (!hit) continue;
    if (
      !best ||
      kw.length > best.keyword.length ||
      (kw.length === best.keyword.length && hit.start < best.start)
    ) {
      best = { keyword: kw, ...hit };
    }
  }
  return best;
}

function field<T>(value: T, recognized: boolean): ParsedField<T> {
  return { value, recognized };
}

function emptyStr(): ParsedField<string> {
  return field("", false);
}

function emptyNum(): ParsedField<number> {
  return field(0, false);
}

function locationNameForZone(dicts: Dictionaries, zone: "np" | "road"): string {
  const hit = dicts.locations.find((l) => locationZone(l.name) === zone);
  if (hit) return hit.name;
  return zone === "road" ? "Трасса" : "Населённый пункт";
}

/** Нормализация типоразмера: «15 см» / «15см» / «15» → ключ для сравнения. */
function normalizeSizeToken(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

/**
 * Разбор алиаса размера в {num, unit?}.
 * «15см» → {15, см}; «4м» → {4, м}; «10» → {10, undefined}.
 */
function parseSizeAlias(alias: string): { num: string; unit?: string } | null {
  const t = normalizeSizeToken(alias);
  const m = t.match(/^(\d+)(см|м)?$/u);
  if (!m) return null;
  return { num: m[1], unit: m[2] };
}

function typeNameMatchesAlias(typeName: string, alias: string): boolean {
  const a = parseSizeAlias(alias);
  const t = parseSizeAlias(typeName);
  if (!a || !t) {
    return normalizeSizeToken(typeName) === normalizeSizeToken(alias);
  }
  if (a.num !== t.num) return false;
  // Алиас без единицы («10») матчит любой тип с тем же числом («10 см»).
  if (!a.unit) return true;
  return a.unit === (t.unit ?? "");
}

function parseNumberToken(raw: string): number {
  return parseFloat(raw.replace(",", "."));
}

// ─── 4.1 место ────────────────────────────────────────────────────────────────

function parseLocation(
  working: string,
  dicts: Dictionaries,
): { field: ParsedField<string>; working: string } {
  const npHit = findLongestKeyword(working, LOCATION_KEYWORDS.np);
  const roadHit = findLongestKeyword(working, LOCATION_KEYWORDS.road);

  let chosen: { zone: "np" | "road"; start: number; end: number; len: number } | null = null;
  if (npHit) {
    chosen = { zone: "np", start: npHit.start, end: npHit.end, len: npHit.keyword.length };
  }
  if (roadHit) {
    const better =
      !chosen ||
      roadHit.keyword.length > chosen.len ||
      (roadHit.keyword.length === chosen.len && roadHit.start < chosen.start);
    if (better) {
      chosen = {
        zone: "road",
        start: roadHit.start,
        end: roadHit.end,
        len: roadHit.keyword.length,
      };
    }
  }

  if (!chosen) return { field: emptyStr(), working };

  const name = locationNameForZone(dicts, chosen.zone);
  return {
    field: field(name, true),
    working: blankOut(working, chosen.start, chosen.end),
  };
}

// ─── 4.2 номер (+ вариант) ────────────────────────────────────────────────────

function itemsByNumber(dicts: Dictionaries): Map<string, MarkingNumberItem[]> {
  const map = new Map<string, MarkingNumberItem[]>();
  for (const n of dicts.markingNumbers) {
    const key = String(n.number ?? "").trim().toLowerCase();
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(n);
    map.set(key, list);
  }
  return map;
}

function parseMarkingNumber(
  working: string,
  dicts: Dictionaries,
): {
  markingNum: ParsedField<string>;
  markingNumberId: ParsedField<string>;
  working: string;
} {
  const byNum = itemsByNumber(dicts);

  // Кандидаты: точное совпадение number из справочника + алиасы без числа.
  type Cand = {
    kind: "number" | "alias";
    match: string;
    start: number;
    end: number;
    numberKey: string;
    aliasId?: string;
  };

  let best: Cand | null = null;

  for (const numberKey of sortLongestFirst([...byNum.keys()])) {
    const hit = findKeyword(working, numberKey);
    if (!hit) continue;
    if (
      !best ||
      numberKey.length > best.match.length ||
      (numberKey.length === best.match.length && hit.start < best.start)
    ) {
      best = {
        kind: "number",
        match: numberKey,
        start: hit.start,
        end: hit.end,
        numberKey,
      };
    }
  }

  for (const alias of sortLongestFirst(Object.keys(MARKING_NUM_ALIASES))) {
    const hit = findKeyword(working, alias);
    if (!hit) continue;
    if (
      !best ||
      alias.length > best.match.length ||
      (alias.length === best.match.length && hit.start < best.start)
    ) {
      const id = MARKING_NUM_ALIASES[alias];
      const item = dicts.markingNumbers.find((n) => n.id === id);
      best = {
        kind: "alias",
        match: alias,
        start: hit.start,
        end: hit.end,
        numberKey: String(item?.number ?? "").trim().toLowerCase(),
        aliasId: id,
      };
    }
  }

  if (!best) {
    return { markingNum: emptyStr(), markingNumberId: emptyStr(), working };
  }

  let next = blankOut(working, best.start, best.end);
  const candidates = best.numberKey ? byNum.get(best.numberKey) ?? [] : [];
  const displayNumber =
    candidates[0]?.number ??
    dicts.markingNumbers.find((n) => n.id === best!.aliasId)?.number ??
    best.match;

  // Алиас «шумка» и т.п. — сразу конкретный id.
  if (best.kind === "alias" && best.aliasId) {
    return {
      markingNum: field(displayNumber, true),
      markingNumberId: field(best.aliasId, true),
      working: next,
    };
  }

  const variants = MARKING_NUMBER_VARIANT_ALIASES[displayNumber]
    ?? MARKING_NUMBER_VARIANT_ALIASES[best.numberKey];

  if (variants?.length) {
    // Вариант ищем только в остатке после номера (не во всей исходной строке).
    const allKw = variants.flatMap((v) => v.keywords.map((kw) => ({ id: v.id, kw })));
    const sorted = [...allKw].sort(
      (a, b) => b.kw.length - a.kw.length || a.kw.localeCompare(b.kw, "ru"),
    );
    for (const { id, kw } of sorted) {
      const hit = findKeyword(next, kw);
      if (!hit) continue;
      const item = dicts.markingNumbers.find((n) => n.id === id);
      next = blankOut(next, hit.start, hit.end);
      return {
        markingNum: field(item?.number ?? displayNumber, true),
        markingNumberId: field(id, true),
        working: next,
      };
    }
    // Несколько записей с одним number, вариант не указан — id не ставим.
    return {
      markingNum: field(displayNumber, true),
      markingNumberId: emptyStr(),
      working: next,
    };
  }

  if (candidates.length === 1) {
    return {
      markingNum: field(candidates[0].number, true),
      markingNumberId: field(candidates[0].id, true),
      working: next,
    };
  }

  if (candidates.length > 1) {
    return {
      markingNum: field(displayNumber, true),
      markingNumberId: emptyStr(),
      working: next,
    };
  }

  return {
    markingNum: field(displayNumber, true),
    markingNumberId: emptyStr(),
    working: next,
  };
}

// ─── 4.3 тип (типоразмер) ─────────────────────────────────────────────────────

function parseMarkingType(
  working: string,
  markingNumberId: string,
  dicts: Dictionaries,
): { field: ParsedField<string>; working: string } {
  if (!markingNumberId) return { field: emptyStr(), working };

  const typeNames = markingTypesByNumberId(dicts)[markingNumberId] ?? [];
  if (typeNames.length === 0) return { field: emptyStr(), working };

  // Сначала точное имя типа из справочника, потом алиасы размеров.
  const nameHit = findLongestKeyword(working, typeNames.map((n) => n.toLowerCase()));
  if (nameHit) {
    const real = typeNames.find((n) => n.toLowerCase() === nameHit.keyword) ?? nameHit.keyword;
    return {
      field: field(real, true),
      working: blankOut(working, nameHit.start, nameHit.end),
    };
  }

  for (const alias of sortLongestFirst(MARKING_TYPE_SIZE_ALIASES)) {
    const hit = findKeyword(working, alias);
    if (!hit) continue;
    const matched = typeNames.find((name) => typeNameMatchesAlias(name, alias));
    if (!matched) continue;
    return {
      field: field(matched, true),
      working: blankOut(working, hit.start, hit.end),
    };
  }

  return { field: emptyStr(), working };
}

// ─── 4.4 количество ───────────────────────────────────────────────────────────

function parseQuantity(working: string): { field: ParsedField<number>; working: string } {
  const units = sortLongestFirst(QUANTITY_UNIT_WORDS);
  const unitAlt = units.map(escapeRegExp).join("|");
  // Число + опциональный суффикс единицы (слитно или через пробел).
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])(\\d+(?:[.,]\\d+)?)(?:\\s*(?:${unitAlt}))?(?![\\p{L}\\p{N}])`,
    "iu",
  );
  const m = re.exec(working);
  if (!m || m.index == null) return { field: emptyNum(), working };

  const n = parseNumberToken(m[1]);
  if (!Number.isFinite(n) || n <= 0) return { field: emptyNum(), working };

  return {
    field: field(n, true),
    working: blankOut(working, m.index, m.index + m[0].length),
  };
}

// ─── публичные функции ────────────────────────────────────────────────────────

/** 4.1–4.4: одна строка работы. */
export function parseWorkLine(line: string, dicts: Dictionaries): ParsedQuickRow {
  let working = String(line ?? "");

  const loc = parseLocation(working, dicts);
  working = loc.working;

  const num = parseMarkingNumber(working, dicts);
  working = num.working;

  const typ = parseMarkingType(working, num.markingNumberId.value, dicts);
  working = typ.working;

  const qty = parseQuantity(working);

  return {
    location: loc.field,
    markingNum: num.markingNum,
    markingNumberId: num.markingNumberId,
    markingType: typ.field,
    volume: qty.field,
  };
}

/** 4.5–4.6: строка «материал, тариф». */
export function parseMaterialTariffLine(
  line: string,
  dicts: Dictionaries,
): ParsedMaterialTariff {
  let working = String(line ?? "");

  // 4.5 материал
  let material = emptyStr();
  const matHit = findLongestKeyword(working, Object.keys(MATERIAL_KEYWORDS));
  if (matHit) {
    const canonical = MATERIAL_KEYWORDS[matHit.keyword];
    const fromDict = dicts.materials.find(
      (m) => m.name.toLowerCase() === canonical.toLowerCase(),
    );
    material = field(fromDict?.name ?? canonical, true);
    working = blankOut(working, matHit.start, matHit.end);
  } else {
    // Прямое совпадение с materials.name из PB
    const names = dicts.materials.map((m) => m.name);
    const direct = findLongestKeyword(
      working,
      names.map((n) => n.toLowerCase()),
    );
    if (direct) {
      const real = names.find((n) => n.toLowerCase() === direct.keyword) ?? direct.keyword;
      material = field(real, true);
      working = blankOut(working, direct.start, direct.end);
    }
  }

  // 4.6 тариф: «тариф» + число (+ ед.)
  let tariff = emptyNum();
  const units = sortLongestFirst(TARIFF_UNIT_WORDS);
  const unitAlt = units.map(escapeRegExp).join("|");
  const tariffRe = new RegExp(
    `${escapeRegExp(TARIFF_KEYWORD)}\\s*(\\d+(?:[.,]\\d+)?)(?:\\s*(?:${unitAlt}))?`,
    "iu",
  );
  const tMatch = tariffRe.exec(working);
  if (tMatch && tMatch.index != null) {
    const n = parseNumberToken(tMatch[1]);
    if (Number.isFinite(n) && n > 0) {
      tariff = field(n, true);
      working = blankOut(working, tMatch.index, tMatch.index + tMatch[0].length);
    }
  } else {
    // Резерв: последнее число в остатке строки.
    const numRe = /(?<![\p{L}\p{N}])(\d+(?:[.,]\d+)?)(?![\p{L}\p{N}])/gu;
    let last: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = numRe.exec(working)) !== null) last = m;
    if (last && last.index != null) {
      const n = parseNumberToken(last[1]);
      if (Number.isFinite(n) && n > 0) {
        tariff = field(n, true);
      }
    }
  }

  return { material, tariff };
}

/**
 * Верхний уровень: непустые строки; последняя — материал/тариф;
 * остальные — строки работы. Минимум 2 строки.
 */
export function parseQuickInput(
  text: string,
  dicts: Dictionaries,
): ParseQuickInputResult {
  const lines = String(text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      workRows: [],
      materialTariff: null,
      error: "Нужна ещё строка с материалом и тарифом",
    };
  }

  const materialTariff = parseMaterialTariffLine(lines[lines.length - 1], dicts);
  const workRows = lines.slice(0, -1).map((l) => parseWorkLine(l, dicts));
  return { workRows, materialTariff };
}
