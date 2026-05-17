import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { Users, TrendingUp, Receipt, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";

const monthlyPatients = [
  { month: "Jan", patients: 120 }, { month: "Feb", patients: 145 },
  { month: "Mar", patients: 160 }, { month: "Apr", patients: 180 },
  { month: "May", patients: 155 }, { month: "Jun", patients: 190 },
];

const revenueData = [
  { month: "Jan", revenue: 85000 }, { month: "Feb", revenue: 92000 },
  { month: "Mar", revenue: 110000 }, { month: "Apr", revenue: 125000 },
  { month: "May", revenue: 98000 }, { month: "Jun", revenue: 135000 },
];

const serviceBreakdown = [
  { name: "OPD", value: 45 }, { name: "X-Ray", value: 20 },
  { name: "Physio", value: 15 }, { name: "IPD", value: 12 },
  { name: "Procedures", value: 8 },
];

const COLORS = [
  "hsl(210, 80%, 35%)", "hsl(185, 65%, 45%)", "hsl(142, 70%, 40%)",
  "hsl(38, 92%, 50%)", "hsl(0, 72%, 51%)",
];

export default function Analytics() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="module-header">Analytics</h1>
          <p className="text-sm text-muted-foreground">Clinic performance overview</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Patients" value="1,248" icon={Users} variant="primary" trend="+8% this month" />
          <StatCard title="Monthly Revenue" value="₹1.35L" icon={TrendingUp} variant="success" trend="+15%" />
          <StatCard title="Pending Dues" value="₹24,500" icon={Receipt} variant="warning" />
          <StatCard title="Physio Sessions" value={48} icon={Activity} variant="secondary" />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Monthly Patients</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyPatients}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 88%)" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="patients" fill="hsl(210, 80%, 35%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 88%)" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(val: number) => `₹${val.toLocaleString()}`} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(185, 65%, 45%)" strokeWidth={2} dot={{ fill: "hsl(185, 65%, 45%)" }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-heading text-base">Service Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <ResponsiveContainer width={200} height={200}>
                  <PieChart>
                    <Pie data={serviceBreakdown} dataKey="value" cx="50%" cy="50%" outerRadius={80}>
                      {serviceBreakdown.map((_, i) => (
                        <Cell key={i} fill={COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3">
                  {serviceBreakdown.map((s, i) => (
                    <div key={s.name} className="flex items-center gap-2 text-sm">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                      <span>{s.name} ({s.value}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
