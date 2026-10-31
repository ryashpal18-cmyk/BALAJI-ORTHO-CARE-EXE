import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { UserPlus, Printer, Pencil, Power, FileText, Stethoscope } from "lucide-react";
import { businessDate } from "@/lib/businessDate";
import { invoiceNumber } from "@/lib/invoiceNumber";
import { escapeHtml, writeReportDocument } from "@/lib/safeReportHtml";
import { isValidMobile } from "@/lib/utils";
import { useBills } from "@/hooks/useDatabase";
import { useAddDoctor, useDoctors, useUpdateDoctor } from "@/hooks/useDoctors";
import {
  DEFAULT_COMMISSION_PERCENT, DEFAULT_DOCTOR_NAME, billCommission, normId, rupees, xrayLines,
  type Doctor,
} from "@/lib/doctors";

const DAY = 24 * 60 * 60 * 1000;
type RangeMode = "15d" | "1m" | "custom";

type ReportRow = {
  key: string; doctorKey: string; doctorName: string; date: string; invoice: string;
  patient: string; services: string; amount: number; percent: number; commission: number;
};
type Group = { doctorKey: string; doctorName: string; rows: ReportRow[]; amount: number; commission: number };

const fmtDate = (iso: string) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function printDoctorReport(groups: Group[], from: string, to: string, totals: { amount: number; commission: number; count: number }) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    toast({ title: "Print window नहीं खुली", description: "Pop-up allow करके दोबारा try करें", variant: "destructive" });
    return;
  }
  const sections = groups.map((g) => `
    <div class="doc">
      <div class="doc-head"><span class="doc-name">${escapeHtml(g.doctorName)}</span>
        <span class="muted">${g.rows.length} X-Ray bill${g.rows.length === 1 ? "" : "s"}</span></div>
      <table>
        <thead><tr><th>#</th><th>Date</th><th>Invoice</th><th>Patient</th><th>X-Ray</th>
          <th class="r">X-Ray ₹</th><th class="r">%</th><th class="r">Commission ₹</th></tr></thead>
        <tbody>${g.rows.map((r, i) => `<tr>
          <td>${i + 1}</td><td>${escapeHtml(fmtDate(r.date))}</td><td>${escapeHtml(r.invoice)}</td>
          <td>${escapeHtml(r.patient)}</td><td>${escapeHtml(r.services)}</td>
          <td class="r">${escapeHtml(rupees(r.amount))}</td><td class="r">${r.percent}%</td>
          <td class="r b">${escapeHtml(rupees(r.commission))}</td></tr>`).join("")}
        </tbody>
        <tfoot><tr><td colspan="5" class="b">Total — ${escapeHtml(g.doctorName)}</td>
          <td class="r b">${escapeHtml(rupees(g.amount))}</td><td></td>
          <td class="r b">${escapeHtml(rupees(g.commission))}</td></tr></tfoot>
      </table>
    </div>`).join("");

  const body = groups.length
    ? sections
    : `<p class="muted" style="margin:24px 0">इस अवधि में कोई X-Ray commission entry नहीं मिली।</p>`;

  writeReportDocument(win, `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Doctor Commission Report</title>
  <style>
    @page{size:A4;margin:12mm}
    *{box-sizing:border-box}
    body{font-family:Arial,'Segoe UI','Nirmala UI',sans-serif;color:#0f172a;font-size:12px}
    .clinic{font-size:20px;font-weight:800;color:#1e3a5f}
    .title{font-size:14px;font-weight:700;margin-top:2px}
    .muted{color:#64748b;font-size:11px}
    .summary{display:flex;gap:8px;margin:12px 0}
    .box{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px;text-align:center}
    .box .label{font-size:10px;color:#64748b}.box .value{font-size:15px;font-weight:800}
    .doc{margin-top:14px;page-break-inside:auto}
    .doc-head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #0891b2;padding-bottom:3px}
    .doc-name{font-size:14px;font-weight:800;color:#1e3a5f}
    table{width:100%;border-collapse:collapse;margin-top:6px}
    th{text-align:left;border-bottom:1.5px solid #cbd5e1;padding:4px;font-size:10.5px;color:#475569}
    td{padding:4px;border-bottom:1px solid #e2e8f0;vertical-align:top}
    tfoot td{border-top:2px solid #0891b2;border-bottom:none;background:#f0f9ff}
    .r{text-align:right}.b{font-weight:700}
    .sign{display:flex;justify-content:space-between;margin-top:46px;font-size:11px;color:#475569}
    .sign div{border-top:1px solid #94a3b8;padding-top:4px;min-width:150px;text-align:center}
    @media print{.no-print{display:none}}
  </style></head><body>
  <div class="clinic">Balaji Ortho Care Center</div>
  <div class="title">Doctor X-Ray Commission Report</div>
  <div class="muted">Period: ${escapeHtml(fmtDate(from))} to ${escapeHtml(fmtDate(to))}</div>
  <div class="summary">
    <div class="box"><div class="label">X-Ray Bills</div><div class="value">${totals.count}</div></div>
    <div class="box"><div class="label">Total X-Ray Amount</div><div class="value">${escapeHtml(rupees(totals.amount))}</div></div>
    <div class="box"><div class="label">Total Commission</div><div class="value">${escapeHtml(rupees(totals.commission))}</div></div>
  </div>
  ${body}
  <div class="sign"><div>Doctor Signature</div><div>${escapeHtml(DEFAULT_DOCTOR_NAME)}</div></div>
  <div class="no-print" style="margin-top:18px"><button style="padding:8px 18px;font-size:13px">🖨️ Print / Save as PDF</button></div>
  </body></html>`);
  win.document.close();
  // Print dialog mein "Save as PDF" / "Microsoft Print to PDF" chun kar PDF ban jaati hai.
  setTimeout(() => { try { win.focus(); win.print(); } catch { /* button se bhi print ho sakta hai */ } }, 500);
}

