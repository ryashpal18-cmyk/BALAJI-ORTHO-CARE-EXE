import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { queueCount, queueStuckCount, onQueueChange } from "@/lib/offlineDb";
import { onSyncStatus, runSync } from "@/lib/offlineSync";

export function SyncStatusBadge() {
  const [online, setOnline]     = useState(navigator.onLine);
  const [pending, setPending]   = useState(0);
  // 🚨 FIX: pehle "stuck" (MAX retries tak fail ho chuki) entries ko chupke
  // se delete kar diya jaata tha app start hote hi ya sync tap karte hi —
  // bina bataye patient/bill data gum ho sakta tha. Ab unhe delete nahi
  // karte, sirf alag se count karke dikhate hain taaki pata chale kuch
  // atka hua hai aur review kiya ja sake.
  const [stuck, setStuck]       = useState(0);
  const [syncing, setSyncing]   = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  useEffect(() => {
    const handleOnline  = () => { setOnline(true); void runSync().catch(() => {}); };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);

    refreshStuckCount();
    const stuckInterval = setInterval(refreshStuckCount, 60000);

    const offQueue = onQueueChange((count) => setPending(count));
    const offSync  = onSyncStatus((s) => {
      setSyncing(s.syncing);
      setPending(s.pending);
      if (!s.syncing && s.pending === 0) {
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 3000);
      }
    });

    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
      offQueue(); offSync();
      clearInterval(stuckInterval);
    };
  }, []);

  async function refreshStuckCount() {
    try { setStuck(await queueStuckCount()); setPending(await queueCount()); } catch { /* silent */ }
  }

  // Online + kuch pending nahi + sync nahi chal raha = badge dikhao hi mat
  if (online && pending === 0 && !syncing && !justSynced) return null;

  // Abhi sync hua — 3 second green checkmark
  if (justSynced && pending === 0) return (
    <div style={{
      display: "flex", alignItems: "center", gap: "6px",
      height: "32px", padding: "0 10px", borderRadius: "8px",
      border: "1.5px solid #86efac", background: "rgba(220,252,231,0.9)",
      color: "#0e7c4a", fontSize: "12px", fontWeight: 600,
    }}>
      <CheckCircle2 style={{ width: "14px", height: "14px" }} />
      Synced ✓
    </div>
  );

  // Offline
  if (!online) return (
    <div style={{
      display: "flex", alignItems: "center", gap: "6px",
      height: "32px", padding: "0 10px", borderRadius: "8px",
      border: "1.5px solid #fcd34d", background: "rgba(254,243,199,0.9)",
      color: "#b45309", fontSize: "12px", fontWeight: 600,
    }}>
      <CloudOff style={{ width: "14px", height: "14px" }} />
      {pending > 0 ? `Offline · ${pending} pending` : "Offline"}
    </div>
  );

  // Syncing
  if (syncing) return (
    <div style={{
      display: "flex", alignItems: "center", gap: "6px",
      height: "32px", padding: "0 10px", borderRadius: "8px",
      border: "1.5px solid #bfdbfe", background: "rgba(219,234,254,0.9)",
      color: "#1e57b0", fontSize: "12px", fontWeight: 600,
    }}>
      <RefreshCw style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} />
      Syncing...
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // Online + pending items — tap to retry
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <button
        onClick={handleManualSync}
        title="Tap karke sync karo"
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          height: "32px", padding: "0 10px", borderRadius: "8px",
          border: "1.5px solid #bfdbfe", background: "rgba(219,234,254,0.9)",
          color: "#1e57b0", fontSize: "12px", fontWeight: 600, cursor: "pointer",
        }}
      >
        <RefreshCw style={{ width: "14px", height: "14px" }} />
        {pending} pending · Tap
      </button>
      {/* 🆕 FIX: ye entries khud retry nahi hongi (bahut baar fail ho chuki
          hain — shayad data problem hai, jaise duplicate ya galat field).
          Pehle inhe chupke se delete kar diya jaata tha; ab bas dikha rahe
          hain taaki data safe rahe aur dekh ke faisla liya ja sake. */}
      {stuck > 0 && (
        <span
          title="Data PC par safe hai. Background retry chalti rahegi; baar-baar fail ho to support ko logs bhejein."
          style={{
            display: "flex", alignItems: "center", height: "32px", padding: "0 8px",
            borderRadius: "8px", border: "1.5px solid #fca5a5", background: "rgba(254,226,226,0.9)",
            color: "#b91c1c", fontSize: "11px", fontWeight: 600,
          }}
        >
          ⚠ {stuck} atki hui
        </span>
      )}
    </div>
  );
}

async function handleManualSync() {
  await runSync().catch(() => {});
}
