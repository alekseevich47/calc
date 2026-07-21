import { useEffect, useState, useSyncExternalStore } from "react";
import type { SyncStatus } from "../components/shared";
import {
  dequeue,
  enqueue,
  fromIsoDate,
  getDictionaries,
  getShift,
  listQueue,
  listShifts,
  markingTypesMap,
  newId,
  putDictionaries,
  putShift,
  queueLength,
  toIsoDate,
  updateQueueItem,
  type CachedShift,
  type Dictionaries,
  type ShiftRowData,
} from "./db";
import { isPocketBaseConfigured, pb } from "./pocketbase";

export type { SyncStatus };

type SyncSnapshot = {
  status: SyncStatus;
  pendingCount: number;
  online: boolean;
  lastError: string | null;
};

let snapshot: SyncSnapshot = {
  status: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "synced",
  pendingCount: 0,
  online: typeof navigator === "undefined" || navigator.onLine,
  lastError: null,
};

let syncing = false;
let persistRequested = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setSnapshot(partial: Partial<SyncSnapshot>) {
  snapshot = { ...snapshot, ...partial };
  emit();
}

async function refreshStatus() {
  const pending = await queueLength();
  const online = navigator.onLine;
  let status: SyncStatus;
  if (!online) status = "offline";
  else if (syncing) status = "syncing";
  else if (pending > 0) status = "pending";
  else status = "synced";
  setSnapshot({
    status,
    pendingCount: pending,
    online,
    lastError: pending === 0 ? null : snapshot.lastError,
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return snapshot;
}

export function getSyncStatus(): SyncStatus {
  return snapshot.status;
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).status;
}

export function useSyncSnapshot(): SyncSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Актуальный снимок синка (для alert после syncNow). */
export function peekSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

/** Один раз при старте — не блокирует рендер. */
export function requestPersistentStorage(): void {
  if (persistRequested) return;
  persistRequested = true;
  void (async () => {
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
    } catch {
      /* ignore */
    }
  })();
}

// ─── Dictionaries / shifts hooks ──────────────────────────────────────────────

export function useDictionaries(): Dictionaries | null {
  const [dicts, setDicts] = useState<Dictionaries | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => { void getDictionaries().then((d) => { if (!cancelled) setDicts(d); }); };
    load();
    const unsub = subscribe(() => load());
    return () => { cancelled = true; unsub(); };
  }, []);
  return dicts;
}

export function useShifts(): CachedShift[] {
  const [shifts, setShifts] = useState<CachedShift[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = () => { void listShifts().then((s) => { if (!cancelled) setShifts(s); }); };
    load();
    const unsub = subscribe(() => load());
    return () => { cancelled = true; unsub(); };
  }, []);
  return shifts;
}

export function useMarkingTypesMap(): Record<string, string[]> {
  const dicts = useDictionaries();
  if (!dicts) return {};
  return markingTypesMap(dicts);
}

// ─── Confirm shift (Home → queue + cache) ─────────────────────────────────────

export async function confirmShift(input: {
  date: Date;
  participants: string[];
  rows: Array<{
    location: string;
    markingNum: string;
    markingType: string;
    volume: number;
    material: string;
    tariff: number;
  }>;
}): Promise<CachedShift> {
  const dicts = await getDictionaries();
  const locByName = new Map(dicts.locations.map((x) => [x.name, x.id]));
  const numByVal = new Map(dicts.markingNumbers.map((x) => [x.number, x.id]));
  const matByName = new Map(dicts.materials.map((x) => [x.name, x.id]));
  const partByName = new Map(dicts.participants.map((x) => [x.name, x.id]));

  const rows: ShiftRowData[] = input.rows.map((r) => {
    const markingNumberId = numByVal.get(r.markingNum);
    const markingTypeId = markingNumberId
      ? dicts.markingTypes.find((t) => t.markingNumberId === markingNumberId && t.name === r.markingType)?.id
      : undefined;
    return {
      location: r.location,
      markingNum: r.markingNum,
      markingType: r.markingType,
      volume: r.volume,
      material: r.material,
      tariff: r.tariff,
      amount: r.volume * r.tariff,
      locationId: locByName.get(r.location),
      markingNumberId,
      markingTypeId,
      materialId: matByName.get(r.material),
    };
  });

  const shift: CachedShift = {
    id: newId(),
    date: toIsoDate(input.date),
    participants: [...input.participants],
    participantIds: input.participants
      .map((n) => partByName.get(n))
      .filter((id): id is string => Boolean(id)),
    status: "confirmed",
    rows,
    updatedAt: Date.now(),
    pendingSync: true,
  };

  await putShift(shift);
  await enqueue({
    id: newId(),
    op: "create_shift",
    shiftId: shift.id,
    createdAt: Date.now(),
  });
  await refreshStatus();
  emit();
  void syncNow();
  return shift;
}

// ─── Pull dictionaries + shifts from PocketBase ───────────────────────────────

async function safeList(collection: string, opts?: { sort?: string; fields?: string }) {
  try {
    return await pb.collection(collection).getFullList(opts);
  } catch (err) {
    console.warn(`[sync] list ${collection} failed:`, err);
    return [];
  }
}

