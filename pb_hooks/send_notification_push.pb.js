/// <reference path="../pb_data/types.d.ts" />

/**
 * После создания notifications — Web Push получателю.
 * PB WorkingDirectory: /opt/pocketbase-calc
 * Скрипт + web-push: /var/www/calc
 * См. deploy/PUSH_NOTIFICATIONS.md
 *
 * Важно: весь код в IIFE — иначе Goja/PB не видит хелперы из колбэка
 * (ReferenceError: relationId is not defined).
 */
(function () {
  function relationId(record, field) {
    try {
      var raw = record.get(field);
      if (raw == null || raw === "") {
        raw = record.getString(field);
      }
      if (raw == null || raw === "") return "";
      if (Array.isArray(raw)) return String(raw[0] || "").trim();
      return String(raw).trim();
    } catch (err) {
      console.error("send-notification-push relationId", field, err);
      return "";
    }
  }

  function resolveSendScript() {
    var candidates = [
      "/var/www/calc/scripts/send-web-push.mjs",
      __hooks + "/../scripts/send-web-push.mjs",
    ];
    for (var i = 0; i < candidates.length; i++) {
      try {
        if ($os.stat(candidates[i])) return candidates[i];
      } catch (_) {
        /* missing */
      }
    }
    return candidates[0];
  }

  function writeTempJson(obj) {
    var dir = $os.tempDir();
    var name = "calc-push-" + $security.randomString(12) + ".json";
    var full = dir + "/" + name;
    $os.writeFile(full, JSON.stringify(obj));
    return full;
  }

  function sendOnePush(sub, title, body) {
    var script = resolveSendScript();
    var endpoint = sub.getString("endpoint");
    var p256dh = sub.getString("p256dh");
    var auth = sub.getString("auth");
    if (!endpoint || !p256dh || !auth) {
      console.error("send-notification-push bad sub keys", sub.id);
      return;
    }

    var tmp = writeTempJson({
      endpoint: endpoint,
      p256dh: p256dh,
      auth: auth,
      title: title,
      body: body,
      url: "/calc/",
    });

    try {
      console.log("send-notification-push exec", script, "tmp=" + tmp);
      var cmd = $os.cmd("node", script, tmp);
      try {
        cmd.dir = "/var/www/calc";
      } catch (_) {
        /* ignore */
      }
      var out = toString(cmd.output());
      console.log("send-notification-push ok", "sub=" + sub.id, out);
    } catch (err) {
      var msg = String(err || "");
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
    try {
      console.log("send-notification-push hook fired");

      var record = e.record;
      if (!record) {
        console.error("send-notification-push no record");
        return;
      }

      var toId = relationId(record, "to");
      var text = String(record.getString("text") || "").trim();
      console.log(
        "send-notification-push fields",
        "to=" + toId,
        "textLen=" + text.length,
      );
      if (!toId || !text) {
        console.error("send-notification-push empty to/text");
        return;
      }

      var fromName = "";
      try {
        var fromId = relationId(record, "from");
        if (fromId) {
          var fromUser = $app.findRecordById("users", fromId);
          var surname = String(fromUser.getString("surname") || "").trim();
          var name = String(fromUser.getString("name") || "").trim();
          fromName = [surname, name].filter(Boolean).join(" ");
        }
      } catch (_) {
        /* ignore */
      }

      var title = fromName ? "Сообщение от " + fromName : "Учёт разметки";

      var subs = [];
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

      for (var i = 0; i < subs.length; i++) {
        sendOnePush(subs[i], title, text);
      }
    } catch (err) {
      console.error("send-notification-push crash", err);
    }
  }, "notifications");

  routerAdd(
    "GET",
    "/api/push-vapid-public-key",
    (e) => {
      var key = $os.getenv("VAPID_PUBLIC_KEY");
      if (!key) {
        throw new BadRequestError("VAPID не настроен на сервере");
      }
      return e.json(200, { publicKey: key });
    },
    $apis.requireAuth(),
  );
})();
