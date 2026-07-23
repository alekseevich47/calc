import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DictItem {
  id: string;
  name: string;
}

export interface MarkingNumberItem {
  id: string;
  number: string;
  /** PB `marking_numbers.description` */
  description?: string;
  /** Имена файлов PB `marking_numbers.image` (до 10). URL — через `markingNumberImageUrl`. */
  images?: string[];
  /** Коэффициент для населённого пункта (qty × V → м²). */
  value_np?: number;
  /** Коэффициент для трассы. */
  value_road?: number;
}

export interface MarkingTypeItem {
  id: string;
  name: string;
  markingNumberId: string;
  /** Коэффициент для населённого пункта. */
  value_np?: number;
  /** Коэффициент для трассы. */
  value_road?: number;
}

export interface Dictionaries {
  locations: DictItem[];
  markingNumbers: MarkingNumberItem[];
  markingTypes: MarkingTypeItem[];
  materials: DictItem[];
  participants: DictItem[];
  updatedAt: number;
}

export interface ShiftRowData {
  location: string;
  markingNum: string;
  markingType: string;
  /** Ввод: метры или штуки (до умножения на V). */
  quantity?: number;
  /** Объём работы в м² = quantity × V. */
  volume: number;
  material: string;
  tariff: number;
  amount: number;
  locationId?: string;
  markingNumberId?: string;
  markingTypeId?: string;
  materialId?: string;
}

export interface CachedShift {
  id: string;
  pbId?: string;
  /** PB users.id автора смены — изоляция истории/ЗП по владельцу. */
  authorId?: string;
  date: string; // YYYY-MM-DD
  participants: string[];
  participantIds?: string[];
  status: "draft" | "confirmed";
  rows: ShiftRowData[];
  updatedAt: number;
  pendingSync: boolean;
}

export type SyncQueueOp = "create_shift" | "update_shift" | "delete_shift" | "create_teammate";

export interface SyncQueueItem {
  id: string;
  op: SyncQueueOp;
  /** Для shift-ops — id смены; для create_teammate — локальный id участника. */
  shiftId: string;
  /** Для delete_shift — PB id, т.к. запись уже удалена из кэша. */
  pbId?: string;
  /** Для create_teammate — «Фамилия Имя». */
  fullName?: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

interface CalcDB extends DBSchema {
  dictionaries_cache: {
    key: string;
    value: Dictionaries & { key: string };
  };
  shifts_cache: {
    key: string;
    value: CachedShift;
    indexes: { "by-date": string };
  };
  sync_queue: {
    key: string;
    value: SyncQueueItem;
  };
}

const DB_NAME = "calc-offline";
const DB_VERSION = 1;
const DICT_KEY = "main";

let dbPromise: Promise<IDBPDatabase<CalcDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<CalcDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("dictionaries_cache", { keyPath: "key" });
        const shifts = db.createObjectStore("shifts_cache", { keyPath: "id" });
        shifts.createIndex("by-date", "date");
        db.createObjectStore("sync_queue", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

/** Сиды справочников (пока нет данных из PocketBase). */
export const DEFAULT_DICTIONARIES: Dictionaries = {
  locations: [
    { id: "loc_np", name: "Населённый пункт" },
    { id: "loc_tr", name: "Трасса" },
  ],
  markingNumbers: [
    { id: "mn_1_1", number: "1.1", value_np: 1, value_road: 1 },
    { id: "mn_1_2", number: "1.2", value_np: 1, value_road: 1 },
    { id: "mn_1_5", number: "1.5", value_np: 1, value_road: 1 },
    { id: "mn_1_6", number: "1.6", value_np: 1, value_road: 1 },
    { id: "mn_stop", number: "Стоп-линия", value_np: 1, value_road: 1 },
  ],
  markingTypes: [
    { id: "mt_1_1_a", name: "Сплошная", markingNumberId: "mn_1_1", value_np: 1, value_road: 1 },
    { id: "mt_1_1_b", name: "Двойная сплошная", markingNumberId: "mn_1_1", value_np: 1, value_road: 1 },
    { id: "mt_1_2_a", name: "Краевая сплошная", markingNumberId: "mn_1_2", value_np: 1, value_road: 1 },
    { id: "mt_1_2_b", name: "Разделительная", markingNumberId: "mn_1_2", value_np: 1, value_road: 1 },
    { id: "mt_1_5_a", name: "Осевая прерывистая", markingNumberId: "mn_1_5", value_np: 1, value_road: 1 },
    { id: "mt_1_5_b", name: "Краевая", markingNumberId: "mn_1_5", value_np: 1, value_road: 1 },
    { id: "mt_1_6_a", name: "Предупреждающая", markingNumberId: "mn_1_6", value_np: 1, value_road: 1 },
    { id: "mt_stop_a", name: "Стандартная 40 см", markingNumberId: "mn_stop", value_np: 1, value_road: 1 },
    { id: "mt_stop_b", name: "Широкая 60 см", markingNumberId: "mn_stop", value_np: 1, value_road: 1 },
  ],
  materials: [
    { id: "mat_paint", name: "Краска" },
    { id: "mat_plastic", name: "Холодный пластик" },
  ],
  /** Свои добавленные участники (`teammates`), не список всех users. */
  participants: [],
  updatedAt: 0,
};

export function markingTypesMap(dicts: Dictionaries): Record<string, string[]> {
  const byNum = new Map(dicts.markingNumbers.map((n) => [n.id, n.number]));
  const map: Record<string, string[]> = {};
  for (const t of dicts.markingTypes) {
    const num = byNum.get(t.markingNumberId);
    if (!num) continue;
    const list = (map[num] ??= []);
    if (!list.includes(t.name)) list.push(t.name);
  }
  return map;
}

/** Типы по PB-id записи `marking_numbers` (не по строке number). */
export function markingTypesByNumberId(dicts: Dictionaries): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const t of dicts.markingTypes) {
    const id = t.markingNumberId;
    if (!id) continue;
    const list = (map[id] ??= []);
    if (!list.includes(t.name)) list.push(t.name);
  }
  return map;
}

