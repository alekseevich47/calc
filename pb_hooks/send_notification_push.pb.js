/// <reference path="../pb_data/types.d.ts" />

/**
 * После создания notifications — Web Push получателю.
 * Нужны: Node + web-push в /var/www/calc, env VAPID_* на pocketbase-calc.
 * См. deploy/PUSH_NOTIFICATIONS.md
 */

function writeTempJson(obj) {
  const dir = $os.tempDir();
  const name = "calc-push-" + $security.randomString(12) + ".json";
  const full = dir + "/" + name;
  $os.writeFile(full, JSON.stringify(obj));
  return full;
}

function sendOnePush(sub, title, body) {
  const script = __hooks + "/../scripts/send-web-push.mjs";
  const tmp = writeTempJson({
    endpoint: sub.getString("endpoint"),
    p256dh: sub.getString("p256dh"),
    auth: sub.getString("auth"),
    title: title,
    body: body,
    url: "/calc/",
  });

  try {
    const cmd = $os.cmd("node", script, tmp);
    const out = toString(cmd.output());
    console.log("send-notification-push ok", "sub=" + sub.id, out);
  } catch (err) {
    const msg = String(err || "");
    console.error("send-notification-push fail", "sub=" + sub.id, msg);
    // exit 2 → GONE: удаляем мёртвую подписку
    if (msg.indexOf("exit status 2") >= 0 || msg.indexOf("exit code 2") >= 0) {
      try {
        $app.delete(sub);
        console.log("send-notification-push removed stale sub", sub.id);
      } catch (delErr) {
        console.error("send-notification-push delete sub failed", delErr);
      }
    }
  } finally {
    try {
      $os.remove(tmp);
    } catch (_) {
      /* ignore */
    }
  }
}

onRecordAfterCreateSuccess((e) => {
  const record = e.record;
  if (!record || record.collection().name !== "notifications") return;

  const toId = record.getString("to");
  const text = String(record.getString("text") || "").trim();
  if (!toId || !text) return;

  let fromName = "";
  try {
    const fromId = record.getString("from");
    if (fromId) {
      const fromUser = $app.findRecordById("users", fromId);
      const surname = String(fromUser.getString("surname") || "").trim();
      const name = String(fromUser.getString("name") || "").trim();
      fromName = [surname, name].filter(Boolean).join(" ");
    }
  } catch (_) {
    /* ignore */
  }

  const title = fromName ? "Сообщение от " + fromName : "Учёт разметки";

  let subs = [];
  try {
    subs = $app.findRecordsByFilter(
      "push_subscriptions",
      "user = {:uid}",
      "-created",
      20,
      0,
      { uid: toId },
    );
  } catch (err) {
    console.error("send-notification-push list subs", err);
    return;
  }

  if (!subs || subs.length === 0) {
    console.log("send-notification-push no subscriptions", "to=" + toId);
    return;
  }

  console.log(
    "send-notification-push start",
    "to=" + toId,
    "subs=" + subs.length,
  );

  for (let i = 0; i < subs.length; i++) {
    sendOnePush(subs[i], title, text);
  }
}, "notifications");

routerAdd(
  "GET",
  "/api/push-vapid-public-key",
  (e) => {
    const key = $os.getenv("VAPID_PUBLIC_KEY");
    if (!key) {
      throw new BadRequestError("VAPID не настроен на сервере");
    }
    return e.json(200, { publicKey: key });
  },
  $apis.requireAuth(),
);