export default function DrReg() {
  const { data: doctors = [] } = useDoctors();
  const { data: bills = [] } = useBills("clinic");
  const addDoctor = useAddDoctor();
  const updateDoctor = useUpdateDoctor();

  // ── Naya doctor ──
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [speciality, setSpeciality] = useState("");
  const [percent, setPercent] = useState(String(DEFAULT_COMMISSION_PERCENT));

  // ── Edit dialog ──
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [eName, setEName] = useState("");
  const [eMobile, setEMobile] = useState("");
  const [eSpeciality, setESpeciality] = useState("");
  const [ePercent, setEPercent] = useState("");

  // ── Report ──
  const [reportDoctor, setReportDoctor] = useState("all");
  const [range, setRange] = useState<RangeMode>("1m");
  const [from, setFrom] = useState(businessDate(Date.now() - 29 * DAY));
  const [to, setTo] = useState(businessDate());

  const applyRange = (mode: RangeMode) => {
    setRange(mode);
    if (mode === "15d") { setFrom(businessDate(Date.now() - 14 * DAY)); setTo(businessDate()); }
    if (mode === "1m") { setFrom(businessDate(Date.now() - 29 * DAY)); setTo(businessDate()); }
  };

  const validatePercent = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  };

  const nameTaken = (n: string, exceptId?: string) => {
    const key = n.trim().toLowerCase();
    return key === DEFAULT_DOCTOR_NAME.toLowerCase() ||
      doctors.some((d) => d.name.trim().toLowerCase() === key && normId(d.id) !== normId(exceptId));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const pct = validatePercent(percent);
    if (!name.trim()) { toast({ title: "Doctor का नाम लिखें", variant: "destructive" }); return; }
    if (pct === null) { toast({ title: "Commission % 0 से 100 के बीच होना चाहिए", variant: "destructive" }); return; }
    if (mobile.trim() && !isValidMobile(mobile)) { toast({ title: "Mobile number सही नहीं है", variant: "destructive" }); return; }
    if (nameTaken(name)) { toast({ title: "इस नाम का doctor पहले से है", variant: "destructive" }); return; }
    try {
      await addDoctor.mutateAsync({ name, mobile, speciality, commission_percent: pct });
      toast({ title: "✅ Doctor add हो गया", description: name.trim() });
      setName(""); setMobile(""); setSpeciality(""); setPercent(String(DEFAULT_COMMISSION_PERCENT));
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || String(err), variant: "destructive" });
    }
  };

  const openEdit = (d: Doctor) => {
    setEditing(d); setEName(d.name); setEMobile(d.mobile || "");
    setESpeciality(d.speciality || ""); setEPercent(String(d.commission_percent ?? DEFAULT_COMMISSION_PERCENT));
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const pct = validatePercent(ePercent);
    if (!eName.trim()) { toast({ title: "Doctor का नाम लिखें", variant: "destructive" }); return; }
    if (pct === null) { toast({ title: "Commission % 0 से 100 के बीच होना चाहिए", variant: "destructive" }); return; }
    if (eMobile.trim() && !isValidMobile(eMobile)) { toast({ title: "Mobile number सही नहीं है", variant: "destructive" }); return; }
    if (nameTaken(eName, editing.id)) { toast({ title: "इस नाम का doctor पहले से है", variant: "destructive" }); return; }
    try {
      await updateDoctor.mutateAsync({
        id: editing.id, name: eName.trim(), mobile: eMobile.trim() || null,
        speciality: eSpeciality.trim() || null, commission_percent: pct,
      });
      toast({ title: "✅ Doctor update हो गया", description: "नया % सिर्फ आगे बनने वाले bills पर लगेगा" });
      setEditing(null);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || String(err), variant: "destructive" });
    }
  };

  const toggleActive = async (d: Doctor) => {
    try {
      await updateDoctor.mutateAsync({ id: d.id, is_active: !d.is_active });
      toast({ title: d.is_active ? "Doctor बंद किया" : "Doctor चालू किया", description: d.name });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || String(err), variant: "destructive" });
    }
  };

  // ── Report data: sirf wahi bills jin par registered doctor hai aur X-ray service hai ──
  const groups = useMemo<Group[]>(() => {
    const byId = new Map(doctors.map((d) => [normId(d.id), d]));
    const rows: ReportRow[] = [];
    for (const b of bills as any[]) {
      if (!b.doctor_id || String(b.status).toLowerCase()==="cancelled") continue;
      const lines = xrayLines(b);
      const amount = lines.reduce((s, l) => s + l.amount, 0);
      if (amount <= 0) continue;
      const date = businessDate(b.created_at);
      if (!date || date < from || date > to) continue;
      const doctorKey = normId(b.doctor_id);
      if (reportDoctor !== "all" && doctorKey !== reportDoctor) continue;
      const d = byId.get(doctorKey);
      rows.push({
        key: String(b.id), doctorKey, doctorName: d?.name || b.doctor_name || "Unknown Doctor",
        date, invoice: invoiceNumber(b.id), patient: (b.patients as any)?.name || "—",
        services: lines.map((l) => l.name).join(", "), amount,
        percent: Number(b.doctor_commission_percent ?? DEFAULT_COMMISSION_PERCENT),
        commission: billCommission(b),
      });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.invoice.localeCompare(b.invoice));
    const map = new Map<string, Group>();
    for (const r of rows) {
      const g = map.get(r.doctorKey) || { doctorKey: r.doctorKey, doctorName: r.doctorName, rows: [], amount: 0, commission: 0 };
      g.rows.push(r); g.amount += r.amount; g.commission += r.commission;
      map.set(r.doctorKey, g);
    }
    return Array.from(map.values()).sort((a, b) => a.doctorName.localeCompare(b.doctorName));
  }, [bills, doctors, from, to, reportDoctor]);

  const totals = useMemo(() => ({
    count: groups.reduce((s, g) => s + g.rows.length, 0),
    amount: groups.reduce((s, g) => s + g.amount, 0),
    commission: groups.reduce((s, g) => s + g.commission, 0),
  }), [groups]);

  const rangeBtn = (mode: RangeMode, label: string) => (
    <Button type="button" size="sm" variant={range === mode ? "default" : "outline"} onClick={() => applyRange(mode)}>
      {label}
    </Button>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 page-enter">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-primary" /> DR REG
          </h1>
          <p className="text-sm text-muted-foreground">
            Doctor registration और X-Ray commission report. Billing में doctor चुनने पर X-Ray का commission यहाँ जुड़ता है।
          </p>
        </div>

        {/* ── Naya doctor ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" /> नया Doctor जोड़ें</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs">Doctor का नाम *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="जैसे: Dr. Sharma" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mobile (optional)</Label>
                <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="10 digit" inputMode="numeric" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Speciality / Hospital</Label>
                <Input value={speciality} onChange={(e) => setSpeciality(e.target.value)} placeholder="optional" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">X-Ray Commission %</Label>
                <Input type="number" min={0} max={100} step="0.5" value={percent} onChange={(e) => setPercent(e.target.value)} />
              </div>
              <div className="md:col-span-5">
                <Button type="submit" disabled={addDoctor.isPending} className="gap-2">
                  <UserPlus className="h-4 w-4" /> {addDoctor.isPending ? "Saving..." : "Doctor Save करें"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ── Registered doctors ── */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Registered Doctors ({doctors.length + 1})</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Doctor</th><th className="p-2 text-left">Mobile</th>
                  <th className="p-2 text-left">Speciality / Hospital</th><th className="p-2 text-right">Commission</th>
                  <th className="p-2 text-left">Status</th><th className="p-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="p-2 font-medium">{DEFAULT_DOCTOR_NAME}</td>
                  <td className="p-2">—</td><td className="p-2">Clinic Doctor (Default)</td>
                  <td className="p-2 text-right">—</td>
                  <td className="p-2"><span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">Default</span></td>
                  <td className="p-2" />
                </tr>
                {doctors.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="p-2 font-medium">{d.name}</td>
                    <td className="p-2">{d.mobile || "—"}</td>
                    <td className="p-2">{d.speciality || "—"}</td>
                    <td className="p-2 text-right">{d.commission_percent}%</td>
                    <td className="p-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${d.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                        {d.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => toggleActive(d)}>
                        <Power className="h-3.5 w-3.5" /> {d.is_active ? "बंद करें" : "चालू करें"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* ── Commission report ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> X-Ray Commission Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Doctor</Label>
                <Select value={reportDoctor} onValueChange={setReportDoctor}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">सभी Doctors</SelectItem>
                    {doctors.map((d) => <SelectItem key={d.id} value={normId(d.id)}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setRange("custom"); }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setRange("custom"); }} />
              </div>
              <div className="flex gap-2 flex-wrap">
                {rangeBtn("15d", "15 दिन")}{rangeBtn("1m", "1 महीना")}{rangeBtn("custom", "Custom")}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">X-Ray Bills</div><div className="text-2xl font-bold">{totals.count}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total X-Ray Amount</div><div className="text-2xl font-bold">{rupees(totals.amount)}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Commission</div><div className="text-2xl font-bold text-success">{rupees(totals.commission)}</div></CardContent></Card>
            </div>

            <div className="overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left">Date</th><th className="p-2 text-left">Doctor</th>
                    <th className="p-2 text-left">Patient</th><th className="p-2 text-left">X-Ray</th>
                    <th className="p-2 text-right">X-Ray ₹</th><th className="p-2 text-right">%</th>
                    <th className="p-2 text-right">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.flatMap((g) => g.rows).map((r) => (
                    <tr key={r.key} className="border-t">
                      <td className="p-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td className="p-2">{r.doctorName}</td>
                      <td className="p-2">{r.patient}</td>
                      <td className="p-2">{r.services}</td>
                      <td className="p-2 text-right">{rupees(r.amount)}</td>
                      <td className="p-2 text-right">{r.percent}%</td>
                      <td className="p-2 text-right text-success font-medium">{rupees(r.commission)}</td>
                    </tr>
                  ))}
                  {totals.count === 0 && (
                    <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">इस अवधि में कोई X-Ray commission entry नहीं है</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <Button onClick={() => printDoctorReport(groups, from, to, totals)} className="gap-2">
              <Printer className="h-4 w-4" /> PDF / Print निकालें
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── Edit dialog ── */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Doctor Edit करें</DialogTitle></DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">नाम *</Label><Input value={eName} onChange={(e) => setEName(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Mobile</Label><Input value={eMobile} onChange={(e) => setEMobile(e.target.value)} inputMode="numeric" /></div>
            <div className="space-y-1"><Label className="text-xs">Speciality / Hospital</Label><Input value={eSpeciality} onChange={(e) => setESpeciality(e.target.value)} /></div>
            <div className="space-y-1">
              <Label className="text-xs">X-Ray Commission %</Label>
              <Input type="number" min={0} max={100} step="0.5" value={ePercent} onChange={(e) => setEPercent(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">बदला हुआ % सिर्फ आगे बनने वाले bills पर लगेगा। पुराने bills का % वही रहेगा जो bill बनते समय था।</p>
            </div>
            <Button type="submit" className="w-full" disabled={updateDoctor.isPending}>
              {updateDoctor.isPending ? "Saving..." : "💾 Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
