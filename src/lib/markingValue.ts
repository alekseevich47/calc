import {
  markingNumberIdByNumber,
  type Dictionaries,
  type MarkingNumberItem,
  type MarkingTypeItem,
} from "./db";

export type LocationZone = "np" | "road";

export type MarkingCoeffInput = {
  location: string;
  markingNum: string;
  markingNumberId?: string;
  markingType?: string;
};

function finitePositive(n: unknown): number | undefined {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return undefined;
  return v;
}

/** Место «Н.п. / трасса» → зона коэффициента. */
export function locationZone(locationName: string): LocationZone {
  const t = String(locationName ?? "").trim().toLowerCase();
  if (t.includes("трасс")) return "road";
  return "np";
}

/** Пара value_np / value_road → V для зоны (при отсутствии одного — fallback на другой; иначе 1). */
export function pickZoneValue(
  valueNp: unknown,
  valueRoad: unknown,
  zone: LocationZone,
): number {
  const np = finitePositive(valueNp);
  const road = finitePositive(valueRoad);
  const primary = zone === "road" ? road : np;
  if (primary != null) return primary;
  const fallback = zone === "road" ? np : road;
  if (fallback != null) return fallback;
  return 1;
}

function resolveNumberItem(
  dicts: Dictionaries,
  markingNum: string,
  markingNumberId?: string,
): MarkingNumberItem | undefined {
  if (markingNumberId) {
    const byId = dicts.markingNumbers.find((n) => n.id === markingNumberId);
    if (byId) return byId;
  }
  const num = String(markingNum ?? "").trim();
  if (!num) return undefined;
  return dicts.markingNumbers.find((n) => n.number === num);
}

function resolveTypeItem(
  dicts: Dictionaries,
  numberId: string | undefined,
  markingType: string,
): MarkingTypeItem | undefined {
  if (!numberId || !markingType.trim()) return undefined;
  return dicts.markingTypes.find(
    (t) => t.markingNumberId === numberId && t.name === markingType,
  );
}

/**
 * V из справочника:
 * - если у № есть типы → value_np/value_road выбранного типа;
 * - иначе → value_np/value_road номера;
 * - зона по месту (НП / трасса).
 */
export function resolveMarkingCoeff(
  dicts: Dictionaries,
  input: MarkingCoeffInput,
): number {
  const zone = locationZone(input.location);
  const numberId =
    input.markingNumberId ||
    markingNumberIdByNumber(dicts).get(String(input.markingNum ?? "").trim());
  const typesForNum = numberId
    ? dicts.markingTypes.filter((t) => t.markingNumberId === numberId)
    : [];

  if (typesForNum.length > 0) {
    const typ = resolveTypeItem(dicts, numberId, String(input.markingType ?? ""));
    if (typ) return pickZoneValue(typ.value_np, typ.value_road, zone);
    return 1;
  }

  const num = resolveNumberItem(dicts, input.markingNum, numberId);
  if (num) return pickZoneValue(num.value_np, num.value_road, zone);
  return 1;
}

/** Округление объёма м² до тысячных (0.001). */
export function roundVolumeM2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

/** объём м² = количество × V (до тысячных) */
export function workVolumeM2(quantity: number, coeff: number): number {
  return roundVolumeM2(quantity * coeff);
}

/** оплата = объём(тыс.) × тариф */
export function rowAmount(quantity: number, coeff: number, tariff: number): number {
  return workVolumeM2(quantity, coeff) * tariff;
}

export function draftRowMetrics(
  dicts: Dictionaries,
  input: MarkingCoeffInput & { quantity: number; tariff: number },
): { coeff: number; volumeM2: number; amount: number } {
  const coeff = resolveMarkingCoeff(dicts, input);
  const volumeM2 = workVolumeM2(input.quantity, coeff);
  return { coeff, volumeM2, amount: volumeM2 * input.tariff };
}

/** Для редактирования сохранённой строки: qty, иначе объём/V. */
export function quantityForEdit(
  dicts: Dictionaries,
  row: MarkingCoeffInput & { volume: number; quantity?: number },
): number {
  if (typeof row.quantity === "number" && Number.isFinite(row.quantity)) {
    return row.quantity;
  }
  const coeff = resolveMarkingCoeff(dicts, row);
  if (coeff > 0) return row.volume / coeff;
  return row.volume;
}
