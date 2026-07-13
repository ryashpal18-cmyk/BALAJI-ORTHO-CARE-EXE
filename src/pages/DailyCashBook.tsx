import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Wallet, Banknote, Smartphone, Landmark, Home, Receipt as ReceiptIcon,
  CalendarDays, Trash2, Printer, PiggyBank, CreditCard, Lock, Unlock,
  CheckCircle2, AlertTriangle, ShieldAlert, RotateCcw, FileSpreadsheet,
  ListChecks, TrendingUp, BarChart3,
} from "lucide-react";
import { useCashBookEntries, useAddCashBookEntry, useDeleteCashBookEntry, useBills } from "@/hooks/useDatabase";
import { supabase } from "@/integrations/supabase/client";
import { offlineFetch, offlineInsert, offlineUpdate } from "@/lib/offlineQuery";
import { logAudit } from "@/hooks/useAuditLog";
import { getCurrentRole } from "@/lib/appConfig";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

const toLocalDateInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const fmt = (n: number) => `₹${(n || 0).toLocaleString("en-IN")}`;
const currentUserName = () => localStorage.getItem("userName") || "Unknown";

// Legacy manual entry types (kept exactly as before — never removed, so old
// history keeps displaying correctly). Going forward only expense /
// bank_deposit / home_given / opening are created manually; cash_in / upi_in
// stay here purely so OLD rows already saved before this upgrade still show up.
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

function sumByType(entries: any[]) {
  const sums: Record<string, number> = { opening: 0, cash_in: 0, upi_in: 0, bank_deposit: 0, home_given: 0, expense: 0 };
  for (const e of entries) {
    sums[e.entry_type] = (sums[e.entry_type] || 0) + Number(e.amount || 0);
  }
  return sums;
}

function billDate(b: any) {
  return (b?.created_at || "").slice(0, 10);
}

