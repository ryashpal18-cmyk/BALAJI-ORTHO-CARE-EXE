import { cashTallyForPeriod, periodCollections } from "@/lib/collectionReport";
import { safeReportHtml, writeReportDocument, escapeHtml } from "@/lib/safeReportHtml";
import { businessDate } from "@/lib/businessDate";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useBills } from "@/hooks/useDatabase";
import { CalendarDays, IndianRupee, Printer, Receipt } from "lucide-react";
import { useState } from "react";

function printDailyReport(
  bills: any[],
  receipts: any[],
  tally: { total: number; received: number; pending: number },
  fromDate: string,
  toDate: string,
) {
  const win = window.open("", "_blank");
  if (!win) return;

  const rangeLabel = fromDate === toDate
    ? new Date(fromDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : `${new Date(fromDate).toLocaleDateString("en-IN")} – ${new Date(toDate).toLocaleDateString("en-IN")}`;

  const rows = bills
    .map((bill) => {
      const paid = Number(bill.amount_paid || 0);
      const due = Math.max(Number(bill.amount || 0) - Number((bill as any).discount || 0) - paid, 0);
      const name = escapeHtml(bill.patients?.name || "—");
      const mobile = escapeHtml(bill.patients?.mobile || "");
      return `<tr>
        <td>${name}${mobile ? `<br/><span class="muted">${mobile}</span>` : ""}</td>
        <td class="right">₹${Number(bill.amount || 0).toLocaleString("en-IN")}</td>
        <td class="right paid">₹${paid.toLocaleString("en-IN")}</td>
        <td class="right due">₹${due.toLocaleString("en-IN")}</td>
      </tr>`;
    })
    .join("");

  const receivedRows = receipts.map(row => `<tr>
    <td>${escapeHtml(businessDate(row.created_at))}</td><td>${escapeHtml(row.patients?.name || "—")}</td>
    <td>${escapeHtml(businessDate(row.bill_created_at || ""))}</td><td>${escapeHtml(row.payment_mode || "Cash")}</td>
    <td class="right paid">₹${Number(row.amount_paid || 0).toLocaleString("en-IN")}</td></tr>`).join("");
  const invoicePaid = bills.reduce((sum, bill) => sum + Number(bill.amount_paid || 0), 0);

  writeReportDocument(win, `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Daily Report</title>
  <style>
    @page{size:A4;margin:14mm}
    body{font-family:Arial,sans-serif;color:#0f172a;padding:0}
    .header{border-bottom:3px solid #0891b2;padding-bottom:10px;margin-bottom:14px}
    .clinic{font-size:22px;font-weight:800;color:#1e3a5f}
    .muted{color:#64748b;font-size:12px}
    h2{margin:14px 0 8px;color:#1e3a5f}
    .summary{display:flex;gap:12px;margin:14px 0}
    .box{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center}
    .box .label{font-size:11px;color:#64748b}
    .box .value{font-size:18px;font-weight:800}
    table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
    th{text-align:left;border-bottom:2px solid #cbd5e1;padding:6px;font-size:12px;color:#475569}
    td{padding:6px;border-bottom:1px solid #e2e8f0}
    .right{text-align:right}
    .paid{color:#15803d}
    .due{color:#b45309}
    tfoot td{font-weight:800;border-top:2px solid #cbd5e1;border-bottom:none}
    @media print{button{display:none}}
  </style></head><body>
  <div class="header">
    <div class="clinic">Balaji Ortho Care Center</div>
    <div class="muted">Dr. S. S. Rathore (DMRT | BPT) · Opp Govt Hospital, Bay Pass Road, Khinwara, Raj. – 306502</div>
    <div class="muted">Phone: +91 8005707783</div>
  </div>
  <h2>Daily Report — ${rangeLabel}</h2><p class="muted">Income जमा होने की तारीख से है; पुराने bills का इस अवधि में जमा बकाया शामिल है।</p>
  <div class="summary">
    <div class="box"><div class="label">Patients</div><div class="value">${bills.length}</div></div>
    <div class="box"><div class="label">Total</div><div class="value">₹${tally.total.toLocaleString("en-IN")}</div></div>
    <div class="box"><div class="label">Income</div><div class="value paid">₹${tally.received.toLocaleString("en-IN")}</div></div>
    <div class="box"><div class="label">Pending Due</div><div class="value due">₹${tally.pending.toLocaleString("en-IN")}</div></div>
  </div>
  <h2>इस अवधि में जमा रकम / Collections</h2>
  <table><thead><tr><th>Payment Date</th><th>Patient</th><th>Bill Date</th><th>Mode</th><th class="right">Received</th></tr></thead>
    <tbody>${receivedRows || '<tr><td colspan="5">इस अवधि में कोई भुगतान नहीं है</td></tr>'}</tbody>
    <tfoot><tr><td colspan="4">कुल जमा</td><td class="right paid">₹${tally.received.toLocaleString("en-IN")}</td></tr></tfoot></table>
  <h2>इस अवधि के Bills — Paid = अब तक कुल जमा</h2>
  <table>
    <thead><tr><th>Patient</th><th class="right">Total</th><th class="right">Paid</th><th class="right">Due</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:20px">Koi bill nahi hai</td></tr>`}</tbody>
    <tfoot><tr><td>Total</td><td class="right">₹${tally.total.toLocaleString("en-IN")}</td><td class="right paid">₹${invoicePaid.toLocaleString("en-IN")}</td><td class="right due">₹${tally.pending.toLocaleString("en-IN")}</td></tr></tfoot>
  </table>
  <button onclick="window.print()" style="margin-top:16px;padding:8px 16px">Print</button>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`);
  win.document.close();
}

const toLocalDateInput = (date: Date) => businessDate(date);

const getMonthStart = (date: Date) =>
  toLocalDateInput(new Date(date.getFullYear(), date.getMonth(), 1));
const getMonthEnd = (date: Date) =>
  toLocalDateInput(new Date(date.getFullYear(), date.getMonth() + 1, 0));
const billDate = (createdAt: string) => toLocalDateInput(new Date(createdAt));

export default function CashTally() {
  const { data: bills, isLoading } = useBills();
  const [rangeMode, setRangeMode] = useState("month");
  const [fromDate, setFromDate] = useState(getMonthStart(new Date()));
  const [toDate, setToDate] = useState(getMonthEnd(new Date()));

  const applyRangeMode = (mode: string) => {
    const today = new Date();
    setRangeMode(mode);
    if (mode === "today") {
      const iso = toLocalDateInput(today);
      setFromDate(iso);
      setToDate(iso);
    }
    if (mode === "month") {
      setFromDate(getMonthStart(today));
      setToDate(getMonthEnd(today));
    }
  };

  const filteredBills = (bills || []).filter((bill) => {
    const date = billDate(bill.created_at);
    return date >= fromDate && date <= toDate;
  });

  const filteredReceipts = periodCollections(bills || [], fromDate, toDate);
  const tally = cashTallyForPeriod(bills || [], fromDate, toDate);
  return (
    <DashboardLayout>
      <div className="space-y-6 page-enter">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div style={{
            background: "linear-gradient(135deg, #0d2351 0%, #1e57b0 55%, #0e7c4a 100%)",
            borderRadius: "18px", padding: "22px 24px",
            display: "flex", alignItems: "center", gap: "16px",
            boxShadow: "0 8px 32px rgba(13,35,81,0.28)",
            flex: 1,
          }}>
            <div style={{
              width: "54px", height: "54px", borderRadius: "14px",
              background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "28px", flexShrink: 0,
            }}>💵</div>
            <div>
              <h1 style={{ fontSize: "22px", fontWeight: 800, color: "white", margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Cash Tally</h1>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)", margin: 0 }}>Daily cash and payment summary</p>
            </div>
          </div>
          <Button
            onClick={() => printDailyReport(filteredBills, filteredReceipts, tally, fromDate, toDate)}
            className="gap-2"
          >
            <Printer className="h-4 w-4" /> Print Daily Report
          </Button>
        </div>

        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" /> Date Range
            </CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Filter</Label>
              <Select value={rangeMode} onValueChange={applyRangeMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Aaj ki date</SelectItem>
                  <SelectItem value="month">Is month</SelectItem>
                  <SelectItem value="custom">Custom date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                aria-label="Cash Tally from date"
                value={fromDate}
                onChange={(e) => {
                  setRangeMode("custom");
                  setFromDate(e.target.value);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                aria-label="Cash Tally to date"
                value={toDate}
                onChange={(e) => {
                  setRangeMode("custom");
                  setToDate(e.target.value);
                }}
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Bills</p>
              <p className="text-2xl font-bold text-primary">{filteredBills.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">₹{tally.total.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">इस अवधि में जमा / Received</p>
              <p className="text-2xl font-bold text-success">₹{tally.received.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">पुराने बिलों का जमा बकाया शामिल: ₹{tally.previousDueReceived.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Baki / Due</p>
              <p className="text-2xl font-bold text-warning">₹{tally.pending.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="font-heading text-base">इस अवधि में जमा रकम / Collections</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">नए बिलों की जमा रकम और पुराने बकाये की इस अवधि में मिली रकम का जोड़। बिल की मूल तारीख वही रहती है।</p>
            {isLoading ? <p>Loading...</p> : <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="py-2">जमा तारीख</th><th>मरीज</th><th>बिल की तारीख</th><th>माध्यम</th><th className="text-right">जमा राशि</th></tr></thead>
              <tbody>{filteredReceipts.length === 0 ? <tr><td colSpan={5} className="py-6 text-center">इस अवधि में कोई भुगतान नहीं है</td></tr> : filteredReceipts.map(row => <tr key={`${row.bill_id}:${row.id}`} className="border-b">
                <td className="py-2">{businessDate(row.created_at)}</td><td>{row.patients?.name || "—"}</td><td>{businessDate(row.bill_created_at || "") || "—"}</td><td>{row.payment_mode || "Cash"}</td><td className="text-right text-success">₹{Number(row.amount_paid || 0).toLocaleString("en-IN")}</td>
              </tr>)}</tbody><tfoot><tr><td colSpan={4} className="py-2 font-semibold">कुल जमा</td><td className="text-right font-semibold">₹{tally.received.toLocaleString("en-IN")}</td></tr></tfoot>
            </table></div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" /> Bills Detail — बिल की तारीख से
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2">Date</th>
                      <th className="text-left py-2">Patient</th>
                      <th className="text-right py-2">Total</th>
                      <th className="text-right py-2">अब तक कुल जमा</th>
                      <th className="text-right py-2">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBills.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-muted-foreground">
                          Selected date range me koi bill nahi hai
                        </td>
                      </tr>
                    )}
                    {filteredBills.map((bill) => {
                      const paid = Number((bill as any).amount_paid || 0);
                      const due = Math.max(Number(bill.amount || 0) - Number((bill as any).discount || 0) - paid, 0);
                      return (
                        <tr key={bill.id} className="border-b">
                          <td className="py-2">
                            {new Date(bill.created_at).toLocaleDateString("en-IN")}
                          </td>
                          <td className="py-2 font-medium">{(bill.patients as any)?.name}</td>
                          <td className="py-2 text-right">
                            ₹{Number(bill.amount).toLocaleString()}
                          </td>
                          <td className="py-2 text-right text-success">₹{paid.toLocaleString()}</td>
                          <td className="py-2 text-right text-warning">₹{due.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
