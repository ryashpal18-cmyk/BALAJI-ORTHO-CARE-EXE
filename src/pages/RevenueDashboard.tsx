import { useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, Receipt, Wallet, AlertCircle, IndianRupee,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { useBills } from "@/hooks/useDatabase";

const COLORS = [
  "hsl(210, 80%, 35%)", "hsl(185, 65%, 45%)", "hsl(142, 70%, 40%)",
  "hsl(38, 92%, 50%)", "hsl(0, 72%, 51%)",
];

function getLast30Days() {
  const days: string[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export default function RevenueDashboard() {
  const { data: bills, isLoading } = useBills();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const all = bills || [];
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const days = getLast30Days();

    const todayRevenue = all
      .filter((b: any) => (b.created_at || "").slice(0, 10) === today)
      .reduce((s: number, b: any) => s + Number(b.amount || 0), 0);

    const monthRevenue = all
      .filter((b: any) => (b.created_at || "").startsWith(thisMonth))
      .reduce((s: number, b: any) => s + Number(b.amount || 0), 0);

    const totalCollected = all.reduce((s: number, b: any) => s + Number(b.amount_paid || 0), 0);

    const outstanding = all
      .filter((b: any) => ["Pending", "Partial"].includes(b.status))
      .reduce((s: number, b: any) => s + Math.max(Number(b.amount || 0) - Number(b.amount_paid || 0), 0), 0);

    // Daily revenue — last 30 days
    const dailyRevenue = days.map((d) => {
      const rev = all
        .filter((b: any) => (b.created_at || "").slice(0, 10) === d)
        .reduce((s: number, b: any) => s + Number(b.amount || 0), 0);
      return { date: d.slice(5), revenue: rev };
    });

    // Payment mode breakdown
    const modeMap: Record<string, number> = {};
    all.forEach((b: any) => {
      const mode = b.payment_mode || "Not Set";
      modeMap[mode] = (modeMap[mode] || 0) + Number(b.amount_paid || 0);
    });
    const paymentModes = Object.entries(modeMap)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    // Top services by revenue (not just count)
    const serviceRevenue: Record<string, number> = {};
    all.forEach((b: any) => {
      const services = String(b.service || "Other").split("|");
      const perService = Number(b.amount || 0) / Math.max(services.length, 1);
      services.forEach((s: string) => {
        const key = s.split(":")[0].trim() || "Other";
        serviceRevenue[key] = (serviceRevenue[key] || 0) + perService;
      });
    });
    const topServices = Object.entries(serviceRevenue)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value: Math.round(value) }));

    // Outstanding dues — sorted by largest due
    const duesList = all
      .filter((b: any) => ["Pending", "Partial"].includes(b.status))
      .map((b: any) => ({
        id: b.id,
        patient_id: b.patient_id,
        name: b.patients?.name || "Patient",
        due: Math.max(Number(b.amount || 0) - Number(b.amount_paid || 0), 0),
      }))
      .filter((d) => d.due > 0)
      .sort((a, b) => b.due - a.due)
      .slice(0, 8);

    return { todayRevenue, monthRevenue, totalCollected, outstanding, dailyRevenue, paymentModes, topServices, duesList };
  }, [bills]);

  const fmt = (n: number) =>
    n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : `₹${n}`;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="module-header">Revenue Dashboard</h1>
          <p className="text-sm text-muted-foreground">OPD billing, collections aur pending dues — real-time</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Today's Revenue" value={isLoading ? "..." : fmt(stats.todayRevenue)} icon={IndianRupee} variant="primary" />
          <StatCard title="This Month" value={isLoading ? "..." : fmt(stats.monthRevenue)} icon={TrendingUp} variant="success" />
          <StatCard title="Total Collected" value={isLoading ? "..." : fmt(stats.totalCollected)} icon={Wallet} variant="secondary" />
          <StatCard title="Outstanding Dues" value={isLoading ? "..." : fmt(stats.outstanding)} icon={AlertCircle} variant="warning" />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            Data load ho raha hai...
          </div>
        ) : (
          <>
            {/* Daily revenue trend */}
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-base">Daily Revenue — Last 30 Days</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={stats.dailyRevenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 88%)" />
                    <XAxis dataKey="date" fontSize={10} interval={3} />
                    <YAxis fontSize={11} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v)} />
                    <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                    <Bar dataKey="revenue" fill="hsl(210, 80%, 35%)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Top services by revenue */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-base">Top Services by Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.topServices.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Koi data nahi</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={stats.topServices} layout="vertical" margin={{ left: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 88%)" />
                        <XAxis type="number" fontSize={11} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v)} />
                        <YAxis type="category" dataKey="name" fontSize={11} width={110} />
                        <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                        <Bar dataKey="value" fill="hsl(185, 65%, 45%)" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Payment mode breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-base">Payment Mode Split</CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.paymentModes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Koi data nahi</p>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <ResponsiveContainer width={160} height={160}>
                        <PieChart>
                          <Pie data={stats.paymentModes} dataKey="value" cx="50%" cy="50%" outerRadius={70}>
                            {stats.paymentModes.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-col gap-1.5">
                        {stats.paymentModes.map((m, i) => (
                          <div key={m.name} className="flex items-center gap-2 text-sm">
                            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span>{m.name} — ₹{m.value.toLocaleString("en-IN")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Outstanding dues list */}
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-warning" /> Top Outstanding Dues
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.duesList.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Koi due nahi — sab clear hai 🎉</p>
                ) : (
                  <div className="space-y-2">
                    {stats.duesList.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => navigate(`/patient-profile/${d.patient_id}`)}
                        className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/40 transition-colors"
                      >
                        <span className="text-sm font-medium">{d.name}</span>
                        <Badge variant="outline" className="text-destructive border-destructive/40">
                          ₹{d.due.toLocaleString("en-IN")}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