// ── Printable Daily Cash Book (extended with auto-collection + verification) ──
function printCashBook(dateLabel: string, rows: any[], bills: any[], summary: Record<string, number>, dayRecord: any) {
  const win = window.open("", "_blank");
  if (!win) return;

  const entryRows = rows
    .map((r) => `<tr>
      <td>${TYPE_LABEL[r.entry_type] || r.entry_type}</td>
      <td>${r.party_name || r.bank_name || "—"}</td>
      <td>${r.note || ""}</td>
      <td class="right">₹${Number(r.amount || 0).toLocaleString("en-IN")}</td>
    </tr>`)
    .join("");

  const billRows = bills
    .map((b) => `<tr>
      <td>Bill — ${b.patients?.name || "—"}</td>
      <td>${b.payment_mode || "—"}</td>
      <td></td>
      <td class="right">₹${Number(b.amount_paid || 0).toLocaleString("en-IN")}</td>
    </tr>`)
    .join("");

  const statusLabel = dayRecord?.status === "closed"
    ? `Closed by ${dayRecord.closed_by || "—"} @ ${dayRecord.closed_at ? new Date(dayRecord.closed_at).toLocaleString("en-IN") : "—"}`
    : "Open";

  const diffLabel = dayRecord?.difference != null
    ? (Math.abs(dayRecord.difference) < 0.01 ? "Matched" : dayRecord.difference > 0 ? `Excess ₹${Math.abs(dayRecord.difference).toLocaleString("en-IN")}` : `Short ₹${Math.abs(dayRecord.difference).toLocaleString("en-IN")}`)
    : "—";

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Daily Cash Book</title>
  <style>
    @page{size:A4;margin:14mm}
    body{font-family:Arial,sans-serif;color:#0f172a;padding:0}
    .header{border-bottom:3px solid #0891b2;padding-bottom:10px;margin-bottom:14px}
    .clinic{font-size:22px;font-weight:800;color:#1e3a5f}
    .muted{color:#64748b;font-size:12px}
    h2{margin:14px 0 8px;color:#1e3a5f}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}
    .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center}
    .box .label{font-size:11px;color:#64748b}
    .box .value{font-size:15px;font-weight:800}
    table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
    th{text-align:left;border-bottom:2px solid #cbd5e1;padding:6px;font-size:12px;color:#475569}
    td{padding:6px;border-bottom:1px solid #e2e8f0}
    .right{text-align:right}
    .closing{font-size:20px;font-weight:800;color:#0e7c4a;text-align:center;margin-top:16px;padding:12px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0}
    .verify{margin-top:10px;padding:10px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:13px}
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
    <div class="box"><div class="label">Cash Collection</div><div class="value">${fmt(summary.cashCollection)}</div></div>
    <div class="box"><div class="label">UPI Collection</div><div class="value">${fmt(summary.upiCollection)}</div></div>
    <div class="box"><div class="label">Card Collection</div><div class="value">${fmt(summary.cardCollection)}</div></div>
    <div class="box"><div class="label">Bank Transfer</div><div class="value">${fmt(summary.bankCollection)}</div></div>
    <div class="box"><div class="label">Total Collection</div><div class="value">${fmt(summary.totalCollection)}</div></div>
    <div class="box"><div class="label">Expenses</div><div class="value">${fmt(summary.expense)}</div></div>
    <div class="box"><div class="label">Bank Deposit</div><div class="value">${fmt(summary.bankDepositOut)}</div></div>
    <div class="box"><div class="label">Cash Taken Home</div><div class="value">${fmt(summary.homeGiven)}</div></div>
  </div>
  <table>
    <thead><tr><th>Type</th><th>Naam / Mode</th><th>Note</th><th class="right">Amount</th></tr></thead>
    <tbody>${billRows}${entryRows || (billRows ? "" : `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:20px">Koi entry nahi hai</td></tr>`)}</tbody>
  </table>
  <div class="closing">Calculated Closing Cash: ${fmt(summary.closing)}</div>
  <div class="verify">
    <b>Physical Cash Verification</b> — Physical Count: ${dayRecord?.physical_cash != null ? fmt(dayRecord.physical_cash) : "—"} |
    Difference: ${diffLabel} | Remarks: ${dayRecord?.remarks || "—"}<br/>
    <b>Day Status:</b> ${statusLabel}
  </div>
  <button onclick="window.print()" style="margin-top:16px;padding:8px 16px">Print</button>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`);
  win.document.close();
}

function printMonthlyCashBook(monthLabel: string, rows: { date: string; opening: number; totalCollection: number; expense: number; bankDepositOut: number; homeGiven: number; closing: number; status: string }[], totals: Record<string, number>) {
  const win = window.open("", "_blank");
  if (!win) return;
  const tableRows = rows.map((r) => `<tr>
    <td>${new Date(r.date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
    <td class="right">₹${r.opening.toLocaleString("en-IN")}</td>
    <td class="right">₹${r.totalCollection.toLocaleString("en-IN")}</td>
    <td class="right">₹${r.expense.toLocaleString("en-IN")}</td>
    <td class="right">₹${r.bankDepositOut.toLocaleString("en-IN")}</td>
    <td class="right">₹${r.homeGiven.toLocaleString("en-IN")}</td>
    <td class="right">₹${r.closing.toLocaleString("en-IN")}</td>
    <td>${r.status}</td>
  </tr>`).join("");

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Monthly Cash Book</title>
  <style>
    @page{size:A4;margin:12mm}
    body{font-family:Arial,sans-serif;color:#0f172a}
    .clinic{font-size:20px;font-weight:800;color:#1e3a5f}
    .muted{color:#64748b;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}
    th{text-align:left;border-bottom:2px solid #cbd5e1;padding:5px;font-size:11px;color:#475569}
    td{padding:5px;border-bottom:1px solid #e2e8f0}
    .right{text-align:right}
    .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}
    .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px;text-align:center}
    .box .label{font-size:10px;color:#64748b}
    .box .value{font-size:14px;font-weight:800}
    @media print{button{display:none}}
  </style></head><body>
  <div class="clinic">Balaji Ortho Care Center — Monthly Cash Book</div>
  <div class="muted">${monthLabel}</div>
  <div class="summary">
    <div class="box"><div class="label">Grand Total Collection</div><div class="value">₹${(totals.grandTotal||0).toLocaleString("en-IN")}</div></div>
    <div class="box"><div class="label">Total Expenses</div><div class="value">₹${(totals.expense||0).toLocaleString("en-IN")}</div></div>
    <div class="box"><div class="label">Net Cash Remaining</div><div class="value">₹${(totals.netCash||0).toLocaleString("en-IN")}</div></div>
    <div class="box"><div class="label">Average Daily Collection</div><div class="value">₹${Math.round(totals.avgDaily||0).toLocaleString("en-IN")}</div></div>
    <div class="box"><div class="label">Working Days</div><div class="value">${totals.workingDays||0}</div></div>
    <div class="box"><div class="label">Monthly Closing Balance</div><div class="value">₹${(totals.monthlyClosing||0).toLocaleString("en-IN")}</div></div>
  </div>
  <table>
    <thead><tr><th>Date</th><th class="right">Opening</th><th class="right">Collection</th><th class="right">Expense</th><th class="right">Bank Dep.</th><th class="right">Home</th><th class="right">Closing</th><th>Status</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <button onclick="window.print()" style="margin-top:16px;padding:8px 16px">Print</button>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`);
  win.document.close();
}

export default function DailyCashBook() {
  const { data: allEntries = [], isLoading } = useCashBookEntries();
  const { data: allBills = [] } = useBills();
  const addEntry = useAddCashBookEntry();
  const deleteEntry = useDeleteCashBookEntry();
  const qc = useQueryClient();

  // ── Day-closing / physical-verification / reopen-audit table ──
  // New table only (cash_book_days). Uses the SAME offline-first engine
  // (offlineFetch / offlineInsert / offlineUpdate → SQLite cache + sync
  // queue) already powering every other table — nothing in that engine
  // was touched, so this works fully offline exactly like everything else.
  const { data: allDays = [] } = useQuery({
    queryKey: ["cash_book_days"],
    staleTime: 0,
    refetchOnMount: true,
    queryFn: async () =>
      offlineFetch("cash_book_days", async () => {
        const { data, error } = await supabase.from("cash_book_days").select("*");
        if (error) throw error;
        return data || [];
      }),
  });

  const upsertDayMutation = useMutation({
    mutationFn: async (payload: any) => {
      const existing = (allDays as any[]).find((d) => d.entry_date === payload.entry_date);
      if (existing) return offlineUpdate("cash_book_days", existing.id, payload);
      return offlineInsert("cash_book_days", payload);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cash_book_days"] }),
  });

  const [selectedDate, setSelectedDate] = useState(toLocalDateInput(new Date()));
  const [bankForm, setBankForm] = useState({ amount: "", bank_name: "", party_name: "", note: "" });
  const [homeForm, setHomeForm] = useState({ amount: "", party_name: "", note: "" });
  const [expenseForm, setExpenseForm] = useState({ amount: "", party_name: "", note: "" });
  const [openingInput, setOpeningInput] = useState("");
  const [physicalCashInput, setPhysicalCashInput] = useState("");
  const [closeRemarks, setCloseRemarks] = useState("");
  const [historyRange, setHistoryRange] = useState("this_week");

  // ── Build a chronological ledger for EVERY date that has any activity,
  // so opening/closing carries forward correctly day-to-day and closed
  // days keep their frozen snapshot forever (never overwritten). ──
  const dailyMap = useMemo(() => {
    const dates = new Set<string>();
    (allEntries as any[]).forEach((e) => dates.add(e.entry_date));
    (allBills as any[]).forEach((b) => { const d = billDate(b); if (d) dates.add(d); });
    (allDays as any[]).forEach((d) => dates.add(d.entry_date));
    dates.add(selectedDate);
    dates.add(toLocalDateInput(new Date()));
    const sorted = Array.from(dates).sort();

    const map: Record<string, any> = {};
    let runningClosing = 0;

    for (const date of sorted) {
      const dayEntries = (allEntries as any[]).filter((e) => e.entry_date === date);
      const dayBills = (allBills as any[]).filter((b) => billDate(b) === date);
      const dayRecord = (allDays as any[]).find((d) => d.entry_date === date);

      const manualOpening = dayEntries
        .filter((e) => e.entry_type === "opening")
        .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))[0];
      const opening = manualOpening ? Number(manualOpening.amount) || 0 : runningClosing;

      const legacy = sumByType(dayEntries); // legacy cash_in / upi_in (pre-upgrade rows) + current expense/bank_deposit/home_given
      const billCash = dayBills.filter((b) => b.payment_mode === "Cash").reduce((s, b) => s + Number(b.amount_paid || 0), 0);
      const billUpi = dayBills.filter((b) => b.payment_mode === "UPI").reduce((s, b) => s + Number(b.amount_paid || 0), 0);
      const billCard = dayBills.filter((b) => b.payment_mode === "Card").reduce((s, b) => s + Number(b.amount_paid || 0), 0);
      const billBank = dayBills.filter((b) => b.payment_mode === "Bank Transfer").reduce((s, b) => s + Number(b.amount_paid || 0), 0);

      const cashCollection = billCash + legacy.cash_in;
      const upiCollection = billUpi + legacy.upi_in;
      const cardCollection = billCard;
      const bankCollection = billBank;
      const totalCollection = cashCollection + upiCollection + cardCollection + bankCollection;
      const expense = legacy.expense;
      const bankDepositOut = legacy.bank_deposit;
      const homeGiven = legacy.home_given;

      // UPI / Card / Bank Transfer NEVER touch physical cash.
      const calculatedClosing = opening + cashCollection - expense - bankDepositOut - homeGiven;
      const closing = dayRecord?.status === "closed" && dayRecord.calculated_closing != null
        ? Number(dayRecord.calculated_closing)
        : calculatedClosing;

      map[date] = {
        date, opening, cashCollection, upiCollection, cardCollection, bankCollection,
        totalCollection, expense, bankDepositOut, homeGiven, closing, dayRecord,
        hasTransactions: dayBills.length > 0 || dayEntries.some((e) => e.entry_type !== "opening"),
        entries: dayEntries, bills: dayBills,
      };
      runningClosing = closing;
    }
    return map;
  }, [allEntries, allBills, allDays, selectedDate]);

  const today = dailyMap[selectedDate];
  const entriesForDate = today?.entries || [];
  const billsForDate = today?.bills || [];
  const dayRecord = today?.dayRecord;
  const isClosed = dayRecord?.status === "closed";
  const openingLocked = today?.hasTransactions;
  const isToday = selectedDate === toLocalDateInput(new Date());
  const isAdmin = getCurrentRole() === "admin";

  const difference = physicalCashInput !== ""
    ? Number(physicalCashInput) - today.closing
    : (dayRecord?.difference ?? null);

  const diffStatus = difference == null ? null
    : Math.abs(difference) < 0.01 ? "matched"
    : difference > 0 ? "excess" : "short";

  // ── Cash Movement Timeline ──
  const timeline = useMemo(() => {
    if (!today) return [];
    const items: { time: string; label: string; amount?: number; sign?: "+" | "-" }[] = [];
    const manualOpening = entriesForDate.find((e: any) => e.entry_type === "opening");
    items.push({ time: manualOpening?.created_at || `${selectedDate}T00:00:00`, label: "Opening Balance", amount: today.opening });
    billsForDate.forEach((b: any) => items.push({
      time: b.created_at,
      label: `Bill — ${b.patients?.name || "Patient"} (${b.payment_mode || "—"})`,
      amount: Number(b.amount_paid || 0), sign: "+",
    }));
    entriesForDate
      .filter((e: any) => ["expense", "bank_deposit", "home_given", "cash_in", "upi_in"].includes(e.entry_type))
      .forEach((e: any) => items.push({
        time: e.created_at,
        label: `${TYPE_LABEL[e.entry_type]}${e.party_name ? " — " + e.party_name : ""}`,
        amount: Number(e.amount || 0),
        sign: ["expense", "bank_deposit", "home_given"].includes(e.entry_type) ? "-" : "+",
      }));
    if (isClosed && dayRecord?.closed_at) {
      items.push({ time: dayRecord.closed_at, label: `Day Closed by ${dayRecord.closed_by || "—"}` });
    }
    return items.sort((a, b) => (a.time > b.time ? 1 : -1));
  }, [today, entriesForDate, billsForDate, isClosed, dayRecord, selectedDate]);

  // ── Monthly Summary ──
  const monthPrefix = selectedDate.slice(0, 7);
  const monthDates = Object.keys(dailyMap).filter((d) => d.startsWith(monthPrefix)).sort();
  const monthly = useMemo(() => {
    const acc = { cash: 0, upi: 0, card: 0, bank: 0, expense: 0, bankDepositOut: 0, homeGiven: 0 };
    let workingDays = 0;
    let highest = { date: "—", total: -1 };
    let lowest = { date: "—", total: Infinity };
    for (const d of monthDates) {
      const day = dailyMap[d];
      acc.cash += day.cashCollection; acc.upi += day.upiCollection; acc.card += day.cardCollection; acc.bank += day.bankCollection;
      acc.expense += day.expense; acc.bankDepositOut += day.bankDepositOut; acc.homeGiven += day.homeGiven;
      if (day.totalCollection > 0 || day.dayRecord) workingDays++;
      if (day.totalCollection > highest.total) highest = { date: d, total: day.totalCollection };
      if (day.totalCollection < lowest.total) lowest = { date: d, total: day.totalCollection };
    }
    const grandTotal = acc.cash + acc.upi + acc.card + acc.bank;
    const netCash = grandTotal - acc.expense - acc.bankDepositOut - acc.homeGiven;
    const avgDaily = workingDays ? grandTotal / workingDays : 0;
    const lastDate = monthDates[monthDates.length - 1];
    const monthlyClosing = lastDate ? dailyMap[lastDate].closing : 0;
    return { ...acc, grandTotal, netCash, avgDaily, workingDays, highest, lowest, monthlyClosing };
  }, [monthDates, dailyMap]);

  // ── History (filtered range) ──
  const historyRows = useMemo(() => {
    const now = new Date();
    const y = toLocalDateInput(now);
    let from = y, to = y;
    if (historyRange === "today") { from = y; to = y; }
    else if (historyRange === "yesterday") {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      from = to = toLocalDateInput(d);
    } else if (historyRange === "this_week") {
      const d = new Date(now); d.setDate(d.getDate() - d.getDay());
      from = toLocalDateInput(d); to = y;
    } else if (historyRange === "this_month") {
      from = `${y.slice(0, 7)}-01`; to = y;
    } else if (historyRange === "last_month") {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      from = toLocalDateInput(d); to = toLocalDateInput(last);
    }
    return Object.keys(dailyMap).filter((d) => d >= from && d <= to).sort().map((d) => dailyMap[d]);
  }, [dailyMap, historyRange]);

  function exportHistoryExcel() {
    const data = historyRows.map((r: any) => ({
      Date: r.date, Opening: r.opening, "Cash Collection": r.cashCollection, "UPI Collection": r.upiCollection,
      "Card Collection": r.cardCollection, "Bank Transfer": r.bankCollection, "Total Collection": r.totalCollection,
      Expense: r.expense, "Bank Deposit": r.bankDepositOut, "Cash Taken Home": r.homeGiven,
      "Closing Cash": r.closing, "Physical Cash": r.dayRecord?.physical_cash ?? "", Difference: r.dayRecord?.difference ?? "",
      Status: r.dayRecord?.status || "open",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily Cash Book");
    XLSX.writeFile(wb, `Daily_Cash_Book_${selectedDate}.xlsx`);
  }

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
        created_by: currentUserName(),
      });
      await logAudit({ action: "create", module: "daily_cash_book", description: `${TYPE_LABEL[entry_type]} — ${fmt(amt)} (${selectedDate})` });
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
      await addEntry.mutateAsync({ entry_date: selectedDate, entry_type: "opening", amount: amt, note: "Manually set", created_by: currentUserName() });
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

  const handleCloseDay = async () => {
    if (isClosed) return;
    const physical = physicalCashInput !== "" ? Number(physicalCashInput) : NaN;
    if (isNaN(physical)) {
      toast({ title: "Physical cash count daaliye", variant: "destructive" });
      return;
    }
    const diff = physical - today.closing;
    if (Math.abs(diff) > 0.01 && !closeRemarks.trim()) {
      toast({ title: "Remarks likhna zaroori hai", description: "Physical cash aur calculated closing match nahi kar raha", variant: "destructive" });
      return;
    }
    if (!window.confirm(`Din band karna hai?\nCalculated Closing: ${fmt(today.closing)}\nPhysical Cash: ${fmt(physical)}`)) return;

    const userName = currentUserName();
    try {
      await upsertDayMutation.mutateAsync({
        entry_date: selectedDate,
        physical_cash: physical,
        calculated_closing: today.closing,
        difference: diff,
        remarks: closeRemarks || null,
        status: "closed",
        closed_by: userName,
        closed_at: new Date().toISOString(),
      });
      await logAudit({ action: "close_day", module: "daily_cash_book", recordId: selectedDate, description: `Day closed by ${userName}. Closing ₹${today.closing}, Physical ₹${physical}, Diff ₹${diff}` });
      toast({ title: "✅ Din Band Ho Gaya", description: `Closing: ${fmt(today.closing)}` });
      setPhysicalCashInput(""); setCloseRemarks("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleReopenDay = async () => {
    if (!isAdmin) {
      toast({ title: "Sirf Admin reopen kar sakta hai", variant: "destructive" });
      return;
    }
    const reason = window.prompt("Reopen karne ka reason likhein:");
    if (!reason || !reason.trim()) {
      toast({ title: "Reason zaroori hai", variant: "destructive" });
      return;
    }
    const userName = currentUserName();
    try {
      await upsertDayMutation.mutateAsync({
        entry_date: selectedDate,
        status: "open",
        reopened_by: userName,
        reopened_at: new Date().toISOString(),
        reopen_reason: reason,
        reopen_count: (dayRecord?.reopen_count || 0) + 1,
      });
      await logAudit({ action: "reopen_day", module: "daily_cash_book", recordId: selectedDate, description: `Day reopened by ${userName}. Reason: ${reason}` });
      toast({ title: "🔓 Din Reopen Ho Gaya", description: "Admin ne reopen kiya" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const dateLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "2-digit", month: "short", year: "numeric",
  });
  const monthLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  if (!today) {
    return (
      <DashboardLayout>
        <p className="text-sm text-muted-foreground p-6">Load ho raha hai...</p>
      </DashboardLayout>
    );
  }

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
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)", margin: 0 }}>Rozana cash, UPI, card, bank aur kharcha ka hisaab — auto calculated</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
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
            <Button size="sm" variant="secondary" className="gap-1" onClick={() => printCashBook(dateLabel, entriesForDate, billsForDate, today, dayRecord)}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </div>
        </div>

        {/* Day status banner */}
        {isClosed ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-red-700 text-sm font-medium">
                <Lock className="h-4 w-4" /> Ye din band ho chuka hai — closed by {dayRecord?.closed_by || "—"} ({dayRecord?.closed_at ? new Date(dayRecord.closed_at).toLocaleString("en-IN") : "—"}). Sab kuch Read Only hai.
              </div>
              {isAdmin && (
                <Button size="sm" variant="destructive" className="gap-1" onClick={handleReopenDay}>
                  <RotateCcw className="h-4 w-4" /> Reopen Day (Admin)
                </Button>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryBox label="Opening Balance" value={fmt(today.opening)} icon={PiggyBank} color="#3a4a6b" />
          <SummaryBox label="Cash Collection (Auto)" value={fmt(today.cashCollection)} icon={Banknote} color="#1a6b3a" />
          <SummaryBox label="UPI Collection (Auto)" value={fmt(today.upiCollection)} icon={Smartphone} color="#1877c4" />
          <SummaryBox label="Card Collection (Auto)" value={fmt(today.cardCollection)} icon={CreditCard} color="#7c3aed" />
          <SummaryBox label="Bank Transfer (Auto)" value={fmt(today.bankCollection)} icon={Landmark} color="#0891b2" />
          <SummaryBox label="Total Collection" value={fmt(today.totalCollection)} icon={Wallet} color="#1a3a6b" />
          <SummaryBox label="Kharcha" value={fmt(today.expense)} icon={ReceiptIcon} color="#7b1a1a" />
          <SummaryBox label="Calculated Closing Cash" value={fmt(today.closing)} icon={Wallet} color="#0e7c4a" highlight />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryBox label="Bank Jama" value={fmt(today.bankDepositOut)} icon={Landmark} color="#5b21b6" />
          <SummaryBox label="Ghar Diya" value={fmt(today.homeGiven)} icon={Home} color="#b87c1a" />
        </div>

        {/* Opening balance editor — locked after first transaction */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[240px]">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  {openingLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  Opening Balance ({dateLabel}) {openingLocked ? "— pehla transaction ho chuka hai, ab LOCKED hai" : "— agar carry-forward galat hai to yahan set karein"}
                </Label>
                <Input
                  type="number" placeholder={`Abhi: ${fmt(today.opening)}`} value={openingInput}
                  disabled={openingLocked || isClosed}
                  onChange={(e) => setOpeningInput(e.target.value)}
                />
              </div>
              <Button onClick={handleSetOpening} disabled={addEntry.isPending || openingLocked || isClosed}>Set Karein</Button>
            </div>
          </CardContent>
        </Card>

        {/* Auto collections from billing (read only) */}
        {billsForDate.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg flex items-center gap-2"><ListChecks className="h-5 w-5" /> Aaj Ki Billing Collections (Auto, Read Only)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Mode</TableHead><TableHead className="text-right">Amount Paid</TableHead></TableRow></TableHeader>
                <TableBody>
                  {billsForDate.map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.patients?.name || "—"}</TableCell>
                      <TableCell><Badge variant="outline">{b.payment_mode || "—"}</Badge></TableCell>
                      <TableCell className="text-right font-semibold">{fmt(Number(b.amount_paid || 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Manual entry forms — only Expense / Bank Deposit / Cash Taken Home */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg">Manual Entry Add Karein</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="expense" className="space-y-4">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="expense">Kharcha</TabsTrigger>
                <TabsTrigger value="bank">Bank Jama</TabsTrigger>
                <TabsTrigger value="home">Ghar Diya</TabsTrigger>
              </TabsList>

              <TabsContent value="expense" className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Amount *</Label>
                    <Input type="number" placeholder="₹ Amount" disabled={isClosed} value={expenseForm.amount} onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Kisko Diya / Kis Liye *</Label>
                    <Input placeholder="Naam ya kharche ka kaam (Reason)" disabled={isClosed} value={expenseForm.party_name} onChange={(e) => setExpenseForm((p) => ({ ...p, party_name: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Remarks (optional)</Label>
                  <Input placeholder="Remarks" disabled={isClosed} value={expenseForm.note} onChange={(e) => setExpenseForm((p) => ({ ...p, note: e.target.value }))} />
                </div>
                <Button
                  onClick={() => handleAdd("expense", expenseForm.amount, expenseForm.party_name, "", expenseForm.note, () => setExpenseForm({ amount: "", party_name: "", note: "" }))}
                  disabled={addEntry.isPending || isClosed}
                >
                  Add Karein
                </Button>
              </TabsContent>

              <TabsContent value="bank" className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Amount *</Label>
                    <Input type="number" placeholder="₹ Amount" disabled={isClosed} value={bankForm.amount} onChange={(e) => setBankForm((p) => ({ ...p, amount: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Bank / Account</Label>
                    <Input placeholder="Konsa bank / account" disabled={isClosed} value={bankForm.bank_name} onChange={(e) => setBankForm((p) => ({ ...p, bank_name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Account Holder Naam</Label>
                    <Input placeholder="Account holder ka naam" disabled={isClosed} value={bankForm.party_name} onChange={(e) => setBankForm((p) => ({ ...p, party_name: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Remarks (optional)</Label>
                  <Input placeholder="Remarks" disabled={isClosed} value={bankForm.note} onChange={(e) => setBankForm((p) => ({ ...p, note: e.target.value }))} />
                </div>
                <Button
                  onClick={() => handleAdd("bank_deposit", bankForm.amount, bankForm.party_name, bankForm.bank_name, bankForm.note, () => setBankForm({ amount: "", bank_name: "", party_name: "", note: "" }))}
                  disabled={addEntry.isPending || isClosed}
                >
                  Add Karein
                </Button>
              </TabsContent>

              <TabsContent value="home" className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Amount *</Label>
                    <Input type="number" placeholder="₹ Amount" disabled={isClosed} value={homeForm.amount} onChange={(e) => setHomeForm((p) => ({ ...p, amount: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Kisko Diya *</Label>
                    <Input placeholder="Naam (Reason)" disabled={isClosed} value={homeForm.party_name} onChange={(e) => setHomeForm((p) => ({ ...p, party_name: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Remarks (optional)</Label>
                  <Input placeholder="Remarks" disabled={isClosed} value={homeForm.note} onChange={(e) => setHomeForm((p) => ({ ...p, note: e.target.value }))} />
                </div>
                <Button
                  onClick={() => handleAdd("home_given", homeForm.amount, homeForm.party_name, "", homeForm.note, () => setHomeForm({ amount: "", party_name: "", note: "" }))}
                  disabled={addEntry.isPending || isClosed}
                >
                  Add Karein
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Physical Cash Verification + Day Closing */}
        <Card className="border-cyan-200">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Physical Cash Verification &amp; Day Closing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3 items-end">
              <div className="space-y-1">
                <Label>Physical Cash Count *</Label>
                <Input
                  type="number" placeholder="Ginkar jitni cash mili"
                  disabled={isClosed}
                  value={physicalCashInput !== "" ? physicalCashInput : (dayRecord?.physical_cash ?? "")}
                  onChange={(e) => setPhysicalCashInput(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Difference</Label>
                <div className={`h-10 flex items-center px-3 rounded-md border text-sm font-semibold ${
                  diffStatus === "matched" ? "bg-green-50 border-green-200 text-green-700" :
                  diffStatus === "excess" ? "bg-blue-50 border-blue-200 text-blue-700" :
                  diffStatus === "short" ? "bg-red-50 border-red-200 text-red-700" : "bg-slate-50 border-slate-200 text-slate-500"
                }`}>
                  {diffStatus === "matched" && <><CheckCircle2 className="h-4 w-4 mr-1" /> Matched</>}
                  {diffStatus === "excess" && <><AlertTriangle className="h-4 w-4 mr-1" /> Excess {fmt(Math.abs(difference!))}</>}
                  {diffStatus === "short" && <><AlertTriangle className="h-4 w-4 mr-1" /> Short {fmt(Math.abs(difference!))}</>}
                  {diffStatus === null && "—"}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Remarks {diffStatus && diffStatus !== "matched" ? "* (mandatory)" : ""}</Label>
                <Input placeholder="Remarks" disabled={isClosed} value={closeRemarks !== "" ? closeRemarks : (dayRecord?.remarks || "")} onChange={(e) => setCloseRemarks(e.target.value)} />
              </div>
            </div>
            {!isClosed && (
              <Button className="gap-2" onClick={handleCloseDay} disabled={upsertDayMutation.isPending}>
                <Lock className="h-4 w-4" /> Close Day
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Cash Movement Timeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Cash Movement Timeline — {dateLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">Koi movement nahi hai.</p>
            ) : (
              <div className="space-y-2">
                {timeline.map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border-b last:border-0 pb-2">
                    <span className="text-muted-foreground w-24 shrink-0">{new Date(t.time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="flex-1">{t.label}</span>
                    {t.amount != null && (
                      <span className={`font-semibold ${t.sign === "-" ? "text-red-600" : "text-green-700"}`}>
                        {t.sign === "-" ? "−" : "+"}{fmt(t.amount)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Entries list (legacy + manual entries) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg">{dateLabel} Ki Manual Entries</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Load ho raha hai...</p>
            ) : entriesForDate.filter((e: any) => e.entry_type !== "opening").length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aaj koi manual entry nahi hai.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Naam / Account</TableHead>
                      <TableHead>Remarks</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entriesForDate
                      .filter((e: any) => e.entry_type !== "opening")
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
                          <TableCell className="text-muted-foreground text-sm">{entry.created_by || "—"}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(Number(entry.amount))}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" disabled={isClosed} onClick={() => handleDelete(entry.id)}>
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

        {/* Monthly Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Monthly Summary — {monthLabel}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <MiniStat label="Total Cash" value={fmt(monthly.cash)} />
              <MiniStat label="Total UPI" value={fmt(monthly.upi)} />
              <MiniStat label="Total Card" value={fmt(monthly.card)} />
              <MiniStat label="Total Bank Transfer" value={fmt(monthly.bank)} />
              <MiniStat label="Grand Total Collection" value={fmt(monthly.grandTotal)} />
              <MiniStat label="Total Expenses" value={fmt(monthly.expense)} />
              <MiniStat label="Total Bank Deposits" value={fmt(monthly.bankDepositOut)} />
              <MiniStat label="Total Cash Taken Home" value={fmt(monthly.homeGiven)} />
              <MiniStat label="Net Cash Remaining" value={fmt(monthly.netCash)} />
              <MiniStat label="Average Daily Collection" value={fmt(Math.round(monthly.avgDaily))} />
              <MiniStat label="Working Days" value={String(monthly.workingDays)} />
              <MiniStat label="Monthly Closing Balance" value={fmt(monthly.monthlyClosing)} />
              <MiniStat label="Highest Collection Day" value={`${monthly.highest.date === "—" ? "—" : new Date(monthly.highest.date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} (${fmt(Math.max(monthly.highest.total, 0))})`} />
              <MiniStat label="Lowest Collection Day" value={`${monthly.lowest.date === "—" ? "—" : new Date(monthly.lowest.date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} (${fmt(monthly.lowest.total === Infinity ? 0 : monthly.lowest.total)})`} />
            </div>
            <Button
              size="sm" variant="secondary" className="gap-1"
              onClick={() => printMonthlyCashBook(
                monthLabel,
                monthDates.map((d) => ({ date: d, opening: dailyMap[d].opening, totalCollection: dailyMap[d].totalCollection, expense: dailyMap[d].expense, bankDepositOut: dailyMap[d].bankDepositOut, homeGiven: dailyMap[d].homeGiven, closing: dailyMap[d].closing, status: dailyMap[d].dayRecord?.status || "open" })),
                monthly
              )}
            >
              <Printer className="h-4 w-4" /> Monthly PDF
            </Button>
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle className="font-heading text-lg">History</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={historyRange} onValueChange={setHistoryRange}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="secondary" className="gap-1" onClick={exportHistoryExcel}>
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead><TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Collection</TableHead><TableHead className="text-right">Expense</TableHead>
                    <TableHead className="text-right">Closing</TableHead><TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRows.map((r: any) => (
                    <TableRow key={r.date} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedDate(r.date)}>
                      <TableCell>{new Date(r.date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                      <TableCell className="text-right">{fmt(r.opening)}</TableCell>
                      <TableCell className="text-right">{fmt(r.totalCollection)}</TableCell>
                      <TableCell className="text-right">{fmt(r.expense)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(r.closing)}</TableCell>
                      <TableCell>
                        <Badge variant={r.dayRecord?.status === "closed" ? "outline" : "secondary"}>
                          {r.dayRecord?.status === "closed" ? "Closed" : "Open"}
                        </Badge>
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
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
