/**
 * ИИ-распознавание свободного текста быстрого ввода (DeepSeek через PB hook).
 * Офлайн недоступно — вызывать только при navigator.onLine.
 */

import { markingTypesByNumberId, type Dictionaries } from "./db";
import { MATERIAL_KEYWORDS, isMarkingNumberVisibleInPicker } from "./quickInputKeywords";
import { isPocketBaseConfigured, pb } from "./pocketbase";
import {
  applyMaterialDefault,
  applyWorkRowDefaults,
  type ParsedField,
  type ParsedMaterialTariff,
  type ParsedQuickRow,
} from "./quickInputParser";

export type AiDictionaryPayload = {
  locations: string[];
  materials: string[];
  marking_numbers: Array<{
    id: string;
    number: string;
    description?: string;
    types: string[];
  }>;
  participant_hints: string[];
};

export type AiParseResult = {
  workRows: ParsedQuickRow[];
  materialTariff: ParsedMaterialTariff | null;
  participants: string[];
  warnings: string[];
};

type RawAiRow = {
  location?: string | null;
  markingNum?: string | null;
  markingNumberId?: string | null;
  markingType?: string | null;
  quantity?: number | null;
};

type RawAiResult = {
  participants?: string[];
  material?: string | null;
  tariff?: number | null;
  workRows?: RawAiRow[];
  warnings?: string[];
};

function fieldStr(value: string, recognized: boolean): ParsedField<string> {
  return { value, recognized };
}

function fieldNum(value: number, recognized: boolean): ParsedField<number> {
  return { value, recognized };
}

/** Компактный снимок справочников для промпта. */
export function buildAiDictionaryPayload(dicts: Dictionaries): AiDictionaryPayload {
  const typesById = markingTypesByNumberId(dicts);
  return {
    locations: dicts.locations.map((x) => x.name),
    materials: dicts.materials.map((x) => x.name),
    marking_numbers: dicts.markingNumbers
      .filter(isMarkingNumberVisibleInPicker)
      .map((n) => ({
      id: n.id,
      number: n.number,
      description: n.description || undefined,
      types: typesById[n.id] ?? [],
    })),
    participant_hints: dicts.participants.map((x) => x.name),
  };
}

function resolveLocationName(raw: string | null | undefined, dicts: Dictionaries): ParsedField<string> {
  const t = String(raw ?? "").trim();
  if (!t) return fieldStr("", false);
  const hit = dicts.locations.find((l) => l.name.toLowerCase() === t.toLowerCase());
  return fieldStr(hit?.name ?? t, Boolean(hit));
}

function resolveMaterialName(raw: string | null | undefined, dicts: Dictionaries): ParsedField<string> {
  const t = String(raw ?? "").replace(/[«»""]/g, "").trim();
  if (!t) return fieldStr("", false);

  const low = t.toLowerCase();
  const aliasKey = Object.keys(MATERIAL_KEYWORDS)
    .sort((a, b) => b.length - a.length || a.localeCompare(b, "ru"))
    .find((k) => low === k || low.includes(k));
  const canonical = aliasKey ? MATERIAL_KEYWORDS[aliasKey] : t;

  const hit = dicts.materials.find((m) => m.name.toLowerCase() === canonical.toLowerCase());
  return fieldStr(hit?.name ?? t, Boolean(hit));
}

function resolveMarkingRow(raw: RawAiRow, dicts: Dictionaries): ParsedQuickRow {
  const typesById = markingTypesByNumberId(dicts);
  const id = String(raw.markingNumberId ?? "").trim();
  const byId = id ? dicts.markingNumbers.find((n) => n.id === id) : undefined;

  let markingNum = String(raw.markingNum ?? "").trim();
  if (byId) markingNum = byId.number;
  else if (!markingNum && id) {
    markingNum = dicts.markingNumbers.find((n) => n.id === id)?.number ?? "";
  }

  if (!byId && markingNum) {
    const byNum = dicts.markingNumbers.filter(
      (n) => n.number.toLowerCase() === markingNum.toLowerCase(),
    );
    if (byNum.length === 1) {
      return buildRowFromNumber(byNum[0], raw, typesById, dicts);
    }
  }

  if (byId) {
    return buildRowFromNumber(byId, raw, typesById, dicts);
  }

  const typeName = String(raw.markingType ?? "").trim();
  const typeHit = typeName
    ? dicts.markingTypes.find((t) => t.name.toLowerCase() === typeName.toLowerCase())
    : undefined;

  const qty = Number(raw.quantity);
  const quantity = Number.isFinite(qty) && qty > 0 ? qty : 0;

  return applyWorkRowDefaults(
    {
      location: resolveLocationName(raw.location, dicts),
      markingNum: fieldStr(markingNum, false),
      markingNumberId: fieldStr(id, false),
      markingType: fieldStr(typeHit?.name ?? typeName, Boolean(typeHit)),
      volume: fieldNum(quantity, quantity > 0),
    },
    dicts,
  );
}

