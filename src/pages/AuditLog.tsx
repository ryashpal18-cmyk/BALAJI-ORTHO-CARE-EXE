import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ShieldCheck, Search } from "lucide-react";
import { useAuditLogs } from "@/hooks/useAuditLog";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-success/15 text-success",
  update: "bg-info/15 text-info",
  delete: "bg-destructive/15 text-destructive",
  login: "bg-primary/15 text-primary",
  stock_in: "bg-success/15 text-success",
  stock_out: "bg-warning/15 text-warning",
  print: "bg-muted text-muted-foreground",
};

export default function AuditLog() {
  const { data: logs = [], isLoading } = useAuditLogs({ limit: 300 });
  const [search, setSearch] = useState("");

  const filtered = logs.filter((l) =>
    `${l.actor_name} ${l.module} ${l.action} ${l.description || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div>
          <h1 className="module-header flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" /> Audit Trail
          </h1>
          <p className="text-sm text-muted-foreground">
            Staff activity ka record — kisne kya kiya, kab kiya
          </p>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by staff, module, action..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity Log ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left p-3 font-medium">Time</th>
                    <th className="text-left p-3 font-medium">Staff</th>
                    <th className="text-left p-3 font-medium">Module</th>
                    <th className="text-left p-3 font-medium">Action</th>
                    <th className="text-left p-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
                  )}
                  {!isLoading && filtered.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">
                      Koi log nahi mila (offline ho sakte ho, ya abhi tak koi activity nahi hui)
                    </td></tr>
                  )}
                  {filtered.map((log) => (
                    <tr key={log.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3 font-medium">{log.actor_name}</td>
                      <td className="p-3 capitalize">{log.module}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className={ACTION_COLORS[log.action] || ""}>
                          {log.action}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{log.description || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
