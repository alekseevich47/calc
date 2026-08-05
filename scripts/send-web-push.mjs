/**
 * Отправка Web Push (вызывается из PB hook).
 * Usage: node scripts/send-web-push.mjs <payload.json>
 *
 * Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (опц.)
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

const publicKey = process.env.VAPID_PUBLIC_KEY || "";
const privateKey = process.env.VAPID_PRIVATE_KEY || "";
const subject = process.env.VAPID_SUBJECT || "mailto:kkabenyuk@gmail.com";

if (!publicKey || !privateKey) {
  console.error("VAPID keys missing");
  process.exit(1);
}

const data = JSON.parse(readFileSync(payloadPath, "utf8"));
webpush.setVapidDetails(subject, publicKey, privateKey);

const payload = JSON.stringify({
  title: data.title || "Учёт разметки",
  body: data.body || "",
  url: data.url || "/calc/",
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
  console.error("web-push error", status, err?.message || err);
  if (status === 404 || status === 410) process.exit(2);
  process.exit(1);
}
