import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cacheGetAll, queueGetAll, queueRemove, queueUpdate, onQueueChange } from "@/lib/offlineDb";
import { runSync } from "@/lib/offlineSync";
import { smsLogRows } from "@/lib/smsLogRows";

type SmsLog = {
  id: string;
  patient_name: string | null;
  mobile: string | null;
  message: string | null;
  status: string | null;
  sms_type: string | null;
  sent_at: string | null;
  last_error?: string;
  queue_id?: number;
  unconfirmed?: boolean;
};

export default function SmsLogs() {
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  // Unconfirmed SMS: staff gateway check karne ke baad khud faisla leta hai (auto-resend kabhi nahi).
  const resend = async (queueId: number) => {
    if (!window.confirm("Gateway (TextBee) me check kar liya? Agar SMS pehle hi chala gaya ho to patient ko duplicate SMS jayega. Dobara bhejein?")) return;
    setBusyId(queueId);
    try {
      const entry = (await queueGetAll()).find(q => q.id === queueId && q.op === "sms");
      if (!entry) return;
      const { deliveryState: _parked, ...payload } = entry.payload || {};
      await queueUpdate(queueId, { payload: { ...payload, messageId: crypto.randomUUID() }, retries: 0, lastError: "", lastAttemptAt: 0 });
      void runSync().catch(() => {});
    } catch { setLoadError("SMS dobara queue nahi hua. Data PC par safe hai, dobara try karein."); }
    finally { setBusyId(null); }
  };
  const discard = async (queueId: number) => {
    if (!window.confirm("Ye SMS outbox se hata dein? Ye patient ko nahi bheja jayega.")) return;
    setBusyId(queueId);
    try { await queueRemove(queueId); }
    catch { setLoadError("SMS outbox se hata nahi paya. Dobara try karein."); }
    finally { setBusyId(null); }
  };

  useEffect(() => {
    let live = true;
    const refresh = async () => {
      try {
        const [cached, pending] = await Promise.all([cacheGetAll("sms_logs"), queueGetAll()]);
        if (live) { setLogs(smsLogRows(cached, pending)); setLoadError(""); }
      } catch { if (live) setLoadError("SMS records load nahi hue. Pending data clear na karein."); }
      finally { if (live) setLoading(false); }
    };
    void refresh();
    const off = onQueueChange(() => { void refresh(); });
    const timer = setInterval(refresh, 5000);
    return () => { live = false; off(); clearInterval(timer); };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        (l.patient_name || "").toLowerCase().includes(q) ||
        (l.mobile || "").includes(q) ||
        (l.sms_type || "").toLowerCase().includes(q) ||
        (l.status || "").toLowerCase().includes(q)
    );
  }, [logs, search]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-heading font-bold">SMS Logs</h1>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">SMS Outbox & History ({logs.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadError && <p role="alert" className="text-destructive">{loadError}</p>}
            <p className="text-xs text-muted-foreground">Sent = gateway accepted; phone delivery confirmation nahi. Delivery unconfirmed ho to gateway check kiye bina dobara na bhejein.</p>
            <Input
              placeholder="Search by name, mobile, type, status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient Name</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>SMS Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date Time</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No SMS logs</TableCell></TableRow>
                  ) : filtered.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.patient_name || "—"}</TableCell>
                      <TableCell>{l.mobile || "—"}</TableCell>
                      <TableCell><Badge variant="outline">{l.sms_type || "general"}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={l.status === "sent" ? "default" : "destructive"}>
                          {l.status === "sent" ? "Gateway accepted" : l.status || "—"}
                        </Badge>
                        {l.last_error && <p className="text-xs text-muted-foreground">{l.last_error}</p>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {l.sent_at ? new Date(l.sent_at).toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={l.message || ""}>
                        {l.message || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {l.unconfirmed && l.queue_id !== undefined && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" disabled={busyId === l.queue_id} onClick={() => void resend(l.queue_id!)}>Dobara bhejein</Button>
                            <Button size="sm" variant="ghost" disabled={busyId === l.queue_id} onClick={() => void discard(l.queue_id!)}>Hataein</Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
