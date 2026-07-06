import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Wallet, Banknote, Smartphone, Landmark, Home, Receipt as ReceiptIcon,
  CalendarDays, Trash2, Printer, PiggyBank,
} from "lucide-react";
import { useCashBookEntries, useAddCashBookEntry, useDeleteCashBookEntry } from "@/hooks/useDatabase";
import { toast } from "@/hooks/use-toast";

const toLocalDateInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const fmt = (n: number) => `₹${(n || 0).toLocaleString("en-IN")}`;

const TYPE_LABEL: Record<string, string> = {
  opening: "Opening Balance",
  cash_in: "Cash Aaya",
  upi_in: "UPI Aaya",
  bank_deposit: "Bank Jama",
  home_given: "Ghar Diya",
  expense: "Kharcha",
};

const TYPE_COLOR: Record<string, string> = {
  opening: "bg-slate-100 text-slate-700",
  cash_in: "bg-green-100 text-green-700",
  upi_in: "bg-blue-100 text-blue-700",
  bank_deposit: "bg-indigo-100 text-indigo-700",
  home_given: "bg-amber-100 text-amber-700",
  expense: "bg-red-100 text-red-700",
};

function printCashBook(dateLabel: string, rows: any[], summary: Record<string, number>) {
  const win = window.open("", "_blank");
  if (!win) return;

  const tableRows = rows
    .map((r) => `<tr>
      <td>${TYPE_LABEL[r.entry_type] || r.entry_type}</td>
      <td>${r.party_name || r.bank_name || "—"}</td>
      <td>${r.note || ""}</td>
      <td class="right">₹${Number(r.amount || 0).toLocaleString("en-IN")}</td>
    </tr>`)
    .join("");

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Daily Cash Book</title>
  <style>
    @page{size:A4;margin:14mm}
    body{font-family:Arial,sans-serif;color:#0f172a;padding:0}
    .header{border-bottom:3px solid #0891b2;padding-bottom:10px;margin-bottom:14px}
    .clinic{font-size:22px;font-weight:800;color:#1e3a5f}
    .muted{color:#64748b;font-size:12px}
    h2{margin:14px 0 8px;color:#1e3a5f}
    .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}
    .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center}
    .box .label{font-size:11px;color:#64748b}
    .box .value{font-size:16px;font-weight:800}
    table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
    th{text-align:left;border-bottom:2px solid #cbd5e1;padding:6px;font-size:12px;color:#475569}
    td{padding:6px;border-bottom:1px solid #e2e8f0}
    .right{text-align:right}
    .closing{font-size:20px;font-weight:800;color:#0e7c4a;text-align:center;margin-top:16px;padding:12px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0}
    @media print{button{display:none}}
  </style></head><body>
  <div class="header">
    <div class="clinic">Balaji Ortho Care Center</div>
    <div class="muted">Dr. S. S. Rathore (DMRT | BPT) · Opp Govt Hospital, Bay Pass Road, Khinwara, Raj. – 306502</div>
    <div class="muted">Phone: +91 8005707783</div>
  </div>
  <h2>Daily Cash Book — ${dateLabel}</h2>
  <div class="summary">
    <div class="box"><div class="label">Opening Balance</div><div class="value">${fmt(summary.opening)}</div></div>
    <div class="box"><div class="label">Cash Aaya</div><div class="value">${fmt(summary.cash_in)}</div></div>
    <div class="box"><div class="label">UPI Aaya</div><div class="value">${fmt(summary.upi_in)}</div></div>
    <div class="box"><div class="label">Bank Jama</div><div class="value">${fmt(summary.bank_deposit)}</div></div>
    <div class="box"><div class="label">Ghar Diya</div><div class="value">${fmt(summary.home_given)}</div></div>
    <div class="box"><div class="label">Kharcha</div><div class="value">${fmt(summary.expense)}</div></div>
  </div>
  <table>
    <thead><tr><th>Type</th><th>Naam / Account</th><th>Note</th><th class="right">Amount</th></tr></thead>
    <tbody>${tableRows || `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:20px">Koi entry nahi hai</td></tr>`}</tbody>
  </table>
  <div class="closing">Center Par Abhi Cash: ${fmt(summary.closing)}</div>
  <button onclick="window.print()" style="margin-top:16px;padding:8px 16px">Print</button>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`);
  win.document.close();
}

export default function DailyCashBook() {
  const { data: allEntries = [], isLoading } = useCashBookEntries();
  const addEntry = useAddCashBookEntry();
  const deleteEntry = useDeleteCashBookEntry();

  const [selectedDate, setSelectedDate] = useState(toLocalDateInput(new Date()));

  // ── Form state per section ──
  const [incomeForm, setIncomeForm] = useState({ mode: "cash_in", amount: "", party_name: "", note: "" });
  const [bankForm, setBankForm] = useState({ amount: "", bank_name: "", party_name: "", note: "" });
  const [homeForm, setHomeForm] = useState({ amount: "", party_name: "", note: "" });
  const [expenseForm, setExpenseForm] = useState({ amount: "", party_name: "", note: "" });
  const [openingInput, setOpeningInput] = useState("");

  const entriesForDate = useMemo(
    () => allEntries.filter((e: any) => e.entry_date === selectedDate),
    [allEntries, selectedDate]
  );

  // Opening balance: agar aaj ke liye manually set kiya gaya hai to wahi,
  // warna pichhle available din ki closing balance uthao (carry-forward).
  const openingBalance = useMemo(() => {
    const todaysOpening = entriesForDate
      .filter((e: any) => e.entry_type === "opening")
      .sort((a: any, b: any) => (a.created_at > b.created_at ? -1 : 1))[0];
    if (todaysOpening) return Number(todaysOpening.amount) || 0;

    // Carry-forward: sabse recent pichle din ki closing nikalo
    const priorDates = Array.from(new Set(allEntries.map((e: any) => e.entry_date)))
      .filter((d: any) => d < selectedDate)
      .sort();
    if (priorDates.length === 0) return 0;
    const lastDate = priorDates[priorDates.length - 1];
    const priorEntries = allEntries.filter((e: any) => e.entry_date === lastDate);
    return computeClosing(priorEntries);
  }, [allEntries, entriesForDate, selectedDate]);

  function computeClosing(entries: any[]) {
    const sums = sumByType(entries);
    const opening = entries.some((e) => e.entry_type === "opening")
      ? sums.opening
      : 0; // avoid double counting recursive carry-forward beyond one level
    return opening + sums.cash_in - sums.bank_deposit - sums.home_given - sums.expense;
  }

  function sumByType(entries: any[]) {
    const sums: Record<string, number> = { opening: 0, cash_in: 0, upi_in: 0, bank_deposit: 0, home_given: 0, expense: 0 };
    for (const e of entries) {
      sums[e.entry_type] = (sums[e.entry_type] || 0) + Number(e.amount || 0);
    }
    return sums;
  }

  const todaySums = useMemo(() => sumByType(entriesForDate), [entriesForDate]);

  const totalIn = openingBalance + todaySums.cash_in;
  const totalOut = todaySums.bank_deposit + todaySums.home_given + todaySums.expense;
  const closingCash = totalIn - totalOut;
  const totalCollection = todaySums.cash_in + todaySums.upi_in;

  const isToday = selectedDate === toLocalDateInput(new Date());

  const handleAdd = async (entry_type: string, amount: string, party_name: string, bank_name: string, note: string, reset: () => void) => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Amount daaliye", description: "Sahi amount daalna zaroori hai", variant: "destructive" });
      return;
    }
    try {
      await addEntry.mutateAsync({
        entry_date: selectedDate,
        entry_type,
        amount: amt,
        party_name: party_name || null,
        bank_name: bank_name || null,
        note: note || null,
      });
      toast({ title: "✅ Entry Add Ho Gayi", description: `${TYPE_LABEL[entry_type]} — ${fmt(amt)}` });
      reset();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleSetOpening = async () => {
    const amt = Number(openingInput);
    if (isNaN(amt) || openingInput === "") {
      toast({ title: "Amount daaliye", variant: "destructive" });
      return;
    }
    try {
      await addEntry.mutateAsync({ entry_date: selectedDate, entry_type: "opening", amount: amt, note: "Manually set" });
      toast({ title: "✅ Opening Balance Set", description: fmt(amt) });
      setOpeningInput("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Ye entry delete karna chahte ho?")) return;
    try {
      await deleteEntry.mutateAsync(id);
      toast({ title: "Entry delete ho gayi" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const dateLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "2-digit", month: "short", year: "numeric",
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 page-enter">
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #0d2351 0%, #1e57b0 55%, #0e7c4a 100%)",
          borderRadius: "18px", padding: "22px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px",
          boxShadow: "0 8px 32px rgba(13,35,81,0.28)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{
              width: "54px", height: "54px", borderRadius: "14px",
              background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "28px", flexShrink: 0,
            }}>💵</div>
            <div>
              <h1 style={{ fontSize: "22px", fontWeight: 800, color: "white", margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Daily Cash Book</h1>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)", margin: 0 }}>Rozana cash, UPI, bank aur kharcha ka hisaab</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <CalendarDays className="h-4 w-4 text-white/80" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ background: "rgba(255,255,255,0.9)" }}
              className="w-[160px]"
            />
            {!isToday && (
              <Button size="sm" variant="secondary" onClick={() => setSelectedDate(toLocalDateInput(new Date()))}>Aaj</Button>
            )}
            <Button size="sm" variant="secondary" className="gap-1" onClick={() => printCashBook(dateLabel, entriesForDate, { ...todaySums, opening: openingBalance, closing: closingCash })}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryBox label="Opening Balance" value={fmt(openingBalance)} icon={PiggyBank} color="#3a4a6b" />
          <SummaryBox label="Cash Aaya" value={fmt(todaySums.cash_in)} icon={Banknote} color="#1a6b3a" />
          <SummaryBox label="UPI Aaya" value={fmt(todaySums.upi_in)} icon={Smartphone} color="#1877c4" />
          <SummaryBox label="Total Collection" value={fmt(totalCollection)} icon={Wallet} color="#1a3a6b" />
          <SummaryBox label="Bank Jama" value={fmt(todaySums.bank_deposit)} icon={Landmark} color="#5b21b6" />
          <SummaryBox label="Ghar Diya" value={fmt(todaySums.home_given)} icon={Home} color="#b87c1a" />
          <SummaryBox label="Kharcha" value={fmt(todaySums.expense)} icon={ReceiptIcon} color="#7b1a1a" />
          <SummaryBox label="Center Par Abhi Cash" value={fmt(closingCash)} icon={Wallet} color="#0e7c4a" highlight />
        </div>

        {/* Opening balance editor (only really needed if carry-forward is wrong) */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs text-muted-foreground">Opening Balance ({dateLabel}) — agar carry-forward galat hai to yahan set karein</Label>
                <Input type="number" placeholder={`Abhi: ${fmt(openingBalance)}`} value={openingInput} onChange={(e) => setOpeningInput(e.target.value)} />
              </div>
              <Button onClick={handleSetOpening} disabled={addEntry.isPending}>Set Karein</Button>
            </div>
          </CardContent>
        </Card>

        {/* Entry forms */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg">Nayi Entry Add Karein</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="income" className="space-y-4">
              <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
                <TabsTrigger value="income">Cash / UPI Aaya</TabsTrigger>
                <TabsTrigger value="bank">Bank Jama</TabsTrigger>
                <TabsTrigger value="home">Ghar Diya</TabsTrigger>
                <TabsTrigger value="expense">Kharcha</TabsTrigger>
              </TabsList>

              {/* Income */}
              <TabsContent value="income" className="space-y-4">
                <div className="flex gap-2">
                  <Button type="button" variant={incomeForm.mode === "cash_in" ? "default" : "outline"} size="sm" onClick={() => setIncomeForm((p) => ({ ...p, mode: "cash_in" }))} className="gap-1">
                    <Banknote className="h-4 w-4" /> Cash
                  </Button>
                  <Button type="button" variant={incomeForm.mode === "upi_in" ? "default" : "outline"} size="sm" onClick={() => setIncomeForm((p) => ({ ...p, mode: "upi_in" }))} className="gap-1">
                    <Smartphone className="h-4 w-4" /> UPI
                  </Button>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Amount *</Label>
                    <Input type="number" placeholder="₹ Amount" value={incomeForm.amount} onChange={(e) => setIncomeForm((p) => ({ ...p, amount: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Patient / Naam (optional)</Label>
                    <Input placeholder="Kisse aaya" value={incomeForm.party_name} onChange={(e) => setIncomeForm((p) => ({ ...p, party_name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Note (optional)</Label>
                    <Input placeholder="Note" value={incomeForm.note} onChange={(e) => setIncomeForm((p) => ({ ...p, note: e.target.value }))} />
                  </div>
                </div>
                <Button
                  onClick={() => handleAdd(incomeForm.mode, incomeForm.amount, incomeForm.party_name, "", incomeForm.note, () => setIncomeForm({ mode: incomeForm.mode, amount: "", party_name: "", note: "" }))}
                  disabled={addEntry.isPending}
                >
                  Add Karein
                </Button>
              </TabsContent>

              {/* Bank deposit */}
              <TabsContent value="bank" className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Amount *</Label>
                    <Input type="number" placeholder="₹ Amount" value={bankForm.amount} onChange={(e) => setBankForm((p) => ({ ...p, amount: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Bank / Account</Label>
                    <Input placeholder="Konsa bank / account" value={bankForm.bank_name} onChange={(e) => setBankForm((p) => ({ ...p, bank_name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Account Holder Naam</Label>
                    <Input placeholder="Account holder ka naam" value={bankForm.party_name} onChange={(e) => setBankForm((p) => ({ ...p, party_name: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Note (optional)</Label>
                  <Input placeholder="Note" value={bankForm.note} onChange={(e) => setBankForm((p) => ({ ...p, note: e.target.value }))} />
                </div>
                <Button
                  onClick={() => handleAdd("bank_deposit", bankForm.amount, bankForm.party_name, bankForm.bank_name, bankForm.note, () => setBankForm({ amount: "", bank_name: "", party_name: "", note: "" }))}
                  disabled={addEntry.isPending}
                >
                  Add Karein
                </Button>
              </TabsContent>

              {/* Home given */}
              <TabsContent value="home" className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Amount *</Label>
                    <Input type="number" placeholder="₹ Amount" value={homeForm.amount} onChange={(e) => setHomeForm((p) => ({ ...p, amount: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Kisko Diya *</Label>
                    <Input placeholder="Naam" value={homeForm.party_name} onChange={(e) => setHomeForm((p) => ({ ...p, party_name: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Note (optional)</Label>
                  <Input placeholder="Note" value={homeForm.note} onChange={(e) => setHomeForm((p) => ({ ...p, note: e.target.value }))} />
                </div>
                <Button
                  onClick={() => handleAdd("home_given", homeForm.amount, homeForm.party_name, "", homeForm.note, () => setHomeForm({ amount: "", party_name: "", note: "" }))}
                  disabled={addEntry.isPending}
                >
                  Add Karein
                </Button>
              </TabsContent>

              {/* Expense */}
              <TabsContent value="expense" className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Amount *</Label>
                    <Input type="number" placeholder="₹ Amount" value={expenseForm.amount} onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Kisko Diya / Kis Liye *</Label>
                    <Input placeholder="Naam ya kharche ka kaam" value={expenseForm.party_name} onChange={(e) => setExpenseForm((p) => ({ ...p, party_name: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Note (optional)</Label>
                  <Input placeholder="Note" value={expenseForm.note} onChange={(e) => setExpenseForm((p) => ({ ...p, note: e.target.value }))} />
                </div>
                <Button
                  onClick={() => handleAdd("expense", expenseForm.amount, expenseForm.party_name, "", expenseForm.note, () => setExpenseForm({ amount: "", party_name: "", note: "" }))}
                  disabled={addEntry.isPending}
                >
                  Add Karein
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Entries list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg">{dateLabel} Ki Entries</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Load ho raha hai...</p>
            ) : entriesForDate.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aaj koi entry nahi hai. Upar se add karein.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Naam / Account</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entriesForDate
                      .slice()
                      .sort((a: any, b: any) => (a.created_at > b.created_at ? -1 : 1))
                      .map((entry: any) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <Badge className={TYPE_COLOR[entry.entry_type] || ""} variant="outline">
                              {TYPE_LABEL[entry.entry_type] || entry.entry_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {entry.bank_name ? `${entry.bank_name}${entry.party_name ? " — " + entry.party_name : ""}` : (entry.party_name || "—")}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{entry.note || "—"}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(Number(entry.amount))}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(entry.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function SummaryBox({ label, value, icon: Icon, color, highlight }: { label: string; value: string; icon: any; color: string; highlight?: boolean }) {
  return (
    <div
      style={{
        background: highlight ? "linear-gradient(135deg, #0e7c4a 0%, #1eb85c 100%)" : "white",
        border: highlight ? "none" : "1px solid #e2e8f0",
        borderRadius: "14px",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        boxShadow: highlight ? "0 6px 20px rgba(14,124,74,0.28)" : "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{
        width: "38px", height: "38px", borderRadius: "10px",
        background: highlight ? "rgba(255,255,255,0.22)" : `${color}18`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon style={{ width: "20px", height: "20px", color: highlight ? "white" : color }} />
      </div>
      <div>
        <p style={{ fontSize: "11px", color: highlight ? "rgba(255,255,255,0.85)" : "#64748b", marginBottom: "2px" }}>{label}</p>
        <p style={{ fontSize: "17px", fontWeight: 800, color: highlight ? "white" : "#0f172a" }}>{value}</p>
      </div>
    </div>
  );
}
