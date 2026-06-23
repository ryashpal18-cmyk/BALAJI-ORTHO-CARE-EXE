import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { queueGetAll, queueRemove, onQueueChange } from "@/lib/offlineDb";
import { onSyncStatus, runSync } from "@/lib/offlineSync";

export function SyncStatusBadge() {
  const [online, setOnline]     = useState(navigator.onLine);
  const [pending, setPending]   = useState(0);
  const [syncing, setSyncing]   = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  useEffect(() => {
    const handleOnline  = () => { setOnline(true); runSync(); };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);

    // App start hone par stuck items (5+ retries) drop kar do
    autoDropStuckItems();

    const offQueue = onQueueChange((count) => setPending(count));
    const offSync  = onSyncStatus((s) => {
      setSyncing(s.syncing);
      if (!s.syncing && s.pending === 0) {
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 3000);
      }
    });

    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
      offQueue(); offSync();
    };
  }, []);

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

  // Online + pending stuck items — tap to clear + retry
  return (
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
  );
}

async function autoDropStuckItems() {
  try {
    const all = await queueGetAll();
    for (const m of all) {
      if ((m.retries || 0) >= 5 && m.id !== undefined) {
        await queueRemove(m.id);
      }
    }
  } catch { /* silent */ }
}

async function handleManualSync() {
  await autoDropStuckItems();
  await runSync();
}
