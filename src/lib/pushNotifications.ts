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

/** Есть ли у текущего пользователя запись в push_subscriptions. */
export async function hasOwnPushSubscription(): Promise<boolean> {
  if (!isPocketBaseConfigured() || !hasLocalPbSession()) return false;
  const userId = String(pb.authStore.record?.id ?? "").trim();
  if (!userId) return false;
  try {
    const list = await pb.collection("push_subscriptions").getList(1, 1, {
      filter: `user = "${userId}"`,
    });
    return list.items.length > 0;
  } catch {
    return false;
  }
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
    return {
      ok: false,
      reason: "VAPID-ключ не настроен (VITE_VAPID_PUBLIC_KEY при сборке или API на сервере)",
    };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return { ok: false, reason: "Разрешение на уведомления не выдано" };
  }

  const reg = await navigator.serviceWorker.ready;

  // Всегда пересоздаём подписку под текущий VAPID (старая с другим ключом ломает push)
  try {
    const existingSub = await reg.pushManager.getSubscription();
    if (existingSub) await existingSub.unsubscribe();
  } catch {
    /* ignore */
  }

  let sub: PushSubscription;
  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    return { ok: false, reason: msg || "subscribe() не удался" };
  }

  const json = sub.toJSON();
  const endpoint = String(json.endpoint ?? "").trim();
  const p256dh = String(json.keys?.p256dh ?? "").trim();
  const auth = String(json.keys?.auth ?? "").trim();
  if (!endpoint || !p256dh || !auth) {
    return { ok: false, reason: "Не удалось получить ключи подписки" };
  }

  try {
    const existing = await pb.collection("push_subscriptions").getList(1, 50, {
      filter: `user = "${userId}"`,
    });
    // Одна актуальная подписка на пользователя: обновляем первую / создаём, лишние удаляем
    if (existing.items.length > 0) {
      const [primary, ...rest] = existing.items;
      await pb.collection("push_subscriptions").update(primary.id, {
        user: userId,
        endpoint,
        p256dh,
        auth,
      });
      await Promise.all(
        rest.map((r) => pb.collection("push_subscriptions").delete(r.id).catch(() => undefined)),
      );
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
    return { ok: false, reason: msg || "Не удалось сохранить подписку в PB" };
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

  // Себе — без активной подписки push точно не уйдёт
  if (to === from) {
    const sub = await ensurePushSubscription();
    if (!sub.ok) {
      throw new Error(sub.reason || "Сначала разрешите уведомления");
    }
    const saved = await hasOwnPushSubscription();
    if (!saved) {
      throw new Error("Подписка не сохранена в push_subscriptions — проверьте права коллекции");
    }
  }

  await pb.collection("notifications").create({
    from,
    to,
    text: body,
  });
}
