import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { restoreSession } from "./lib/session";
import { initSync } from "./lib/sync";
import "./styles/index.css";

restoreSession();
initSync();

createRoot(document.getElementById("root")!).render(<App />);
