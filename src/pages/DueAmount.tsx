import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  IndianRupee, Search, Phone, MessageCircle, MessageSquare,
  Pencil, CalendarDays, CheckCircle2,
} from "lucide-react";
import { useBills, useUpdateBill } from "@/hooks/useDatabase";
import { toast } from "@/hooks/use-toast";
import { sendSMS } from "@/services/smsService";

// ── WhatsApp helper (mobile-friendly — wa.me khol deta hai, Electron me bhi chalta hai) ──
function openWhatsAppDue(mobile: string, message: string) {
  const cleanMobile = (mobile || "").replace(/\D/g, "");
  if (!cleanMobile) return;
  const num = cleanMobile.startsWith("91") ? cleanMobile : `91${cleanMobile}`;
  const url = `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
  if ((window as any).ipcRenderer) {
    (window as any).ipcRenderer.send("open-whatsapp", { url });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function getDueMessage(patientName: string, total: number, paid: number, due: number) {
  return `नमस्ते ${patientName} जी 🙏\n\nBalaji Ortho Care Center की ओर से सूचना।\n\n💰 कुल राशि: ₹${total}\n✅ जमा: ₹${paid}\n❗ बकाया राशि: ₹${due}\n\nकृपया ₹${due} जल्द जमा करवाएं।\n\n📞 +91 8005707783\nधन्यवाद 🙏`;
}

export default function DueAmount() {
  const { data: bills = [], isLoading } = useBills();
  const updateBill = useUpdateBill();

  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editPaid, setEditPaid] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);

  // ── Sirf due wale bills, date-wise (naye pehle) ──
  const dueBills = useMemo(() => {
    return bills
      .map((bill: any) => {
        const total = Number(bill.amount) || 0;
        const paid = Number(bill.amount_paid) || 0;
        const due = Math.max(total - paid, 0);
        return { ...bill, _total: total, _paid: paid, _due: due };
      })
      .filter((b: any) => b._due > 0)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [bills]);

  const filtered = dueBills.filter((b: any) => {
    const name = b.patients?.name?.toLowerCase() || "";
    const mobile = b.patients?.mobile || "";
    const q = search.toLowerCase();
    return name.includes(q) || mobile.includes(search.replace(/\D/g, ""));
  });

  // ── Date-wise grouping (bill ki date ke hisaab se) ──
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const b of filtered) {
      const dateKey = b.date || b.created_at?.slice(0, 10) || "Unknown";
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(b);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const totalDue = filtered.reduce((sum: number, b: any) => sum + b._due, 0);

  const formatDate = (d: string) => {
    if (!d || d === "Unknown") return "Date N/A";
    try {
      return new Date(d).toLocaleDateString("hi-IN", { day: "numeric", month: "long", year: "numeric" });
    } catch {
      return d;
    }
  };

  const openEdit = (bill: any) => {
    setEditTarget(bill);
    setEditPaid(String(bill._paid));
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    const paidNum = Number(editPaid);
    if (Number.isNaN(paidNum) || paidNum < 0) {
      toast({ title: "Sahi amount daalo", variant: "destructive" });
      return;
    }
    if (paidNum > editTarget._total) {
      toast({ title: "Paid amount, total se zyada nahi ho sakta", variant: "destructive" });
      return;
    }
    try {
      await updateBill.mutateAsync({
        id: editTarget.id,
        amount: editTarget._total,
        amount_paid: paidNum,
        status: paidNum >= editTarget._total ? "Paid" : "Partial",
      });
      toast({ title: "Due update ho gaya ✓" });
      setEditTarget(null);
    } catch {
      toast({ title: "Update fail hua", variant: "destructive" });
    }
  };

  // Pura due ek click me clear karne ke liye
  const handleMarkFullyPaid = async (bill: any) => {
    try {
      await updateBill.mutateAsync({
        id: bill.id,
        amount: bill._total,
        amount_paid: bill._total,
        status: "Paid",
      });
      toast({ title: "Due clear ho gaya ✓" });
    } catch {
      toast({ title: "Update fail hua", variant: "destructive" });
    }
  };

  const handleSendSMS = async (bill: any) => {
    const mobile = bill.patients?.mobile;
    if (!mobile) {
      toast({ title: "Mobile number nahi hai", variant: "destructive" });
      return;
    }
    setSendingId(bill.id + "_sms");
    const msg = getDueMessage(bill.patients?.name || "Patient", bill._total, bill._paid, bill._due);
    try {
      await sendSMS(mobile, msg, bill.patients?.name || "", "due_reminder");
      toast({ title: "SMS bhej diya ✓" });
    } catch {
      toast({ title: "SMS bhejne me dikkat hui", variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const handleSendWhatsApp = (bill: any) => {
    const mobile = bill.patients?.mobile;
    if (!mobile) {
      toast({ title: "Mobile number nahi hai", variant: "destructive" });
      return;
    }
    const msg = getDueMessage(bill.patients?.name || "Patient", bill._total, bill._paid, bill._due);
    openWhatsAppDue(mobile, msg);
  };

  const handleCall = (mobile: string) => {
    if (!mobile) {
      toast({ title: "Mobile number nahi hai", variant: "destructive" });
      return;
    }
    window.location.href = `tel:${mobile}`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="module-header flex items-center gap-2">
              <IndianRupee className="h-6 w-6" /> Due Amount
            </h1>
            <p className="text-sm text-muted-foreground">
              Sabhi patients jinke paise baaki hain — date-wise, pay/edit/reminder ek hi jagah
            </p>
          </div>
          <Card className="px-4 py-2">
            <div className="text-xs text-muted-foreground">Total Due</div>
            <div className="text-xl font-bold text-destructive">₹{totalDue.toLocaleString()}</div>
          </Card>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Naam ya mobile se search karo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

        {!isLoading && grouped.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              🎉 Koi due baaki nahi hai!
            </CardContent>
          </Card>
        )}

        {grouped.map(([dateKey, billsOnDate]) => (
          <div key={dateKey} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground sticky top-0 bg-background/95 backdrop-blur py-1">
              <CalendarDays className="h-4 w-4" />
              {formatDate(dateKey)}
              <Badge variant="outline" className="ml-1">{billsOnDate.length} patient</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {billsOnDate.map((bill: any) => (
                <Card key={bill.id} className="border-l-4 border-l-destructive">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">{bill.patients?.name || "Unknown"}</div>
                        <div className="text-xs text-muted-foreground">
                          {bill.patients?.mobile || "No mobile"}
                        </div>
                      </div>
                      <Badge variant="destructive">₹{bill._due.toLocaleString()} due</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Total: </span>
                        <span className="font-medium">₹{bill._total.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Paid: </span>
                        <span className="font-medium text-success">₹{bill._paid.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(bill)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit / Pay
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-success border-success/40"
                        onClick={() => handleMarkFullyPaid(bill)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Pura Paid
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-600"
                        disabled={sendingId === bill.id + "_sms"}
                        onClick={() => handleSendSMS(bill)}
                      >
                        <MessageSquare className="h-3.5 w-3.5 mr-1" />
                        {sendingId === bill.id + "_sms" ? "Bhej rahe..." : "SMS"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-green-600"
                        onClick={() => handleSendWhatsApp(bill)}
                      >
                        <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-orange-600"
                        onClick={() => handleCall(bill.patients?.mobile)}
                      >
                        <Phone className="h-3.5 w-3.5 mr-1" /> Call
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Edit / Pay Due Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Due Update Karo — {editTarget?.patients?.name}</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Total Amount</span>
                  <div className="font-semibold">₹{editTarget._total.toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Current Due</span>
                  <div className="font-semibold text-destructive">₹{editTarget._due.toLocaleString()}</div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Naya Paid Amount (₹)</Label>
                <Input
                  type="number"
                  value={editPaid}
                  onChange={(e) => setEditPaid(e.target.value)}
                  placeholder="Total jamaa kiya hua amount"
                />
                <p className="text-xs text-muted-foreground">
                  Naya due hoga: ₹
                  {Math.max(editTarget._total - (Number(editPaid) || 0), 0).toLocaleString()}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateBill.isPending}>
              {updateBill.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
