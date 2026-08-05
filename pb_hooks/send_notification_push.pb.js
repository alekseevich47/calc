/// <reference path="../pb_data/types.d.ts" />

/**
 * После создания notifications — Web Push получателю.
 * Нужны: Node + web-push в /var/www/calc, env VAPID_* на pocketbase-calc.
 * См. deploy/PUSH_NOTIFICATIONS.md
 */

function relationId(record, field) {
  const raw = record.get(field);
  if (raw == null || raw === "") return "";
  if (Array.isArray(raw)) return String(raw[0] || "").trim();
  return String(raw).trim();
}

function writeTempJson(obj) {
  const dir = $os.tempDir();
  const name = "calc-push-" + $security.randomString(12) + ".json";
  const full = dir + "/" + name;
  $os.writeFile(full, JSON.stringify(obj));
  return full;
}

function sendOnePush(sub, title, body) {
  const script = __hooks + "/../scripts/send-web-push.mjs";
  const endpoint = sub.getString("endpoint");
  const p256dh = sub.getString("p256dh");
  const auth = sub.getString("auth");
  if (!endpoint || !p256dh || !auth) {
    console.error("send-notification-push bad sub keys", sub.id);
    return;
  }

  const tmp = writeTempJson({
    endpoint: endpoint,
    p256dh: p256dh,
    auth: auth,
    title: title,
    body: body,
    url: "/calc/",
  });

  try {
    // WorkingDirectory проекта — чтобы node нашёл web-push в node_modules
    const root = __hooks + "/..";
    const cmd = $os.cmd("node", script, tmp);
    try {
      cmd.dir = root;
    } catch (_) {
      /* older PB without .dir */
    }
    const out = toString(cmd.output());
    console.log("send-notification-push ok", "sub=" + sub.id, out);
  } catch (err) {
    const msg = String(err || "");
    console.error("send-notification-push fail", "sub=" + sub.id, msg);
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
  console.log("send-notification-push hook fired");

  const record = e.record;
  if (!record) {
    console.error("send-notification-push no record");
    return;
  }

  const colName = record.collection().name;
  if (colName !== "notifications") {
    console.log("send-notification-push skip collection", colName);
    return;
  }

  const toId = relationId(record, "to");
  const text = String(record.getString("text") || "").trim();
  if (!toId || !text) {
    console.error(
      "send-notification-push empty to/text",
      "to=" + toId,
      "textLen=" + text.length,
    );
    return;
  }

  let fromName = "";
  try {
    const fromId = relationId(record, "from");
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
    "vapidPublic=" + ($os.getenv("VAPID_PUBLIC_KEY") ? "yes" : "NO"),
    "vapidPrivate=" + ($os.getenv("VAPID_PRIVATE_KEY") ? "yes" : "NO"),
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