async function pullFromServer(): Promise<void> {
  if (!isPocketBaseConfigured()) {
    setSnapshot({ lastError: "PocketBase URL не задан" });
    return;
  }
  if (!pb.authStore.isValid) {
    setSnapshot({ lastError: "Нет сессии PocketBase — войдите снова" });
    return;
  }

  const [locations, markingNumbers, markingTypes, materials, users] = await Promise.all([
    safeList("locations", { sort: "name" }),
    safeList("marking_numbers", { sort: "number" }),
    safeList("marking_types", { sort: "name" }),
    safeList("materials", { sort: "name" }),
    safeList("users", { fields: "id,full_name" }),
  ]);

  const dicts: Dictionaries = {
    locations: locations.map((r) => ({ id: r.id, name: String(r.name) })),
    markingNumbers: markingNumbers.map((r) => ({
      id: r.id,
      number: String(r.number ?? ""),
    })),
    markingTypes: markingTypes.map((r) => ({
      id: r.id,
      name: String(r.name),
      markingNumberId: String(
        typeof r.marking_number === "object" && r.marking_number
          ? (r.marking_number as { id?: string }).id ?? r.marking_number
          : r.marking_number,
      ),
    })),
    materials: materials.map((r) => ({ id: r.id, name: String(r.name) })),
    participants: users.map((r) => ({
      id: r.id,
      name: String(r.full_name || r.id),
    })),
    updatedAt: Date.now(),
  };

  if (dicts.participants.length === 0) {
    const local = await getDictionaries();
    dicts.participants = local.participants;
  }

  const hasAny =
    dicts.locations.length > 0 ||
    dicts.markingNumbers.length > 0 ||
    dicts.materials.length > 0;

  if (hasAny) {
    await putDictionaries(dicts);
    setSnapshot({ lastError: null });
    console.info("[sync] dictionaries updated", {
      locations: dicts.locations.length,
      markingNumbers: dicts.markingNumbers.length,
      markingTypes: dicts.markingTypes.length,
      materials: dicts.materials.length,
      participants: dicts.participants.length,
    });
  } else {
    const msg = "Справочники в PB пусты или нет прав на чтение (listRule)";
    console.warn(`[sync] ${msg}`);
    setSnapshot({ lastError: msg });
  }

  try {
    const remote = await pb.collection("shifts").getFullList({
      sort: "-date",
      expand: "participants,shift_rows_via_shift",
    });

    for (const rec of remote) {
      let rows: ShiftRowData[] = [];
      try {
        const rowRecs = await pb.collection("shift_rows").getFullList({
          filter: `shift="${rec.id}"`,
          sort: "sort_order",
          expand: "location,marking_number,marking_type,material",
        });
        rows = rowRecs.map((rr) => {
          const loc = rr.expand?.location as { name?: string } | undefined;
          const mn = rr.expand?.marking_number as { number?: string; name?: string } | undefined;
          const mt = rr.expand?.marking_type as { name?: string } | undefined;
          const mat = rr.expand?.material as { name?: string } | undefined;
          const volume = Number(rr.volume) || 0;
          const tariff = Number(rr.rate) || 0;
          return {
            location: loc?.name ?? "",
            markingNum: String(mn?.number ?? mn?.name ?? ""),
            markingType: mt?.name ?? "",
            volume,
            material: mat?.name ?? "",
            tariff,
            amount: Number(rr.amount) || volume * tariff,
            locationId: String(rr.location || ""),
            markingNumberId: String(rr.marking_number || ""),
            markingTypeId: rr.marking_type ? String(rr.marking_type) : undefined,
            materialId: String(rr.material || ""),
          };
        });
      } catch {
        continue;
      }

      const parts = (rec.expand?.participants as Array<{ full_name?: string; name?: string; id: string }> | undefined) ?? [];
      const participantNames = parts.map((p) => p.full_name || p.name || p.id);
      const participantIds = Array.isArray(rec.participants) ? rec.participants.map(String) : parts.map((p) => p.id);

      const dateRaw = String(rec.date).slice(0, 10);
      const existing = (await listShifts()).find((s) => s.pbId === rec.id);
      if (existing?.pendingSync) continue;

      await putShift({
        id: existing?.id ?? rec.id,
        pbId: rec.id,
        date: dateRaw,
        participants: participantNames.length ? participantNames : (existing?.participants ?? []),
        participantIds,
        status: (rec.status as "draft" | "confirmed") || "confirmed",
        rows,
        updatedAt: Date.now(),
        pendingSync: false,
      });
    }
  } catch (err) {
    console.warn("[sync] pull shifts failed:", err);
  }
}

