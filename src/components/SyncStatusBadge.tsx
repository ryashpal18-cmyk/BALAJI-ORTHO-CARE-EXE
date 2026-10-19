import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { metaGet, queueGetAll, onQueueChange, type QueuedMutation } from "@/lib/offlineDb";
import { onSyncStatus, runSync } from "@/lib/offlineSync";

export function SyncStatusBadge() {
  const [open, setOpen] = useState(false), [online, setOnline] = useState(navigator.onLine);
  const [rows, setRows] = useState<QueuedMutation[]>([]), [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(""), [last, setLast] = useState<string | null>(null);
  const refresh = async () => {
    try { const [queue, stamp] = await Promise.all([queueGetAll(), metaGet("last-cloud-sync-at")]); setRows(queue); setLast(stamp || null); }
    catch { setError("स्थानीय sync सूची पढ़ी नहीं जा सकी। ऐप दोबारा खोलें।"); }
  };
  useEffect(() => {
    let active = true;
    const net = () => setOnline(navigator.onLine);
    const queue = onQueueChange(() => { if (active) void refresh(); });
    const sync = onSyncStatus(s => { if (active) { setSyncing(s.syncing); setError(s.lastError || ""); void refresh(); } });
    const timer = setInterval(() => { if (active) void refresh(); }, 15000);
    window.addEventListener("online", net); window.addEventListener("offline", net);
    void refresh();
    return () => { active = false; queue(); sync(); clearInterval(timer); window.removeEventListener("online", net); window.removeEventListener("offline", net); };
  }, []);
  const data = rows.filter(r => r.op !== "sms");
  const review = rows.filter(r => r.op === "sms" && r.payload?.deliveryState === "unconfirmed");
  const sms = rows.filter(r => r.op === "sms" && r.payload?.deliveryState !== "unconfirmed");
  const retry = async () => { setSyncing(true); try { await runSync(); } catch (e: any) { setError(e.message); } finally { setSyncing(false); await refresh(); } };
  return <>
    <Button type="button" size="sm" variant="outline" className="max-w-[230px] text-xs" onClick={() => setOpen(true)}>
      {syncing ? "Sync चल रहा है…" : online ? "Sync स्थिति" : "Offline"} · {data.length} डेटा · {sms.length} SMS{review.length ? ` · ${review.length} जाँचें` : ""}{error ? " ⚠" : ""}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-auto">
      <DialogHeader><DialogTitle>Sync और Pending स्थिति</DialogTitle></DialogHeader>
      <p>अंतिम सफल cloud upload: {last ? new Date(last).toLocaleString("en-IN") : "अभी दर्ज नहीं है"}</p>
      <p>{data.length} डेटा रिकॉर्ड · {sms.length} pending SMS · {review.length} SMS की gateway में जाँच बाकी</p>
      <p className="text-xs text-muted-foreground">यह pending काम की संख्या है; एक मरीज के कई बदलाव हो सकते हैं।</p>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <Button type="button" disabled={syncing || !online} onClick={() => void retry()}>अभी sync करें</Button>
      {rows.map(r => <div key={r.id} className="rounded border p-3 text-sm">
        <p className="font-medium">{r.table} · {r.op} · {r.payload?.patientName || r.payload?.name || r.rowId || r.tempId || r.id}</p>
        <p>प्रयास: {r.retries} · {new Date(r.createdAt).toLocaleString("en-IN")}</p>
        {r.lastError && <p className="break-words text-destructive">{r.lastError}</p>}
        {r.op === "sms" && r.payload?.deliveryState === "unconfirmed" && <p>परिणाम अनिश्चित है। SMS Logs में gateway जाँचकर निर्णय लें। अपने आप दोबारा नहीं भेजा जाएगा।</p>}
      </div>)}
      {!rows.length && <p>डिवाइस की queue में कोई काम बाकी नहीं है।</p>}
    </DialogContent></Dialog>
  </>;
}
