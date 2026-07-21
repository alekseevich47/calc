import { useEffect, useState, useSyncExternalStore } from "react";
import type { SyncStatus } from "../components/shared";
import {
  dequeue,
  deleteShift as deleteShiftFromDb,
  enqueue,
  ensureUserDataScope,
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
import { formatUserName, getCurrentUserFullName, looksLikePbId } from "./session";

function currentAuthorId(): string {
  return String(pb.authStore.record?.id ?? "").trim();
}

function isPbId(id?: string): boolean {
  return !!id && looksLikePbId(id);
}

/** Строка готова к подтверждению/пушу (есть место, №, материал). */
export function isShiftRowComplete(r: {
  location?: string;
  markingNum?: string;
  material?: string;
}): boolean {
  return Boolean(
    String(r.location ?? "").trim() &&
    String(r.markingNum ?? "").trim() &&
    String(r.material ?? "").trim(),
  );
}

/** Опции выбора: текущий пользователь + свои teammates (без других users). */
export function buildParticipantOptions(teammateNames: string[], me = getCurrentUserFullName()): string[] {
  const rest = teammateNames.filter((n) => n && n !== me);
  return me ? [me, ...rest] : rest;
}

/** Разбор shifts.participants: JSON-имена или legacy relation→users. */
function parseShiftParticipantNames(rec: {
  participants?: unknown;
  expand?: { participants?: Array<{ surname?: string; name?: string; id: string }> };
}): string[] {
  const expanded = rec.expand?.participants;
  if (expanded?.length) {
    return expanded.map((p) => formatUserName(p)).filter(Boolean);
  }
  const raw = rec.participants;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
}

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
    const load = () => {
      void listShifts().then((s) => {
        if (cancelled) return;
        const me = currentAuthorId();
        setShifts(me ? s.filter((x) => !x.authorId || x.authorId === me) : s);
      });
    };
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
  const completeRows = input.rows.filter(isShiftRowComplete);
  if (completeRows.length === 0) {
    throw new Error("Заполните место, № разметки и материал хотя бы в одной строке");
  }

  const dicts = await getDictionaries();
  const locByName = new Map(dicts.locations.map((x) => [x.name, x.id]));
  const numByVal = new Map(dicts.markingNumbers.map((x) => [x.number, x.id]));
  const matByName = new Map(dicts.materials.map((x) => [x.name, x.id]));
  const partByName = new Map(dicts.participants.map((x) => [x.name, x.id]));

  const rows: ShiftRowData[] = completeRows.map((r) => {
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

  // teammate PB-ids (для себя id нет — имена уходят в shifts.participants как JSON)
  let participants = input.participants
    .map((n) => n.trim())
    .filter((n) => n && !looksLikePbId(n));
  if (participants.length === 0) {
    const me = getCurrentUserFullName();
    if (me && !looksLikePbId(me)) participants = [me];
  }
  if (participants.length === 0) {
    throw new Error("Выберите участников смены");
  }
  const participantIds = participants
    .map((n) => partByName.get(n))
    .filter((id): id is string => Boolean(id));

  const shift: CachedShift = {
    id: newId(),
    authorId: currentAuthorId() || undefined,
    date: toIsoDate(input.date),
    participants,
    participantIds,
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

type ShiftWriteInput = {
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
};

async function resolveShiftWrite(input: ShiftWriteInput): Promise<{
  rows: ShiftRowData[];
  participantIds: string[];
  participants: string[];
}> {
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

  let participantIds = input.participants
    .map((n) => partByName.get(n))
    .filter((id): id is string => Boolean(id));

  return { rows, participantIds, participants: [...input.participants] };
}

async function dequeueShiftOps(shiftId: string): Promise<void> {
  const queue = await listQueue();
  await Promise.all(queue.filter((q) => q.shiftId === shiftId).map((q) => dequeue(q.id)));
}

/** Создать своего участника («Фамилия Имя») — локально + очередь create_teammate. */
export async function createTeammate(fullNameRaw: string): Promise<{ id: string; name: string }> {
  const fullName = fullNameRaw.trim().replace(/\s+/g, " ");
  if (!fullName) throw new Error("Введите фамилию и имя");

  const me = getCurrentUserFullName();
  if (me && fullName === me) {
    return { id: "self", name: me };
  }

  const dicts = await getDictionaries();
  const existing = dicts.participants.find((p) => p.name === fullName);
  if (existing) return existing;

  const localId = newId();
  const item = { id: localId, name: fullName };
  await putDictionaries({
    ...dicts,
    participants: [...dicts.participants, item],
  });

  await enqueue({
    id: newId(),
    op: "create_teammate",
    shiftId: localId,
    fullName,
    createdAt: Date.now(),
  });
  await refreshStatus();
  emit();
  void syncNow();
  return item;
}

/** Обновить смену в кэше + очередь update/create. */
export async function updateShift(id: string, input: ShiftWriteInput): Promise<CachedShift | null> {
  const existing = await getShift(id);
  if (!existing) return null;

  const resolved = await resolveShiftWrite(input);
  const shift: CachedShift = {
    ...existing,
    authorId: existing.authorId || currentAuthorId() || undefined,
    date: toIsoDate(input.date),
    participants: resolved.participants,
    participantIds: resolved.participantIds,
    rows: resolved.rows,
    updatedAt: Date.now(),
    pendingSync: true,
  };

  await putShift(shift);
  await dequeueShiftOps(id);
  await enqueue({
    id: newId(),
    op: existing.pbId ? "update_shift" : "create_shift",
    shiftId: id,
    createdAt: Date.now(),
  });
  await refreshStatus();
  emit();
  void syncNow();
  return shift;
}

/** Удалить смену локально; если есть pbId — в очередь delete_shift. */
export async function removeShift(id: string): Promise<void> {
  const existing = await getShift(id);
  if (!existing) return;

  await dequeueShiftOps(id);
  if (existing.pbId) {
    await enqueue({
      id: newId(),
      op: "delete_shift",
      shiftId: id,
      pbId: existing.pbId,
      createdAt: Date.now(),
    });
  }
  await deleteShiftFromDb(id);
  await refreshStatus();
  emit();
  void syncNow();
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

  const authorId = currentAuthorId();
  if (!authorId) {
    setSnapshot({ lastError: "Нет id пользователя — войдите снова" });
    return;
  }
  await ensureUserDataScope(authorId);

  const [locations, markingNumbers, markingTypes, materials, teammates] = await Promise.all([
    safeList("locations", { sort: "name" }),
    safeList("marking_numbers", { sort: "number" }),
    safeList("marking_types", { sort: "name" }),
    safeList("materials", { sort: "name" }),
    safeList("teammates", { sort: "full_name", fields: "id,full_name,owner" }),
  ]);

  const local = await getDictionaries();
  const pendingLocal = local.participants.filter((p) => !isPbId(p.id));
  const fromServer = teammates
    .map((r) => ({
      id: r.id,
      name: String(r.full_name ?? "").trim(),
    }))
    .filter((p) => p.name);

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
    participants: [
      ...fromServer,
      ...pendingLocal.filter((p) => !fromServer.some((s) => s.name === p.name)),
    ],
    updatedAt: Date.now(),
  };

  const hasAny =
    dicts.locations.length > 0 ||
    dicts.markingNumbers.length > 0 ||
    dicts.materials.length > 0 ||
    dicts.participants.length > 0;

  if (hasAny) {
    await putDictionaries(dicts);
    setSnapshot({ lastError: null });
    console.info("[sync] dictionaries updated", {
      locations: dicts.locations.length,
      markingNumbers: dicts.markingNumbers.length,
      markingTypes: dicts.markingTypes.length,
      materials: dicts.materials.length,
      teammates: dicts.participants.length,
    });
  } else {
    const msg = "Справочники в PB пусты или нет прав на чтение (listRule)";
    console.warn(`[sync] ${msg}`);
    setSnapshot({ lastError: msg });
  }

  try {
    // Только свои смены (listRule тоже фильтрует по author)
    const remote = await pb.collection("shifts").getFullList({
      filter: `author="${authorId}"`,
      sort: "-date",
      expand: "shift_rows_via_shift",
    });

    const remoteIds = new Set(remote.map((r) => r.id));

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

      const participantNames = parseShiftParticipantNames(rec);
      const dateRaw = String(rec.date).slice(0, 10);
      const existing = (await listShifts()).find((s) => s.pbId === rec.id);
      if (existing?.pendingSync) continue;

      await putShift({
        id: existing?.id ?? rec.id,
        pbId: rec.id,
        authorId,
        date: dateRaw,
        participants: participantNames.length ? participantNames : (existing?.participants ?? []),
        participantIds: existing?.participantIds,
        status: (rec.status as "draft" | "confirmed") || "confirmed",
        rows,
        updatedAt: Date.now(),
        pendingSync: false,
      });
    }

    // Убрать чужие / удалённые на сервере (не трогать pending)
    for (const localShift of await listShifts()) {
      if (localShift.pendingSync) continue;
      if (localShift.authorId && localShift.authorId !== authorId) {
        await deleteShiftFromDb(localShift.id);
        continue;
      }
      if (localShift.pbId && !remoteIds.has(localShift.pbId)) {
        await deleteShiftFromDb(localShift.id);
      }
    }
  } catch (err) {
    console.warn("[sync] pull shifts failed:", err);
  }
}

async function pushQueueItem(item: Awaited<ReturnType<typeof listQueue>>[number]): Promise<void> {
  if (item.op === "delete_shift") {
    if (!isPocketBaseConfigured() || !pb.authStore.isValid) {
      throw new Error("Нет сессии PocketBase — войдите через email/пароль");
    }
    const pbId = item.pbId;
    if (pbId) {
      try {
        const old = await pb.collection("shift_rows").getFullList({ filter: `shift="${pbId}"` });
        await Promise.all(old.map((r) => pb.collection("shift_rows").delete(r.id)));
      } catch {
        /* ignore */
      }
      try {
        await pb.collection("shifts").delete(pbId);
      } catch (err) {
        // уже удалено на сервере — ок
        const status = (err as { status?: number })?.status;
        if (status !== 404) throw err;
      }
    }
    await dequeue(item.id);
    return;
  }

  if (item.op === "create_teammate") {
    if (!isPocketBaseConfigured() || !pb.authStore.isValid) {
      throw new Error("Нет сессии PocketBase — войдите через email/пароль");
    }
    const fullName = String(item.fullName ?? "").trim().replace(/\s+/g, " ");
    const localId = item.shiftId;
    if (!fullName) {
      await dequeue(item.id);
      return;
    }
    const ownerId = String(pb.authStore.record?.id ?? "").trim();
    if (!ownerId) throw new Error("Нет id пользователя — войдите снова");

    const created = await pb.collection("teammates").create({
      owner: ownerId,
      full_name: fullName,
    });

    const dicts = await getDictionaries();
    await putDictionaries({
      ...dicts,
      participants: dicts.participants.map((p) =>
        p.id === localId || p.name === fullName ? { id: created.id, name: fullName } : p,
      ),
    });
    await dequeue(item.id);
    emit();
    return;
  }

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

  const resolvedRows = shift.rows.map((r) => {
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

  // PB shifts.participants = JSON array of full names (не relation→users)
  let participantsPayload = shift.participants
    .map((n) => n.trim())
    .filter((n) => n && !looksLikePbId(n));
  if (participantsPayload.length === 0) {
    const me = getCurrentUserFullName();
    if (me) participantsPayload = [me];
  }
  if (participantsPayload.length === 0) {
    throw new Error("Нет участников смены");
  }
  const teammateIds = participantsPayload
    .map((n) => partByName.get(n))
    .filter((id): id is string => Boolean(id) && isPbId(id));

  const authorId = currentAuthorId();
  if (!authorId) throw new Error("Нет id пользователя — войдите снова");
  const statusPayload = shift.status === "draft" ? "draft" : "confirmed";

  // Пустые/битые строки (часто iOS: dropdown не записался) — не валим весь синк
  const rows = resolvedRows.filter((r) => r.locationId && r.markingNumberId && r.materialId);
  const skipped = resolvedRows.length - rows.length;
  if (rows.length === 0) {
    const sample = resolvedRows[0];
    const label = `${sample?.location ?? ""} / ${sample?.markingNum ?? ""}`.trim();
    if (!label || label === "/") {
      // Нерепарируемый мусор в очереди — снимаем, чтобы статус не висел «Не синхр.»
      await dequeue(item.id);
      await putShift({ ...shift, pendingSync: false, updatedAt: Date.now() });
      emit();
      throw new Error("В очереди смена с пустыми строками — откройте История и заполните поля, затем сохраните");
    }
    throw new Error(`Нет PB-id для строки «${label}» — обновите справочники (синк)`);
  }
  if (skipped > 0) {
    console.warn(`[sync] skip ${skipped} incomplete row(s) in shift ${shift.id}`);
  }

  if (item.op === "create_shift" || item.op === "update_shift") {
    let pbId = shift.pbId;
    if (!pbId) {
      const created = await pb.collection("shifts").create({
        date: shift.date,
        author: authorId,
        participants: participantsPayload,
        status: statusPayload,
      });
      pbId = created.id;
      await putShift({
        ...shift,
        rows,
        authorId,
        participants: participantsPayload,
        participantIds: teammateIds,
        pbId,
        pendingSync: true,
        updatedAt: Date.now(),
      });
    } else {
      await pb.collection("shifts").update(pbId, {
        date: shift.date,
        author: authorId,
        participants: participantsPayload,
        status: statusPayload,
      });
    }

    try {
      const old = await pb.collection("shift_rows").getFullList({ filter: `shift="${pbId}"` });
      await Promise.all(old.map((r) => pb.collection("shift_rows").delete(r.id)));
    } catch {
      /* ignore */
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      // PB required number: 0 считается blank → нумерация с 1
      await pb.collection("shift_rows").create({
        shift: pbId,
        location: r.locationId,
        marking_number: r.markingNumberId,
        marking_type: r.markingTypeId || null,
        volume: r.volume,
        material: r.materialId,
        rate: r.tariff,
        amount: r.amount,
        sort_order: i + 1,
      });
    }

    await putShift({
      ...shift,
      rows,
      authorId,
      participants: participantsPayload,
      participantIds: teammateIds,
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
  _userName: string,
  period: StatsPeriod,
): { earned: number; volume: number; shifts: number } {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // shifts уже отфильтрованы по author в useShifts — считаем все свои
  const filtered = shifts.filter((s) => {
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
