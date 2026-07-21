import PocketBase from "pocketbase";

const url = import.meta.env.VITE_POCKETBASE_URL?.replace(/\/$/, "") ?? "";

/** Singleton PocketBase-клиент. Пустой URL → сеть недоступна, работаем только с локальным кэшем. */
export const pb = new PocketBase(url || "http://127.0.0.1:8090");

export function isPocketBaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_POCKETBASE_URL);
}
