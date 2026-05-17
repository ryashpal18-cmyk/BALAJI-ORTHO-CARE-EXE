import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { Users, Calendar, Receipt, UserPlus, IndianRupee, MessageCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardStats, useTodayBills, usePendingBills } from "@/hooks/useDatabase";
import { useNavigate } from "react-router-dom";
import { OrthoPanel } from "@/components/ortho/OrthoPanel";
import logo from "@/assets/logo.png";

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: stats } = useDashboardStats();
  const { data: todayBills } = useTodayBills();
  const { data: pendingBills } = usePendingBills();

  const todayTotalAmount = todayBills?.reduce((sum, b) => sum + Number(b.amount), 0) || 0;
  const pendingTotal = pendingBills?.reduce((sum, b) => sum + Math.max(Number(b.amount) - Number((b as any).amount_paid || 0), 0), 0) || 0;

  const buildDueReminder = (patient: any, total: number, paid: number, due: number) => `नमस्ते ${patient?.name || "Patient"} जी 🙏
Balaji Ortho Care Center की सूचना।

आपका बिल विवरण:
💰 कुल बिल: ₹${total}
✅ जमा राशि: ₹${paid}
❗ बकाया राशि: ₹${due}

कृपया ₹${due} जल्द जमा करवाएं।

धन्यवाद 🙏
Balaji Ortho Care Center`;

  const openReminder = (patient: any, total: number, paid: number, due: number) => {
    const digits = (patient?.mobile || "").replace(/\D/g, "").replace(/^91/, "");
    if (!digits) return;
    window.open(`https://wa.me/91${digits}?text=${encodeURIComponent(buildDueReminder(patient, total, paid, due))}`, "_blank");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Balaji Ortho Care Center" className="h-12 w-12 object-contain" />
            <div>
              <h1 className="module-header">Dashboard</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Welcome back, Dr. Rathore · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          <Button className="emergency-btn gap-2 w-fit" onClick={() => navigate("/opd")}>
            <UserPlus className="h-4 w-4" />
            New Patient Admission
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Today's Patients" value={todayBills?.length ?? 0} icon={Users} variant="primary" />
          <StatCard title="Appointments" value={stats?.todayAppointments ?? 0} icon={Calendar} variant="secondary" />
          <StatCard title="Pending Payments" value={`₹${pendingTotal.toLocaleString()}`} icon={Receipt} variant="warning" />
          <StatCard title="Today's Revenue" value={`₹${todayTotalAmount.toLocaleString()}`} icon={IndianRupee} variant="success" />
        </div>

        {/* Today's Patients */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                Today's Patients
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-primary text-xs" onClick={() => navigate("/billing")}>View All</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {!todayBills?.length && <p className="text-sm text-muted-foreground text-center py-4">No bills today</p>}
              {todayBills?.slice(0, 8).map((bill) => {
                const displayService = bill.service.includes("|")
                  ? bill.service.split("|").map((s: string) => s.split(":")[0].trim()).join(", ")
                  : bill.service;
                return (
                  <div key={bill.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{(bill.patients as any)?.name}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">{displayService}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">₹{Number(bill.amount).toLocaleString()}</p>
                      <Badge variant="secondary" className={`text-[10px] border-0 ${bill.status === "Paid" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                        {bill.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
            {todayBills && todayBills.length > 0 && (
              <div className="mt-4 p-3 bg-primary/10 rounded-lg flex justify-between items-center">
                <span className="text-sm font-medium">Total ({todayBills.length} patients)</span>
                <span className="text-lg font-bold text-primary">₹{todayTotalAmount.toLocaleString()}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Dues */}
        {pendingBills && pendingBills.length > 0 && (
          <Card className="border-warning/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-heading flex items-center gap-2 text-warning">
                  <Receipt className="h-4 w-4" />
                  Pending Dues ({pendingBills.length} patients) — ₹{pendingTotal.toLocaleString()}
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-primary text-xs" onClick={() => navigate("/billing")}>View All</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-left py-2 font-medium">Name</th>
                      <th className="text-right py-2 font-medium">Total</th>
                      <th className="text-center py-2 font-medium">Paid</th>
                      <th className="text-right py-2 font-medium text-destructive">DUE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingBills.slice(0, 12).map(bill => {
                      const patient = bill.patients as any;
                      const mobile = patient?.mobile || "";
                      const total = Number(bill.amount || 0);
                      const paid = Number((bill as any).amount_paid || 0);
                      const due = Math.max(total - paid, 0);
                      if (due <= 0) return null;
                      return (
                        <tr key={bill.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 font-medium">{patient?.name}</td>
                          <td className="py-2 text-right font-medium">₹{total.toLocaleString()}</td>
                          <td className="py-2 text-center">
                            <span className="text-success font-medium">₹{paid.toLocaleString()}</span>
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className="font-bold text-destructive">₹{due.toLocaleString()}</span>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => navigate("/billing")} title="Edit">
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-success disabled:text-muted-foreground" onClick={() => openReminder(patient, total, paid, due)} title="WhatsApp reminder" disabled={!mobile}>
                                <MessageCircle className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ortho Panel */}
        <OrthoPanel />
      </div>
    </DashboardLayout>
  );
}
