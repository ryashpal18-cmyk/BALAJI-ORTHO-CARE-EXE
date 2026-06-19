import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { startAutoSync } from "./lib/offlineSync";
import { startAutoBackupScheduler } from "./lib/backup";

startAutoSync();
startAutoBackupScheduler();

createRoot(document.getElementById("root")!).render(<App />);
