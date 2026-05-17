import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type SmsLog = {
  id: string;
  patient_name: string | null;
  mobile: string | null;
  message: string | null;
  status: string | null;
  sms_type: string | null;
  sent_at: string | null;
};

export default function SmsLogs() {
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("sms_logs" as any)
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(500);
      if (!error) setLogs((data || []) as any);
      setLoading(false);
    })();
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
            <CardTitle className="text-base">All Sent SMS ({logs.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No SMS logs</TableCell></TableRow>
                  ) : filtered.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.patient_name || "—"}</TableCell>
                      <TableCell>{l.mobile || "—"}</TableCell>
                      <TableCell><Badge variant="outline">{l.sms_type || "general"}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={l.status === "sent" ? "default" : "destructive"}>
                          {l.status || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {l.sent_at ? new Date(l.sent_at).toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={l.message || ""}>
                        {l.message || "—"}
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