function buildRowFromNumber(
  num: { id: string; number: string },
  raw: RawAiRow,
  typesById: Record<string, string[]>,
  dicts: Dictionaries,
): ParsedQuickRow {
  const allowedTypes = typesById[num.id] ?? [];
  const typeName = String(raw.markingType ?? "").trim();
  let resolvedType = "";
  let typeRecognized = false;

  if (typeName) {
    const hit = dicts.markingTypes.find(
      (t) => t.markingNumberId === num.id && t.name.toLowerCase() === typeName.toLowerCase(),
    );
    if (hit) {
      resolvedType = hit.name;
      typeRecognized = true;
    } else {
      resolvedType = typeName;
    }
  } else if (allowedTypes.length === 0) {
    typeRecognized = true;
  }

  const qty = Number(raw.quantity);
  const quantity = Number.isFinite(qty) && qty > 0 ? qty : 0;
  const needsType = allowedTypes.length > 0;

  return applyWorkRowDefaults(
    {
      location: resolveLocationName(raw.location, dicts),
      markingNum: fieldStr(num.number, true),
      markingNumberId: fieldStr(num.id, true),
      markingType: fieldStr(resolvedType, !needsType || typeRecognized),
      volume: fieldNum(quantity, quantity > 0),
    },
    dicts,
  );
}

/** Сопоставить имена участников с известными опциями (точное + по слову). */
export function matchParticipantNames(names: string[], options: string[]): string[] {
  const out: string[] = [];
  const optsLower = options.map((o) => ({ orig: o, lower: o.toLowerCase() }));
  for (const raw of names) {
    const name = String(raw ?? "").trim();
    if (!name) continue;
    const low = name.toLowerCase();
    let hit = optsLower.find((o) => o.lower === low);
    if (!hit) {
      hit = optsLower.find(
        (o) => o.lower.includes(low) || low.includes(o.lower) || o.lower.split(/\s+/).includes(low),
      );
    }
    const resolved = hit?.orig ?? name;
    if (!out.includes(resolved)) out.push(resolved);
  }
  return out;
}

function validateAiResult(raw: RawAiResult, dicts: Dictionaries): AiParseResult {
  const workRows = (raw.workRows ?? []).map((row) => resolveMarkingRow(row, dicts));

  const material = applyMaterialDefault(resolveMaterialName(raw.material, dicts), dicts);
  const tariffNum = Number(raw.tariff);
  const tariff = fieldNum(
    Number.isFinite(tariffNum) && tariffNum > 0 ? tariffNum : 0,
    Number.isFinite(tariffNum) && tariffNum > 0,
  );

  const participantHints = [
    ...dicts.participants.map((p) => p.name),
  ];
  const participants = matchParticipantNames(raw.participants ?? [], participantHints);

  const warnings = [...(raw.warnings ?? []).map((w) => String(w))];
  if (tariff.value <= 0) warnings.push("Тариф не указан");
  for (let i = 0; i < workRows.length; i++) {
    const row = workRows[i];
    if (!row.location.value) warnings.push(`Строка ${i + 1}: место не указано`);
    if (!row.markingNumberId.recognized) warnings.push(`Строка ${i + 1}: № разметки не найден в справочнике`);
    if (row.volume.value <= 0) warnings.push(`Строка ${i + 1}: количество не распознано`);
  }

  return {
    workRows,
    materialTariff: { material, tariff },
    participants,
    warnings: [...new Set(warnings)],
  };
}

export function isAiParseAvailable(): boolean {
  return isPocketBaseConfigured() && typeof navigator !== "undefined" && navigator.onLine;
}

export const AI_PARSE_TIMEOUT_MS = 90_000;

export type AiParseStage = "sending" | "analyzing" | "validating";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Превышено время ожидания")),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Вызов DeepSeek через PocketBase hook. */
export async function parseQuickInputWithAi(
  text: string,
  dicts: Dictionaries,
  onStage?: (stage: AiParseStage) => void,
): Promise<AiParseResult> {
  if (!isPocketBaseConfigured()) {
    throw new Error("PocketBase не настроен");
  }
  if (!navigator.onLine) {
    throw new Error("Нет сети для ИИ-распознавания");
  }

  onStage?.("sending");
  await new Promise((r) => setTimeout(r, 0));
  onStage?.("analyzing");

  const res = await withTimeout(
    pb.send<{ ok?: boolean; result?: RawAiResult; message?: string }>(
      "/api/parse-quick-input",
      {
        method: "POST",
        body: {
          text,
          dictionaries: buildAiDictionaryPayload(dicts),
        },
      },
    ),
    AI_PARSE_TIMEOUT_MS,
  );

  onStage?.("validating");

  if (!res?.result) {
    throw new Error("Пустой ответ сервера ИИ");
  }

  return validateAiResult(res.result, dicts);
}
