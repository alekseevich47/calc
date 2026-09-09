/// <reference path="../pb_data/types.d.ts" />

/**
 * После создания notifications — Web Push получателю.
 * PB: /opt/pocketbase-calc | script+web-push: /var/www/calc
 *
 * Не выносить хелперы наружу колбэка: пул Goja рвёт замыкания.
 * Запуск node через bash -lc + лог stderr в файл (cmd.output глотает причину fail).
 */
onRecordAfterCreateSuccess((e) => {
  try {
    console.log("send-notification-push hook fired");

    const record = e.record;
    if (!record) {
      console.error("send-notification-push no record");
      return;
    }

    let toId = "";
    try {
      let raw = record.get("to");
      if (raw == null || raw === "") raw = record.getString("to");
      if (Array.isArray(raw)) toId = String(raw[0] || "").trim();
      else toId = String(raw || "").trim();
    } catch (err) {
      console.error("send-notification-push read to", err);
    }

    const text = String(record.getString("text") || "").trim();
    console.log(
      "send-notification-push fields",
      "to=" + toId,
      "textLen=" + text.length,
    );
    if (!toId || !text) {
      console.error("send-notification-push empty to/text");
      return;
    }

    let title = "Учёт разметки";
    try {
      let fromId = "";
      let fromRaw = record.get("from");
      if (fromRaw == null || fromRaw === "") fromRaw = record.getString("from");
      if (Array.isArray(fromRaw)) fromId = String(fromRaw[0] || "").trim();
      else fromId = String(fromRaw || "").trim();

      if (fromId) {
        const fromUser = $app.findRecordById("users", fromId);
        const surname = String(fromUser.getString("surname") || "").trim();
        const name = String(fromUser.getString("name") || "").trim();
        const fromName = [surname, name].filter(Boolean).join(" ");
        if (fromName) title = "Сообщение от " + fromName;
      }
    } catch (_) {
      /* ignore */
    }

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

    const vapidPublic = String($os.getenv("VAPID_PUBLIC_KEY") || "");
    const vapidPrivate = String($os.getenv("VAPID_PRIVATE_KEY") || "");
    const vapidSubject = String(
      $os.getenv("VAPID_SUBJECT") || "mailto:kkabenyuk@gmail.com",
    );

    console.log(
      "send-notification-push start",
      "to=" + toId,
      "subs=" + subs.length,
      "vapidPublic=" + (vapidPublic ? "yes" : "NO"),
      "vapidPrivate=" + (vapidPrivate ? "yes" : "NO"),
    );

    const script = "/var/www/calc/scripts/send-web-push.mjs";

    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i];
      const endpoint = sub.getString("endpoint");
      const p256dh = sub.getString("p256dh");
      const auth = sub.getString("auth");
      if (!endpoint || !p256dh || !auth) {
        console.error("send-notification-push bad sub keys", sub.id);
        continue;
      }

      // Не /tmp: у файлов от $os.writeFile там бывает EACCES для node.
      const tmpDir = "/var/www/calc/.push-tmp";
      try {
        $os.mkdirAll(tmpDir);
      } catch (_) {
        /* exists */
      }
      const tmp =
        tmpDir + "/calc-push-" + $security.randomString(12) + ".json";
      const outFile = tmp + ".out";

      $os.writeFile(
        tmp,
        JSON.stringify({
          endpoint: endpoint,
          p256dh: p256dh,
          auth: auth,
          title: title,
          body: text,
          url: "/",
          vapidPublic: vapidPublic,
          vapidPrivate: vapidPrivate,
          vapidSubject: vapidSubject,
        }),
      );

      // bash -lc: chmod + node; stderr в файл; всегда exit 0 для cmd.output()
      const shell =
        "chmod 644 " +
        tmp +
        "; cd /var/www/calc; " +
        "node " +
        script +
        " " +
        tmp +
        " >" +
        outFile +
        " 2>&1; " +
        "ec=$?; " +
        "echo __EXIT:$ec >>" +
        outFile +
        "; " +
        "exit 0";

      try {
        console.log("send-notification-push exec", script);
        const cmd = $os.cmd("bash", "-lc", shell);
        try {
          toString(cmd.output());
        } catch (runErr) {
          console.error("send-notification-push bash err", runErr);
        }

        let out = "";
        try {
          out = toString($os.readFile(outFile));
        } catch (readErr) {
          console.error("send-notification-push read out", readErr);
        }
        console.log("send-notification-push node-out", out);

        if (out.indexOf("__EXIT:0") >= 0) {
          console.log("send-notification-push ok", "sub=" + sub.id);
        } else if (out.indexOf("__EXIT:2") >= 0) {
          console.error("send-notification-push stale sub", sub.id);
          try {
            $app.delete(sub);
            console.log("send-notification-push removed stale sub", sub.id);
          } catch (delErr) {
            console.error("send-notification-push delete sub failed", delErr);
          }
        } else {
          console.error("send-notification-push fail", "sub=" + sub.id);
        }
      } catch (err) {
        console.error("send-notification-push exec crash", err);
      } finally {
        try {
          $os.remove(tmp);
        } catch (_) {
          /* ignore */
        }
        try {
          $os.remove(outFile);
        } catch (_) {
          /* ignore */
        }
      }
    }
  } catch (err) {
    console.error("send-notification-push crash", err);
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
