import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { initSync } from "./lib/sync";
import "./styles/index.css";

initSync();

createRoot(document.getElementById("root")!).render(<App />);