async function pushQueueItem(item: Awaited<ReturnType<typeof listQueue>>[number]): Promise<void> {
  const shift = await getShift(item.shiftId);
  if (!shift) {
    await dequeue(item.id);
    return;
  }

  if (!isPocketBaseConfigured() || !pb.authStore.isValid) {
    throw new Error("Нет сессии PocketBase — войдите через email/пароль");
  }

  // Перепривязка имён → актуальные PB id (на случай, если смена создана на мок-справочниках)
  const dicts = await getDictionaries();
  const locByName = new Map(dicts.locations.map((x) => [x.name, x.id]));
  const numByVal = new Map(dicts.markingNumbers.map((x) => [x.number, x.id]));
  const matByName = new Map(dicts.materials.map((x) => [x.name, x.id]));
  const partByName = new Map(dicts.participants.map((x) => [x.name, x.id]));
  const isPbId = (id?: string) => !!id && /^[a-z0-9]{15}$/i.test(id);

  const rows = shift.rows.map((r) => {
    const markingNumberId = isPbId(r.markingNumberId) ? r.markingNumberId : numByVal.get(r.markingNum);
    const markingTypeId = isPbId(r.markingTypeId)
      ? r.markingTypeId
      : markingNumberId
        ? dicts.markingTypes.find((t) => t.markingNumberId === markingNumberId && t.name === r.markingType)?.id
        : undefined;
    return {
      ...r,
      locationId: isPbId(r.locationId) ? r.locationId : locByName.get(r.location),
      markingNumberId,
      markingTypeId,
      materialId: isPbId(r.materialId) ? r.materialId : matByName.get(r.material),
    };
  });

  const participantIds = (shift.participantIds?.length
    ? shift.participantIds
    : shift.participants.map((n) => partByName.get(n)).filter((id): id is string => Boolean(id))
  ).filter(isPbId);

  for (const r of rows) {
    if (!r.locationId || !r.markingNumberId || !r.materialId) {
      throw new Error(`Нет PB-id для строки «${r.location} / ${r.markingNum}» — обновите справочники (синк)`);
    }
  }

  if (item.op === "create_shift" || item.op === "update_shift") {
    let pbId = shift.pbId;
    if (!pbId) {
      const created = await pb.collection("shifts").create({
        date: shift.date,
        author: pb.authStore.record?.id,
        participants: participantIds.length ? participantIds : undefined,
        status: shift.status,
      });
      pbId = created.id;
    } else {
      await pb.collection("shifts").update(pbId, {
        date: shift.date,
        participants: participantIds,
        status: shift.status,
      });
    }

    if (shift.pbId) {
      try {
        const old = await pb.collection("shift_rows").getFullList({ filter: `shift="${pbId}"` });
        await Promise.all(old.map((r) => pb.collection("shift_rows").delete(r.id)));
      } catch {
        /* ignore */
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      await pb.collection("shift_rows").create({
        shift: pbId,
        location: r.locationId,
        marking_number: r.markingNumberId,
        marking_type: r.markingTypeId || null,
        volume: r.volume,
        material: r.materialId,
        rate: r.tariff,
        amount: r.amount,
        sort_order: i,
      });
    }

    await putShift({
      ...shift,
      rows,
      participantIds,
      pbId,
      pendingSync: false,
      updatedAt: Date.now(),
    });
  }

  await dequeue(item.id);
}

export async function syncNow(): Promise<void> {
  if (syncing) return;
  if (!navigator.onLine) {
    await refreshStatus();
    return;
  }

  syncing = true;
  await refreshStatus();

  try {
    await pullFromServer();

    const queue = await listQueue();
    let lastErr: string | null = null;
    for (const item of queue) {
      try {
        await pushQueueItem(item);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastErr = msg;
        console.warn("[sync] push failed:", msg, item);
        await updateQueueItem({
          ...item,
          attempts: item.attempts + 1,
          lastError: msg,
        });
      }
    }
    if (lastErr) setSnapshot({ lastError: lastErr });
  } finally {
    syncing = false;
    await refreshStatus();
    emit();
  }
}

/** Инициализация при старте приложения. */
export function initSync(): void {
  requestPersistentStorage();
  void (async () => {
    await getDictionaries();
    await refreshStatus();
    if (navigator.onLine) await syncNow();
  })();

  window.addEventListener("online", () => {
    setSnapshot({ online: true });
    void syncNow();
  });
  window.addEventListener("offline", () => {
    setSnapshot({ online: false, status: "offline" });
  });
}

// ─── Profile stats helpers ────────────────────────────────────────────────────

export type StatsPeriod = "week" | "month" | "alltime";

export function computeUserStats(
  shifts: CachedShift[],
  userName: string,
  period: StatsPeriod,
): { earned: number; volume: number; shifts: number } {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const filtered = shifts.filter((s) => {
    if (!s.participants.includes(userName)) return false;
    if (period === "alltime") return true;
    const d = fromIsoDate(s.date);
    if (period === "week") return d >= startOfWeek;
    if (period === "month") return d >= startOfMonth;
    return true;
  });

  let earned = 0;
  let volume = 0;
  for (const s of filtered) {
    const total = s.rows.reduce((a, r) => a + r.amount, 0);
    const n = s.participants.length || 1;
    earned += Math.round(total / n);
    volume += s.rows.reduce((a, r) => a + r.volume, 0);
  }

  return { earned, volume, shifts: filtered.length };
}

export { fromIsoDate, formatRuDate, toIsoDate } from "./db";
