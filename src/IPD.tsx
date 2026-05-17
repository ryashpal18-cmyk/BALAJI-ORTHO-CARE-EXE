import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Lock, Pill, Printer, Download, FileDown, Search } from "lucide-react";
import * as XLSX from "xlsx";

const ADMIN_PASS = "Aarya@2026";
const SESSION_KEY = "medCommissionUnlocked";

interface Entry {
  id: string;
  invoice_no: string;
  patient_name: string;
  date: string;
  total_amount: number;
  commission: number;
  invoice_medicine_mapping: { medicine_name: string; rate: number }[];
}

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export default function MedicineCommission() {
  const [unlocked, setUnlocked] = useState(false);
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [searchPatient, setSearchPatient] = useState("");
  const [searchMed, setSearchMed] = useState("");

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "1") setUnlocked(true);
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    supabase
      .from("medicine_entries")
      .select("*, invoice_medicine_mapping(medicine_name, rate)")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
        setEntries((data as any) || []);
      });
  }, [unlocked, from, to]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const pOk = !searchPatient || e.patient_name.toLowerCase().includes(searchPatient.toLowerCase());
      const mOk =
        !searchMed ||
        e.invoice_medicine_mapping?.some((m) =>
          m.medicine_name.toLowerCase().includes(searchMed.toLowerCase()),
        );
      return pOk && mOk;
    });
  }, [entries, searchPatient, searchMed]);

  const totalAmount = filtered.reduce((s, e) => s + Number(e.total_amount), 0);
  const totalCommission = filtered.reduce((s, e) => s + Number(e.commission), 0);

  const medicineWise = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    filtered.forEach((e) =>
      e.invoice_medicine_mapping?.forEach((m) => {
        if (!map[m.medicine_name]) map[m.medicine_name] = { count: 0, total: 0 };
        map[m.medicine_name].count += 1;
        map[m.medicine_name].total += Number(m.rate);
      }),
    );
    return Object.entries(map).map(([name, v]) => ({
      name,
      count: v.count,
      total: v.total,
      commission: v.total * 0.3,
    }));
  }, [filtered]);

  const handleUnlock = () => {
    if (pass === ADMIN_PASS) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setUnlocked(true);
      setErr("");
    } else {
      setErr("Invalid Password");
    }
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        filtered.map((e) => ({
          Patient: e.patient_name,
          Invoice: e.invoice_no,
          Date: e.date,
          Medicines: e.invoice_medicine_mapping?.map((m) => m.medicine_name).join(", "),
          Total: e.total_amount,
          Commission: e.commission,
        })),
      ),
      "Patient Wise",
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(medicineWise), "Medicine Wise");
    XLSX.writeFile(wb, `medicine-commission-${from}_to_${to}.xlsx`);
  };

  const handlePrint = () => window.print();

  if (!unlocked) {
    return (
      <DashboardLayout>
        <Dialog open>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" /> Admin Access Required
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                autoFocus
              />
              {err && <p className="text-sm text-destructive">{err}</p>}
            </div>
            <DialogFooter>
              <Button onClick={handleUnlock}>Unlock</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 print:p-0">
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Pill className="h-6 w-6 text-primary" /> Medicine Commission
            </h1>
            <p className="text-sm text-muted-foreground">Admin-only analytics & reports</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-2" />Print</Button>
            <Button variant="outline" onClick={exportExcel}><FileDown className="h-4 w-4 mr-2" />Excel</Button>
          </div>
        </div>

        <Card className="print:hidden">
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <Label>Search Patient</Label>
              <div className="relative"><Search className="h-4 w-4 absolute left-2 top-3 text-muted-foreground" />
                <Input className="pl-8" value={searchPatient} onChange={(e) => setSearchPatient(e.target.value)} placeholder="Patient name" />
              </div>
            </div>
            <div>
              <Label>Search Medicine</Label>
              <div className="relative"><Search className="h-4 w-4 absolute left-2 top-3 text-muted-foreground" />
                <Input className="pl-8" value={searchMed} onChange={(e) => setSearchMed(e.target.value)} placeholder="Medicine name" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Entries</div><div className="text-2xl font-bold">{filtered.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Amount</div><div className="text-2xl font-bold">₹{totalAmount.toFixed(2)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">30% Commission</div><div className="text-2xl font-bold text-success">₹{totalCommission.toFixed(2)}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-lg">Patient Wise Report</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr><th className="p-2 text-left">Patient</th><th className="p-2 text-left">Invoice</th><th className="p-2 text-left">Medicines</th><th className="p-2 text-left">Date</th><th className="p-2 text-right">Total</th><th className="p-2 text-right">Commission</th></tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="p-2">{e.patient_name}</td>
                    <td className="p-2">{e.invoice_no}</td>
                    <td className="p-2">{e.invoice_medicine_mapping?.map((m) => m.medicine_name).join(", ")}</td>
                    <td className="p-2">{e.date}</td>
                    <td className="p-2 text-right">₹{Number(e.total_amount).toFixed(2)}</td>
                    <td className="p-2 text-right text-success">₹{Number(e.commission).toFixed(2)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No entries</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Medicine Wise Report</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr><th className="p-2 text-left">Medicine</th><th className="p-2 text-right">Count</th><th className="p-2 text-right">Total Amount</th><th className="p-2 text-right">Commission</th></tr>
              </thead>
              <tbody>
                {medicineWise.map((m) => (
                  <tr key={m.name} className="border-t">
                    <td className="p-2">{m.name}</td>
                    <td className="p-2 text-right">{m.count}</td>
                    <td className="p-2 text-right">₹{m.total.toFixed(2)}</td>
                    <td className="p-2 text-right text-success">₹{m.commission.toFixed(2)}</td>
                  </tr>
                ))}
                {medicineWise.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No data</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
