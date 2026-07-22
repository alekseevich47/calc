import PocketBase from "pocketbase";

/**
 * Base URL для SDK (без хвоста `/api` — SDK добавит сам).
 * 1) `VITE_POCKETBASE_URL` из сборки
 * 2) same-origin fallback `/calc` — если env не прошили в бандл (частый кейс PWA/ручной деплой)
 */
function resolvePocketBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_POCKETBASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") {
    const path = window.location.pathname || "";
    if (path === "/calc" || path.startsWith("/calc/")) {
      return `${window.location.origin}/calc`;
    }
  }
  return "";
}

const url = resolvePocketBaseUrl();

/** Singleton PocketBase-клиент. Пустой URL → только локальный кэш. */
export const pb = new PocketBase(url || "http://127.0.0.1:8090");

// Иначе параллельные getFullList в sync могут отменять друг друга.
pb.autoCancellation(false);

export function isPocketBaseConfigured(): boolean {
  return Boolean(resolvePocketBaseUrl());
}

export function getPocketBaseUrl(): string {
  return resolvePocketBaseUrl();
}

/** Публичный URL файла записи (поле `image` и т.п.; protected=false). */
export function pbFileUrl(collection: string, recordId: string, filename: string): string {
  const base = resolvePocketBaseUrl();
  if (!base || !recordId || !filename) return "";
  return `${base}/api/files/${collection}/${recordId}/${encodeURIComponent(filename)}`;
}

export function markingNumberImageUrl(recordId: string, filename: string): string {
  return pbFileUrl("marking_numbers", recordId, filename);
}
