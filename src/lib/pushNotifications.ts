import { formatUserName, hasLocalPbSession } from "./session";
import { isPocketBaseConfigured, pb } from "./pocketbase";

export type NotifyUser = {
  id: string;
  label: string;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

function vapidPublicKeyFromEnv(): string {
  return String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "").trim();
}

/** Публичный VAPID: из сборки или GET /api/push-vapid-public-key. */
export async function resolveVapidPublicKey(): Promise<string> {
  const fromEnv = vapidPublicKeyFromEnv();
  if (fromEnv) return fromEnv;
  if (!isPocketBaseConfigured() || !hasLocalPbSession()) return "";
  try {
    const res = await pb.send("/api/push-vapid-public-key", { method: "GET" });
    const key = String((res as { publicKey?: string })?.publicKey ?? "").trim();
    return key;
  } catch {
    return "";
  }
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Запросить разрешение и сохранить подписку в PB (для приёма при закрытом PWA). */
export async function ensurePushSubscription(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPocketBaseConfigured() || !hasLocalPbSession()) {
    return { ok: false, reason: "Нет сессии" };
  }
  if (!isPushSupported()) {
    return { ok: false, reason: "Push не поддерживается в этом браузере" };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, reason: "Нет сети" };
  }

  const userId = String(pb.authStore.record?.id ?? "").trim();
  if (!userId) return { ok: false, reason: "Нет пользователя" };

  const vapidKey = await resolveVapidPublicKey();
  if (!vapidKey) {
    return { ok: false, reason: "VAPID-ключ не настроен" };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return { ok: false, reason: "Разрешение на уведомления не выдано" };
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    });
  }

  const json = sub.toJSON();
  const endpoint = String(json.endpoint ?? "").trim();
  const p256dh = String(json.keys?.p256dh ?? "").trim();
  const auth = String(json.keys?.auth ?? "").trim();
  if (!endpoint || !p256dh || !auth) {
    return { ok: false, reason: "Не удалось получить ключи подписки" };
  }

  try {
    const existing = await pb.collection("push_subscriptions").getList(1, 1, {
      filter: `endpoint = "${endpoint.replace(/"/g, '\\"')}"`,
    });
    if (existing.items.length > 0) {
      const id = existing.items[0].id;
      await pb.collection("push_subscriptions").update(id, {
        user: userId,
        endpoint,
        p256dh,
        auth,
      });
    } else {
      await pb.collection("push_subscriptions").create({
        user: userId,
        endpoint,
        p256dh,
        auth,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    return { ok: false, reason: msg || "Не удалось сохранить подписку" };
  }

  return { ok: true };
}

/** Список пользователей PB для выбора получателя (включая себя — для теста). */
export async function listNotifyUsers(): Promise<NotifyUser[]> {
  if (!isPocketBaseConfigured() || !hasLocalPbSession()) return [];
  const me = String(pb.authStore.record?.id ?? "").trim();
  const rows = await pb.collection("users").getFullList({
    fields: "id,surname,name,email",
    sort: "surname,name",
  });
  return rows
    .map((u) => {
      const base =
        formatUserName(u as { surname?: string; name?: string }) ||
        String((u as { email?: string }).email ?? "").trim() ||
        u.id;
      const label = u.id === me ? `${base} (я)` : base;
      return { id: u.id, label };
    })
    .sort((a, b) => {
      if (a.id === me) return -1;
      if (b.id === me) return 1;
      return a.label.localeCompare(b.label, "ru");
    });
}

/** Создать уведомление → PB hook шлёт Web Push получателю. */
export async function sendAppNotification(
  toUserId: string,
  text: string,
): Promise<void> {
  if (!isPocketBaseConfigured() || !hasLocalPbSession()) {
    throw new Error("Нет сессии PocketBase");
  }
  const from = String(pb.authStore.record?.id ?? "").trim();
  const body = text.trim();
  const to = toUserId.trim();
  if (!from) throw new Error("Нет отправителя");
  if (!to) throw new Error("Выберите получателя");
  if (!body) throw new Error("Введите текст");
  if (body.length > 500) throw new Error("Текст длиннее 500 символов");

  await pb.collection("notifications").create({
    from,
    to,
    text: body,
  });
}
