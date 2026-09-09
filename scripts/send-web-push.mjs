/**
 * Отправка Web Push (вызывается из PB hook).
 * Usage: node scripts/send-web-push.mjs <payload.json>
 *
 * Ключи: env VAPID_* или поля payload.vapidPublic / vapidPrivate / vapidSubject
 * Exit 2 — подписка устарела (410/404), hook удаляет запись.
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(path.join(root, "package.json"));
const webpush = require("web-push");

const payloadPath = process.argv[2];
if (!payloadPath) {
  console.error("usage: send-web-push.mjs <payload.json>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(payloadPath, "utf8"));

const publicKey =
  process.env.VAPID_PUBLIC_KEY || String(data.vapidPublic || "").trim();
const privateKey =
  process.env.VAPID_PRIVATE_KEY || String(data.vapidPrivate || "").trim();
const subject =
  process.env.VAPID_SUBJECT ||
  String(data.vapidSubject || "").trim() ||
  "mailto:kkabenyuk@gmail.com";

if (!publicKey || !privateKey) {
  console.error("VAPID keys missing (env and payload empty)");
  process.exit(1);
}

if (!data.endpoint || !data.p256dh || !data.auth) {
  console.error("subscription keys missing in payload");
  process.exit(1);
}

webpush.setVapidDetails(subject, publicKey, privateKey);

const payload = JSON.stringify({
  title: data.title || "Учёт разметки",
  body: data.body || "",
  url: data.url || "/",
});

try {
  await webpush.sendNotification(
    {
      endpoint: data.endpoint,
      keys: {
        p256dh: data.p256dh,
        auth: data.auth,
      },
    },
    payload,
  );
  console.log("ok");
} catch (err) {
  const status = Number(err?.statusCode || 0);
  const body = err?.body ? String(err.body) : "";
  console.error(
    "web-push error",
    "status=" + status,
    err?.message || err,
    body,
  );
  if (status === 404 || status === 410) process.exit(2);
  process.exit(1);
}
