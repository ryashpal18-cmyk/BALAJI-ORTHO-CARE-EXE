import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { startAutoSync } from "./lib/offlineSync";
import { startAutoBackupScheduler } from "./lib/backup";
import { initErrorLogging } from "./lib/errorLogging";
import { migrateLegacyIndexedDbIfNeeded } from "./lib/offlineDb";

initErrorLogging();
// ✅ Purani IndexedDB (agar kisi PC pe abhi bhi pada hai) ko SQLite mein
// ek baar migrate karke permanently hata do — startAutoSync se pehle,
// taaki sync purane queue ko bhi SQLite se hi utha sake.
migrateLegacyIndexedDbIfNeeded().finally(() => {
  startAutoSync();
});
startAutoBackupScheduler();

createRoot(document.getElementById("root")!).render(<App />);
