import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./app/App.tsx";
import { ensureAuthProfile, restoreSession } from "./lib/session";
import { initSync } from "./lib/sync";
import "./styles/index.css";

/** Проверка нового SW: при online / возврате в приложение / раз в минуту */
const SW_UPDATE_INTERVAL_MS = 60_000;

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;

    const checkForUpdate = () => {
      void registration.update();
    };

    window.addEventListener("online", checkForUpdate);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForUpdate();
    });
    window.setInterval(checkForUpdate, SW_UPDATE_INTERVAL_MS);
  },
});

restoreSession();
initSync();
void ensureAuthProfile();

createRoot(document.getElementById("root")!).render(<App />);
