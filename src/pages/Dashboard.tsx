import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { Users, Calendar, Receipt, UserPlus, IndianRupee, MessageCircle, Pencil, CheckCircle, X, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDashboardStats, useTodayBills, usePendingBills, useUpdateBill } from "@/hooks/useDatabase";
import { useNavigate } from "react-router-dom";
import { OrthoPanel } from "@/components/ortho/OrthoPanel";
import logo from "@/assets/logo.png";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: stats } = useDashboardStats();
  const { data: todayBills } = useTodayBills();
  const { data: pendingBills, refetch: refetchPending } = usePendingBills();
  const updateBill = useUpdateBill();

  // ── Quick Pay popup state ──
  const [qpBill, setQpBill] = useState<any>(null);
  const [qpPaid, setQpPaid] = useState("");
  const [qpMode, setQpMode] = useState("Cash");
  const [qpSaving, setQpSaving] = useState(false);

  // ── Full Edit popup state ──
  const [editBill, setEditBill] = useState<any>(null);
  const [editPaid, setEditPaid] = useState("");
  const [editMode, setEditMode] = useState("Cash");
  const [editServices, setEditServices] = useState<{name:string; amount:string}[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  const todayTotalAmount = todayBills?.reduce((sum, b) => sum + Number(b.amount), 0) || 0;
  const pendingTotal = pendingBills?.reduce((sum, b) => sum + Math.max(Number(b.amount) - Number((b as any).amount_paid || 0), 0), 0) || 0;

  // ── WhatsApp Reminder ──
  const buildDueReminder = (patient: any, total: number, paid: number, due: number) =>
    `नमस्ते ${patient?.name || "Patient"} जी 🙏\nBalaji Ortho Care Center की सूचना।\n\nआपका बिल विवरण:\n💰 कुल बिल: ₹${total}\n✅ जमा राशि: ₹${paid}\n❗ बकाया राशि: ₹${due}\n\nकृपया ₹${due} जल्द जमा करवाएं।\n\nधन्यवाद 🙏\nBalaji Ortho Care Center`;

  const openReminder = (patient: any, total: number, paid: number, due: number) => {
    const digits = (patient?.mobile || "").replace(/\D/g, "").replace(/^91/, "");
    if (!digits) return;
    window.open(`https://wa.me/91${digits}?text=${encodeURIComponent(buildDueReminder(patient, total, paid, due))}`, "_blank");
  };

  // ── Quick Pay: sirf payment update ──
  const openQuickPay = (bill: any) => {
    const currentPaid = Number((bill as any).amount_paid || 0);
    setQpBill(bill);
    setQpPaid(String(currentPaid));
    setQpMode((bill as any).payment_mode || "Cash");
  };

  const handleQuickPay = async () => {
    if (!qpBill) return;
    setQpSaving(true);
    const total = Number(qpBill.amount || 0);
    const paid = parseFloat(qpPaid) || 0;
    const status = paid <= 0 ? "Pending" : paid >= total ? "Paid" : "Partial";
    try {
      await updateBill.mutateAsync({
        id: qpBill.id,
        amount: total,
        amount_paid: paid,
        status,
        payment_mode: qpMode,
      } as any);
      toast({ title: "✅ Payment Updated", description: `${(qpBill.patients as any)?.name} — ₹${paid} paid` });
      setQpBill(null);
      refetchPending();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setQpSaving(false);
    }
  };

  // ── Full Edit: services bhi change kar sako ──
  const openFullEdit = (bill: any) => {
    const parsed = bill.service.split("|").map((s: string) => {
      const parts = s.trim().split(":");
      return { name: parts[0]?.trim() || "", amount: parts[1]?.trim() || "" };
    });
    setEditBill(bill);
    setEditServices(parsed);
    setEditPaid(String((bill as any).amount_paid || 0));
    setEditMode((bill as any).payment_mode || "Cash");
  };

  const handleFullEdit = async () => {
    if (!editBill) return;
    setEditSaving(true);
    const valid = editServices.filter(s => s.name && s.amount);
    if (!valid.length) {
      toast({ title: "Error", description: "Kam se kam ek service chahiye", variant: "destructive" });
      setEditSaving(false);
      return;
    }
    const total = valid.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    const paid = parseFloat(editPaid) || 0;
    const status = paid <= 0 ? "Pending" : paid >= total ? "Paid" : "Partial";
    const serviceStr = valid.map(s => `${s.name}:${s.amount}`).join("|");
    try {
      await updateBill.mutateAsync({
        id: editBill.id,
        service: serviceStr,
        amount: total,
        amount_paid: paid,
        status,
        payment_mode: editMode,
      } as any);
      toast({ title: "✅ Bill Updated", description: `${(editBill.patients as any)?.name} — Bill update ho gaya` });
      setEditBill(null);
      refetchPending();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const SERVICE_OPTIONS = ["OPD Consultation","X-Ray","Physiotherapy","Procedure","IPD Stay","Plaster","MOT Charge","Medicine","Dressing","Injection","Blood Test","Other"];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{
              width: "58px", height: "58px", borderRadius: "16px",
              background: "linear-gradient(135deg, rgba(13,35,81,0.12), rgba(30,87,176,0.10))",
              border: "2px solid rgba(30,87,176,0.20)",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
            }}>
              <img src={logo} alt="Balaji Ortho Care Center" style={{ height: "48px", width: "48px", objectFit: "contain" }} />
            </div>
            <div>
              <h1 className="module-header">🏥 Dashboard</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Welcome back, Dr. Rathore · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="emergency-btn gap-2 w-fit" onClick={() => navigate("/opd")}>
              <UserPlus className="h-4 w-4" />
              New Patient Admission
            </Button>
            <Button variant="outline" className="gap-2 w-fit" onClick={() => navigate("/daily-cash-book")}>
              <Wallet className="h-4 w-4" />
              Daily Cash Book
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 dash-animate dash-animate-1">
          <StatCard title="Today's Patients" value={todayBills?.length ?? 0} icon={Users} variant="primary" />
          <StatCard title="Appointments" value={stats?.todayAppointments ?? 0} icon={Calendar} variant="secondary" />
          <StatCard title="Pending Payments" value={`₹${pendingTotal.toLocaleString()}`} icon={Receipt} variant="warning" />
          <StatCard title="Today's Revenue" value={`₹${todayTotalAmount.toLocaleString()}`} icon={IndianRupee} variant="success" />
        </div>

        {/* Today's Patients */}
        <Card className="dash-card dash-animate dash-animate-2">
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
          <Card className="border-warning/30 dash-card dash-animate dash-animate-3">
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
                              {/* Quick Pay - sirf payment update */}
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-success"
                                onClick={() => openQuickPay(bill)}
                                title="Quick Pay — sirf payment update karo"
                              >
                                <CheckCircle className="h-3 w-3" />
                              </Button>
                              {/* Full Edit - services + payment dono */}
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-primary"
                                onClick={() => openFullEdit(bill)}
                                title="Full Edit — services aur payment dono badlo"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              {/* WhatsApp Reminder */}
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-success disabled:text-muted-foreground"
                                onClick={() => openReminder(patient, total, paid, due)}
                                title="WhatsApp reminder"
                                disabled={!mobile}
                              >
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

        {/* ── Quick Pay Dialog ── */}
        <Dialog open={!!qpBill} onOpenChange={(o) => { if (!o) setQpBill(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-success" />
                Quick Pay — {(qpBill?.patients as any)?.name}
              </DialogTitle>
            </DialogHeader>
            {qpBill && (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Bill</span>
                    <span className="font-bold">₹{Number(qpBill.amount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pehle se Paid</span>
                    <span className="text-success font-medium">₹{Number((qpBill as any).amount_paid || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 mt-1">
                    <span className="text-muted-foreground font-medium">Baki Due</span>
                    <span className="text-destructive font-bold">
                      ₹{Math.max(Number(qpBill.amount) - Number((qpBill as any).amount_paid || 0), 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Ab kitna paid hua? (Total paid amount)</Label>
                  <Input
                    type="number"
                    value={qpPaid}
                    onChange={e => setQpPaid(e.target.value)}
                    placeholder="₹ amount paid"
                    className="text-lg font-bold"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    💡 Total paid likho — jaise pehle ₹500 tha aur ab ₹200 aur aaya to ₹700 likho
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Payment Mode</Label>
                  <Select value={qpMode} onValueChange={setQpMode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                      <SelectItem value="Online">Online</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Preview new status */}
                {qpPaid && (
                  <div className="text-xs p-2 rounded bg-primary/10 flex justify-between">
                    <span>New Status:</span>
                    <span className="font-bold">
                      {parseFloat(qpPaid) >= Number(qpBill.amount) ? "✅ Paid" :
                       parseFloat(qpPaid) > 0 ? "🟡 Partial" : "🔴 Pending"}
                    </span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button onClick={handleQuickPay} disabled={qpSaving} className="flex-1 gap-2">
                    <CheckCircle className="h-4 w-4" />
                    {qpSaving ? "Saving..." : "Payment Update Karo"}
                  </Button>
                  <Button variant="outline" onClick={() => setQpBill(null)} className="gap-2">
                    <X className="h-4 w-4" /> Cancel
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Full Edit Dialog ── */}
        <Dialog open={!!editBill} onOpenChange={(o) => { if (!o) setEditBill(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-primary" />
                Bill Edit — {(editBill?.patients as any)?.name}
              </DialogTitle>
            </DialogHeader>
            {editBill && (
              <div className="space-y-4">
                {/* Services edit */}
                <div className="space-y-2">
                  <Label>Services</Label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {editServices.map((s, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <Select value={s.name} onValueChange={v => setEditServices(prev => prev.map((x,i) => i===idx ? {...x, name:v} : x))}>
                          <SelectTrigger className="flex-1 h-9"><SelectValue placeholder="Service" /></SelectTrigger>
                          <SelectContent>
                            {SERVICE_OPTIONS.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number" placeholder="₹"
                          className="w-24 h-9"
                          value={s.amount}
                          onChange={e => setEditServices(prev => prev.map((x,i) => i===idx ? {...x, amount:e.target.value} : x))}
                        />
                        {editServices.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                            onClick={() => setEditServices(prev => prev.filter((_,i) => i!==idx))}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => setEditServices(prev => [...prev, {name:"", amount:""}])}>
                    + Add Service
                  </Button>
                </div>

                {/* Total preview */}
                <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm font-medium">Total Amount</span>
                  <span className="text-lg font-bold text-primary">
                    ₹{editServices.reduce((sum, s) => sum + (parseFloat(s.amount)||0), 0).toLocaleString()}
                  </span>
                </div>

                {/* Payment */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Payment Mode</Label>
                    <Select value={editMode} onValueChange={setEditMode}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="UPI">UPI</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="Online">Online</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Amount Paid (₹)</Label>
                    <Input type="number" placeholder="0" className="h-9" value={editPaid} onChange={e => setEditPaid(e.target.value)} />
                  </div>
                </div>

                {/* Due preview */}
                <div className="flex justify-between items-center p-2 rounded-lg border border-dashed">
                  <span className="text-xs font-medium text-muted-foreground">Due Amount</span>
                  <span className={`text-sm font-bold ${(editServices.reduce((sum,s) => sum+(parseFloat(s.amount)||0),0) - (parseFloat(editPaid)||0)) > 0 ? "text-destructive" : "text-success"}`}>
                    ₹{Math.max(editServices.reduce((sum,s) => sum+(parseFloat(s.amount)||0),0) - (parseFloat(editPaid)||0), 0).toLocaleString()}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleFullEdit} disabled={editSaving} className="flex-1 gap-2">
                    <CheckCircle className="h-4 w-4" />
                    {editSaving ? "Saving..." : "💾 Save Changes"}
                  </Button>
                  <Button variant="outline" onClick={() => setEditBill(null)} className="gap-2">
                    <X className="h-4 w-4" /> Cancel
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Ortho Panel */}
        <OrthoPanel />
      </div>
    </DashboardLayout>
  );
}
