import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { Users, TrendingUp, Receipt, Activity } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cacheGetAll } from "@/lib/offlineDb";
import { cLog } from "@/lib/clientLogger";

const COLORS = [
  "hsl(210, 80%, 35%)", "hsl(185, 65%, 45%)", "hsl(142, 70%, 40%)",
  "hsl(38, 92%, 50%)", "hsl(0, 72%, 51%)",
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Real data fetch karna ─────────────────────────────────────────────────
function useAnalyticsData() {
  return useQuery({
    queryKey: ["analytics"],
    staleTime: 5 * 60 * 1000, // 5 min cache
    queryFn: async () => {
      const online = navigator.onLine;

      let bills: any[] = [];
      let patients: any[] = [];
      let physioSessions: any[] = [];

      if (online) {
        try {
          const [billsRes, patientsRes, physioRes] = await Promise.all([
            supabase.from("billing").select("amount, amount_paid, status, created_at, service, payment_mode"),
            supabase.from("patients").select("id, created_at"),
            supabase.from("physiotherapy_sessions").select("id, created_at"),
          ]);
          bills         = billsRes.data         || [];
          patients      = patientsRes.data      || [];
          physioSessions = physioRes.data       || [];
        } catch (err) {
          cLog.warn("analytics", "Online fetch fail — cache se le raha hai", err);
        }
      }

      // Offline fallback — cache se lo
      if (!bills.length)          bills          = await cacheGetAll("billing");
      if (!patients.length)       patients       = await cacheGetAll("patients");
      if (!physioSessions.length) physioSessions = await cacheGetAll("physiotherapy_sessions");

      // ── Monthly patients (last 6 months) ──────────────────────────────
      const now      = new Date();
      const last6    = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        return { year: d.getFullYear(), month: d.getMonth() };
      });

      const monthlyPatients = last6.map(({ year, month }) => {
        const count = bills.filter((b: any) => {
          const d = new Date(b.created_at);
          return d.getFullYear() === year && d.getMonth() === month;
        }).length;
        return { month: MONTHS[month], patients: count };
      });

      // ── Monthly revenue (last 6 months) ─────────────────────────────
      const monthlyRevenue = last6.map(({ year, month }) => {
        const revenue = bills
          .filter((b: any) => {
            const d = new Date(b.created_at);
            return d.getFullYear() === year && d.getMonth() === month;
          })
          .reduce((sum: number, b: any) => sum + Number(b.amount_paid || 0), 0);
        return { month: MONTHS[month], revenue };
      });

      // ── Summary stats ────────────────────────────────────────────────
      const totalPatients  = patients.length;
      const thisMonth      = new Date().getMonth();
      const thisYear       = new Date().getFullYear();

      const monthlyRevTotal = bills
        .filter((b: any) => {
          const d = new Date(b.created_at);
          return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
        })
        .reduce((sum: number, b: any) => sum + Number(b.amount_paid || 0), 0);

      const pendingDues = bills.reduce((sum: number, b: any) => {
        const due = Number(b.amount || 0) - Number(b.amount_paid || 0);
        return sum + Math.max(due, 0);
      }, 0);

      const physioCount = physioSessions.filter((s: any) => {
        const d = new Date(s.created_at);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
      }).length;

      // ── Service breakdown ─────────────────────────────────────────────
      const serviceCount: Record<string, number> = {};
      bills.forEach((b: any) => {
        const services = String(b.service || "").split("|");
        services.forEach((s: string) => {
          const name = s.split(":")[0].trim();
          if (name) serviceCount[name] = (serviceCount[name] || 0) + 1;
        });
      });
      const topServices = Object.entries(serviceCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, value]) => ({ name, value }));

      // ── Payment mode breakdown ────────────────────────────────────────
      const paymentModes: Record<string, number> = {};
      bills.forEach((b: any) => {
        const mode = b.payment_mode || "Cash";
        paymentModes[mode] = (paymentModes[mode] || 0) + Number(b.amount_paid || 0);
      });
      const paymentBreakdown = Object.entries(paymentModes).map(([name, value]) => ({ name, value }));

      return {
        monthlyPatients,
        monthlyRevenue,
        totalPatients,
        monthlyRevTotal,
        pendingDues,
        physioCount,
        topServices,
        paymentBreakdown,
      };
    },
  });
}

export default function Analytics() {
  const { data, isLoading } = useAnalyticsData();

  const fmt = (n: number) =>
    n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` :
    n >= 1000   ? `₹${(n / 1000).toFixed(1)}K`   : `₹${n}`;

  return (
    <DashboardLayout>
      <div className="space-y-6 page-enter">
        <div>
          <div style={{
            background: "linear-gradient(135deg, #0d2351 0%, #1e57b0 55%, #0e7c4a 100%)",
            borderRadius: "18px", padding: "22px 24px",
            display: "flex", alignItems: "center", gap: "16px",
            boxShadow: "0 8px 32px rgba(13,35,81,0.28)",
          }}>
            <div style={{
              width: "54px", height: "54px", borderRadius: "14px",
              background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "28px", flexShrink: 0,
            }}>📊</div>
            <div>
              <h1 style={{ fontSize: "22px", fontWeight: 800, color: "white", margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Analytics</h1>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)", margin: 0 }}>Revenue and patient statistics</p>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Patients"
            value={isLoading ? "..." : data?.totalPatients ?? 0}
            icon={Users} variant="primary"
          />
          <StatCard
            title="This Month Revenue"
            value={isLoading ? "..." : fmt(data?.monthlyRevTotal ?? 0)}
            icon={TrendingUp} variant="success"
          />
          <StatCard
            title="Pending Dues"
            value={isLoading ? "..." : fmt(data?.pendingDues ?? 0)}
            icon={Receipt} variant="warning"
          />
          <StatCard
            title="Physio (This Month)"
            value={isLoading ? "..." : data?.physioCount ?? 0}
            icon={Activity} variant="secondary"
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">

          {/* Monthly Patients Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Monthly Patients (Last 6 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data?.monthlyPatients || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 88%)" />
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis fontSize={12} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="patients" fill="hsl(210, 80%, 35%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Revenue Line Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Revenue Trend (Last 6 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={data?.monthlyRevenue || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 88%)" />
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}K`} />
                    <Tooltip formatter={(val: number) => `₹${val.toLocaleString("en-IN")}`} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(185, 65%, 45%)" strokeWidth={2} dot={{ fill: "hsl(185, 65%, 45%)" }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Top Services Pie */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Top Services</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
              ) : !data?.topServices?.length ? (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Koi data nahi</div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={data.topServices} dataKey="value" cx="50%" cy="50%" outerRadius={75}>
                        {data.topServices.map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-2">
                    {data.topServices.map((s: any, i: number) => (
                      <div key={s.name} className="flex items-center gap-2 text-sm">
                        <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span>{s.name} ({s.value})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Mode Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Payment Mode Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
              ) : !data?.paymentBreakdown?.length ? (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Koi data nahi</div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={data.paymentBreakdown} dataKey="value" cx="50%" cy="50%" outerRadius={75}>
                        {data.paymentBreakdown.map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val: number) => `₹${val.toLocaleString("en-IN")}`} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-2">
                    {data.paymentBreakdown.map((p: any, i: number) => (
                      <div key={p.name} className="flex items-center gap-2 text-sm">
                        <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span>{p.name}: ₹{p.value.toLocaleString("en-IN")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </DashboardLayout>
  );
}
