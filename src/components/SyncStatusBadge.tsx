import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { onQueueChange } from "@/lib/offlineDb";
import { isOnline, onNetworkChange, onSyncStatus, runSync } from "@/lib/offlineSync";

export function SyncStatusBadge() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let mounted = true;
    isOnline().then((v) => mounted && setOnline(v));

    const offNet = onNetworkChange((v) => setOnline(v));
    const offQueue = onQueueChange((count) => setPending(count));
    const offSync = onSyncStatus((status) => setSyncing(status.syncing));

    return () => {
      mounted = false;
      offNet();
      offQueue();
      offSync();
    };
  }, []);

  // Sab kuch sync ho chuka aur online hain — koi badge dikhane ki zaroorat nahi.
  if (online && pending === 0 && !syncing) return null;

  const label = !online
    ? (pending > 0 ? `Offline · ${pending} pending` : "Offline")
    : syncing
      ? "Syncing..."
      : `${pending} pending sync`;

  const color = !online ? "#b45309" : syncing ? "#1e57b0" : "#0e7c4a";
  const bg = !online ? "rgba(254,243,199,0.9)" : syncing ? "rgba(219,234,254,0.9)" : "rgba(220,252,231,0.9)";
  const border = !online ? "#fcd34d" : syncing ? "#bfdbfe" : "#86efac";

  return (
    <button
      onClick={() => { if (online) runSync(); }}
      title={!online ? "Internet nahi hai — data local me save ho raha hai, wapas aane par auto-sync ho jayega" : pending > 0 ? "Tap karke abhi sync karein" : "Sab sync ho gaya"}
      style={{
        display: "flex", alignItems: "center", gap: "6px",
        height: "32px", padding: "0 10px",
        borderRadius: "8px",
        border: `1.5px solid ${border}`,
        background: bg,
        color,
        fontSize: "12px", fontWeight: 600,
        cursor: online ? "pointer" : "default",
        whiteSpace: "nowrap",
      }}
    >
      {!online ? (
        <CloudOff style={{ width: "14px", height: "14px" }} />
      ) : syncing ? (
        <RefreshCw style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} />
      ) : (
        <Cloud style={{ width: "14px", height: "14px" }} />
      )}
      {label}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
