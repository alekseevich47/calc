import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { ensureAuthProfile, restoreSession } from "./lib/session";
import { initSync } from "./lib/sync";
import "./styles/index.css";

restoreSession();
initSync();
void ensureAuthProfile();

createRoot(document.getElementById("root")!).render(<App />);