/** Записи № разметки: одинаковые number рядом (number → description). */
export function sortedMarkingNumbers(dicts: Dictionaries): MarkingNumberItem[] {
  return [...dicts.markingNumbers].sort((a, b) => {
    const n = String(a.number).localeCompare(String(b.number), "ru", { numeric: true });
    if (n !== 0) return n;
    return String(a.description ?? "").localeCompare(String(b.description ?? ""), "ru");
  });
}

/** Первый PB-id для номера (fallback, если в строке смены нет markingNumberId). */
export function markingNumberIdByNumber(dicts: Dictionaries): Map<string, string> {
  const map = new Map<string, string>();
  for (const n of dicts.markingNumbers) {
    const num = String(n.number ?? "").trim();
    if (!num || map.has(num)) continue;
    map.set(num, n.id);
  }
  return map;
}

export async function getDictionaries(): Promise<Dictionaries> {
  const db = await getDb();
  const cached = await db.get("dictionaries_cache", DICT_KEY);
  if (cached) {
    const { key: _k, ...dicts } = cached;
    return dicts;
  }
  await putDictionaries(DEFAULT_DICTIONARIES);
  return DEFAULT_DICTIONARIES;
}

export async function putDictionaries(dicts: Dictionaries): Promise<void> {
  const db = await getDb();
  await db.put("dictionaries_cache", { ...dicts, key: DICT_KEY, updatedAt: Date.now() });
}

export async function listShifts(): Promise<CachedShift[]> {
  const db = await getDb();
  const all = await db.getAll("shifts_cache");
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
}

export async function getShift(id: string): Promise<CachedShift | undefined> {
  const db = await getDb();
  return db.get("shifts_cache", id);
}

export async function putShift(shift: CachedShift): Promise<void> {
  const db = await getDb();
  await db.put("shifts_cache", shift);
}

export async function deleteShift(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("shifts_cache", id);
}

const DATA_OWNER_KEY = "calc_data_owner";

/** Очистить пользовательские данные (смены, очередь, свои teammates в кэше). Справочники остаются. */
export async function clearUserScopedData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["shifts_cache", "sync_queue", "dictionaries_cache"], "readwrite");
  await tx.objectStore("shifts_cache").clear();
  await tx.objectStore("sync_queue").clear();
  const dictsStore = tx.objectStore("dictionaries_cache");
  const cached = await dictsStore.get(DICT_KEY);
  if (cached) {
    await dictsStore.put({ ...cached, participants: [], updatedAt: Date.now() });
  }
  await tx.done;
  try {
    localStorage.removeItem(DATA_OWNER_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * При смене пользователя — сбросить чужой кэш смен/очереди/teammates.
 * Один браузер / одно устройство не должно смешивать данные аккаунтов.
 */
export async function ensureUserDataScope(userId: string): Promise<void> {
  const id = userId.trim();
  if (!id) return;
  let prev = "";
  try {
    prev = localStorage.getItem(DATA_OWNER_KEY) ?? "";
  } catch {
    prev = "";
  }
  if (prev === id) return;
  await clearUserScopedData();
  try {
    localStorage.setItem(DATA_OWNER_KEY, id);
  } catch {
    /* ignore */
  }
}

export async function enqueue(item: Omit<SyncQueueItem, "attempts"> & { attempts?: number }): Promise<void> {
  const db = await getDb();
  await db.put("sync_queue", { attempts: 0, ...item });
}

export async function listQueue(): Promise<SyncQueueItem[]> {
  const db = await getDb();
  return db.getAll("sync_queue");
}

export async function dequeue(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("sync_queue", id);
}

export async function updateQueueItem(item: SyncQueueItem): Promise<void> {
  const db = await getDb();
  await db.put("sync_queue", item);
}

export async function queueLength(): Promise<number> {
  const db = await getDb();
  return db.count("sync_queue");
}

export function newId(): string {
  return crypto.randomUUID();
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatRuDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
