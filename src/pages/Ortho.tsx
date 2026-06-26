import { useEffect, useMemo, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bone, Save, Send, MessageCircle, CalendarDays, Plane,
  Search, Pencil, CheckCircle2, PowerOff, BellRing, Shield,
  Trash2, Plus, AlertTriangle, Users, Activity, X,
  Phone, Calendar, Check, Loader2, FileText, TrendingUp,
  BarChart3, Clock, Zap, Heart, Star,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAddFractureCase, useFractureCases,
  useFollowupsAround, useUpdateFractureCase
} from "@/hooks/useOrtho";
import { useAddPatient, useSearchPatients } from "@/hooks/useDatabase";
import { sendSMS } from "@/services/smsService";

// ─── Constants ───────────────────────────────────────────────────────────────
const FRACTURE_TYPES = ["Simple", "Compound", "Hairline", "Dislocation", "Comminuted", "Greenstick", "Stress", "Spiral"];
const PLASTER_TYPES  = ["POP Cast", "Fiber Cast", "Slab", "Back Slab", "None"];
const BODY_PARTS     = ["Hand", "Wrist", "Forearm", "Elbow", "Humerus", "Shoulder", "Clavicle", "Finger", "Thumb", "Femur", "Tibia", "Fibula", "Ankle", "Foot", "Toe", "Knee", "Hip", "Spine", "Rib", "Other"];
const CAUSES         = ["Fall", "Road Accident", "Sports Injury", "Direct Blow", "Twist", "Pathological", "Other"];
const SIDES          = ["Right", "Left", "Both"];
const LEAVE_KEY      = "ortho_leave_dates";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const todayIso  = () => new Date().toISOString().slice(0, 10);
const addDays   = (base: string, n: number) => { const d = new Date(base); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const diffDays  = (a: string, b: string)    => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
const fmtDate   = (iso?: string | null)     => { if (!iso) return "—"; try { return new Date(iso).toLocaleDateString("hi-IN", { day:"2-digit", month:"short", year:"numeric" }); } catch { return iso; }};
const fmtShort  = (iso?: string | null)     => { if (!iso) return "—"; try { return new Date(iso).toLocaleDateString("hi-IN", { day:"2-digit", month:"short", weekday:"short" }); } catch { return iso; }};
const healPct   = (pDate?: string|null, fDays?: number) => { if (!pDate || !fDays) return 0; return Math.min(100, Math.max(0, Math.round((diffDays(pDate, todayIso()) / fDays) * 100))); };
const getLeaves = (): string[] => { try { return JSON.parse(localStorage.getItem(LEAVE_KEY) || "[]"); } catch { return []; }};
const setLeaveStore = (l: string[]) => localStorage.setItem(LEAVE_KEY, JSON.stringify(l));

// ─── SMS Templates ────────────────────────────────────────────────────────────
const tplFollowupReminder = (name: string, date: string) =>
  `नमस्ते ${name} जी 🙏\n\nआपका Follow-up ${fmtDate(date)} को है।\nकृपया समय पर पहुँचें।\n\nBalaji Ortho Care Center 🏥`;
const tplFollowupToday = (name: string) =>
  `नमस्ते ${name} जी 🙏\n\nआज आपका Follow-up है।\nकृपया सुबह 11:30 बजे तक पहुँचें।\n\nBalaji Ortho Care Center 🏥`;
const tplPrecaution = (name: string, bodyPart: string, nextDate: string) =>
  `नमस्ते ${name} जी 🙏\n\nआपके प्लास्टर की जानकारी:\nशरीर का हिस्सा: ${bodyPart || "—"}\nअगली विजिट: ${nextDate ? fmtDate(nextDate) : "—"}\n\nसावधानियां:\n✅ प्लास्टर गीला न होने दें\n✅ भारी वजन न उठाएं\n✅ सूजन पर तुरंत आएं\n✅ Follow-up जरूर करवाएं\n\nDr. Rathore\nBalaji Ortho Care Center 🏥`;
const tplRemoved = (name: string, bodyPart: string) =>
  `नमस्ते ${name} जी 🙏\n\nबधाई हो! 🎉\n\nआपका प्लास्टर (${bodyPart || "—"}) हटा दिया गया है।\n\nसावधानियां:\n✅ धीरे-धीरे चलें\n✅ भारी काम से बचें\n✅ जरूरत पड़े तो संपर्क करें\n\nस्वस्थ रहें 💪\nDr. Rathore\nBalaji Ortho Care Center 🏥`;
const tplLeave = (name: string, date: string) =>
  `नमस्ते ${name} जी 🙏\n\nDr. Rathore आज ${fmtDate(date)} को उपलब्ध नहीं हैं।\nनई Appointment के लिए संपर्क करें।\n\nअसुविधा के लिए खेद है 🙏\nBalaji Ortho Care Center 🏥`;
const tplLongLeave = (name: string, from: string, to: string) =>
  `नमस्ते ${name} जी 🙏\n\nDr. Rathore ${fmtDate(from)} से ${fmtDate(to)} तक उपलब्ध नहीं रहेंगे।\n\nआपकी सेवा में सदैव तत्पर हैं 🙏\nBalaji Ortho Care Center 🏥`;
const tplDietTips = (name: string, bodyPart: string) =>
  `नमस्ते ${name} जी 🙏\n\n${bodyPart} fracture के लिए Diet Tips:\n🥛 दूध, दही, पनीर खाएं\n🥦 हरी सब्जियां खाएं\n☀️ धूप लें (Vitamin D)\n🚫 धूम्रपान से बचें\n🚫 ज्यादा नमक से बचें\n\nजल्दी ठीक हों! 💪\nDr. Rathore\nBalaji Ortho Care Center 🏥`;
const tplCareInstructions = (name: string, bodyPart: string, nextDate: string) =>
  `नमस्ते ${name} जी 🙏\n\n${bodyPart} Plaster Care Instructions:\n\n✅ प्लास्टर गीला न होने दें\n✅ खुजली होने पर अंदर कुछ न डालें\n✅ सूजन बढ़े तो तुरंत आएं\n✅ उँगलियाँ नीली पड़ें तो आएं\n✅ भारी काम से बचें\n\nNext Visit: ${nextDate ? fmtDate(nextDate) : "—"}\n\nDr. Rathore\nBalaji Ortho Care Center 🏥`;

// ─── Heal Progress Bar ────────────────────────────────────────────────────────
function HealBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? "#10b981" : pct >= 50 ? "#3b82f6" : pct >= 25 ? "#f59e0b" : "#ef4444";
  const label = pct >= 80 ? "Almost healed!" : pct >= 50 ? "Good progress" : pct >= 25 ? "Healing..." : "Early stage";
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1" style={{ color: "#6b7280" }}>
        <span>{label}</span><span style={{ color, fontWeight: 600 }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: "#e5e7eb", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${color}80, ${color})`, borderRadius: 99, transition: "width 0.6s" }} />
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, gradient, textColor }: any) {
  return (
    <div style={{ borderRadius: 16, padding: "16px 18px", background: gradient, display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div>
        <p style={{ fontSize: 11, fontWeight: 500, color: textColor, opacity: 0.75, marginBottom: 2 }}>{label}</p>
        <p style={{ fontSize: 28, fontWeight: 800, color: textColor, lineHeight: 1 }}>{value}</p>
      </div>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHead({ icon, title, color, count }: { icon: string; title: string; color: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{icon}</div>
      <span style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>{title}</span>
      {count !== undefined && <span style={{ marginLeft: 4, background: color, color: "#fff", borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>{count}</span>}
    </div>
  );
}

// ─── Edit Dialog ──────────────────────────────────────────────────────────────
function EditDialog({ open, onClose, caseData }: { open: boolean; onClose: () => void; caseData: any }) {
  const updateCase = useUpdateFractureCase();
  const [form, setForm] = useState<any>({});
  useEffect(() => { if (open && caseData) setForm({ ...caseData }); }, [open, caseData]);
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const save = async () => {
    try {
      await updateCase.mutateAsync({ id: form.id, body_part: form.body_part, side: form.side, fracture_type: form.fracture_type, cause: form.cause, plaster_type: form.plaster_type, plaster_date: form.plaster_date, followup_days: Number(form.followup_days) || 7, next_followup_date: form.next_followup_date, doctor_notes: form.doctor_notes });
      toast.success("✅ Details update ho gayi!");
      onClose();
    } catch (e: any) { toast.error(e?.message || "Update fail"); }
  };
  if (!caseData) return null;
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}><Pencil className="h-4 w-4" style={{ color: "#6366f1" }} /> Edit — {caseData?.patients?.name}</DialogTitle></DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-2">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "4px 2px" }}>
            {[["Body Part", "body_part", BODY_PARTS], ["Side", "side", SIDES], ["Fracture Type", "fracture_type", FRACTURE_TYPES], ["Cause", "cause", CAUSES], ["Plaster Type", "plaster_type", PLASTER_TYPES]].map(([label, key, opts]: any) => (
              <div key={key}><Label className="text-xs">{label}</Label>
                <Select value={form[key] || ""} onValueChange={v => set(key, v)}>
                  <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{opts.map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
            <div><Label className="text-xs">Plaster Date</Label><Input type="date" className="h-9 mt-1 text-sm" value={form.plaster_date || ""} onChange={e => set("plaster_date", e.target.value)} /></div>
            <div><Label className="text-xs">Followup Days</Label><Input type="number" className="h-9 mt-1 text-sm" value={form.followup_days || ""} onChange={e => set("followup_days", e.target.value)} min={1} /></div>
            <div><Label className="text-xs">Next Followup Date</Label><Input type="date" className="h-9 mt-1 text-sm" value={form.next_followup_date || ""} onChange={e => set("next_followup_date", e.target.value)} /></div>
            <div className="col-span-2"><Label className="text-xs">Doctor Notes</Label><Textarea className="text-sm min-h-[60px] mt-1" value={form.doctor_notes || ""} onChange={e => set("doctor_notes", e.target.value)} /></div>
          </div>
        </ScrollArea>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={updateCase.isPending} style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
            {updateCase.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" />Save</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Patient Detail + SMS Dialog ──────────────────────────────────────────────
function DetailDialog({ open, onClose, caseData }: { open: boolean; onClose: () => void; caseData: any }) {
  const [customMsg, setCustomMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (kind: string, msg: string) => {
    const mob = caseData?.patients?.mobile || "";
    if (!mob) return toast.error("Mobile number nahi hai");
    setBusy(true);
    const r = await sendSMS(mob, msg, caseData?.patients?.name || "", kind);
    setBusy(false);
    toast[r.ok ? "success" : "error"](r.ok ? (r.queued ? "⏳ Queue mein — internet aane par jayega" : "✅ SMS bheja gaya") : "❌ SMS fail");
  };
  if (!caseData) return null;
  const name = caseData.patients?.name || "Patient";
  const bp = `${caseData.side || ""} ${caseData.body_part || ""}`.trim();
  const pct = healPct(caseData.plaster_date, caseData.followup_days);
  const dLeft = caseData.next_followup_date ? diffDays(todayIso(), caseData.next_followup_date) : null;
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Bone style={{ width: 20, height: 20, color: "#fff" }} />
              </div>
              <div><p style={{ fontWeight: 700, fontSize: 15 }}>{name}</p><p style={{ fontSize: 11, color: "#6b7280", fontWeight: 400 }}>{bp}</p></div>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[["Plaster", caseData.plaster_type || "—"], ["Fracture", caseData.fracture_type || "—"], ["Plaster Date", fmtDate(caseData.plaster_date)], ["Next FU", fmtDate(caseData.next_followup_date)]].map(([l, v]) => (
            <div key={l} style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px" }}>
              <p style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{l}</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{v}</p>
            </div>
          ))}
        </div>
        {dLeft !== null && (
          <div style={{ padding: "8px 12px", borderRadius: 10, marginBottom: 10, background: dLeft < 0 ? "#fef2f2" : dLeft === 0 ? "#fffbeb" : "#f0fdf4", border: `1px solid ${dLeft < 0 ? "#fecaca" : dLeft === 0 ? "#fde68a" : "#bbf7d0"}` }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: dLeft < 0 ? "#dc2626" : dLeft === 0 ? "#d97706" : "#16a34a" }}>
              {dLeft < 0 ? `⚠ ${Math.abs(dLeft)} din late!` : dLeft === 0 ? "🔔 Aaj follow-up hai!" : `✅ ${dLeft} din baaki`}
            </p>
          </div>
        )}
        <div style={{ marginBottom: 14 }}><HealBar pct={pct} /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
          <Phone style={{ width: 14, height: 14 }} />{caseData.patients?.mobile || "—"}
        </div>
        {/* SMS Buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          {[
            ["🔔 Followup Reminder", () => send("followup_reminder", tplFollowupReminder(name, caseData.next_followup_date || ""))],
            ["🛡 Precaution SMS", () => send("precaution", tplPrecaution(name, bp, caseData.next_followup_date || ""))],
            ["🥛 Diet Tips SMS", () => send("diet_tips", tplDietTips(name, bp))],
            ["📋 Care Instructions", () => send("care_instructions", tplCareInstructions(name, bp, caseData.next_followup_date || ""))],
          ].map(([label, fn]: any) => (
            <button key={label} disabled={busy} onClick={fn}
              style={{ padding: "9px 8px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#f8fafc", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Textarea value={customMsg} onChange={e => setCustomMsg(e.target.value)} placeholder="Custom SMS लिखें..." rows={2} className="text-sm flex-1" />
          <Button disabled={busy || !customMsg.trim()} onClick={() => send("custom", customMsg)} style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", alignSelf: "flex-end" }}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <DialogFooter className="pt-2"><Button variant="ghost" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Followup Done Dialog ─────────────────────────────────────────────────────
function FuDoneDialog({ open, onClose, caseData, onDone }: { open: boolean; onClose: () => void; caseData: any; onDone: (newDate: string, notes: string) => void }) {
  const [nextDays, setNextDays] = useState("7");
  const [notes, setNotes] = useState("");
  if (!caseData) return null;
  const newDate = addDays(todayIso(), Number(nextDays) || 7);
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg,#10b981,#059669)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CheckCircle2 style={{ width: 16, height: 16, color: "#fff" }} />
            </div>
            Followup Complete ✅
          </DialogTitle>
        </DialogHeader>
        <div style={{ background: "#f0fdf4", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <p style={{ fontWeight: 700, fontSize: 14 }}>{caseData.patients?.name}</p>
          <p style={{ fontSize: 12, color: "#6b7280" }}>{caseData.side} {caseData.body_part}</p>
        </div>
        <div style={{ marginBottom: 12 }}>
          <Label className="text-xs">अगला Followup — कितने दिन बाद?</Label>
          <Input type="number" value={nextDays} onChange={e => setNextDays(e.target.value)} min={1} className="h-9 mt-1" />
          <p style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>📅 Next date: <strong>{fmtDate(newDate)}</strong></p>
        </div>
        <div><Label className="text-xs">Visit Notes (optional)</Label>
          <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Is visit ke observations..." className="text-sm mt-1" />
        </div>
        <DialogFooter className="pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onDone(newDate, notes)} style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
            <Check className="h-4 w-4 mr-1" /> Complete & Next FU
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Analytics Section ────────────────────────────────────────────────────────
function AnalyticsSection({ cases }: { cases: any[] }) {
  const stats = useMemo(() => {
    const active = cases.filter(c => c.plaster_status === "Active");
    const done = cases.filter(c => c.plaster_status !== "Active");
    const bodyCount: Record<string, number> = {};
    const typeCount: Record<string, number> = {};
    cases.forEach(c => {
      if (c.body_part) bodyCount[c.body_part] = (bodyCount[c.body_part] || 0) + 1;
      if (c.fracture_type) typeCount[c.fracture_type] = (typeCount[c.fracture_type] || 0) + 1;
    });
    const topBody = Object.entries(bodyCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topType = Object.entries(typeCount).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const avgHeal = done.filter(c => c.plaster_date && c.next_followup_date).map(c => diffDays(c.plaster_date, c.next_followup_date)).reduce((a, b, _, arr) => a + b / arr.length, 0);
    return { total: cases.length, active: active.length, done: done.length, topBody, topType, avgHeal: Math.round(avgHeal) || 0 };
  }, [cases]);

  const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 16 }}>
      {/* Summary */}
      <div style={{ borderRadius: 16, border: "1.5px solid #e2e8f0", padding: 18, background: "#fff" }}>
        <SectionHead icon="📊" title="Overview" color="#6366f1" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[["Total Cases", stats.total, "#6366f1"], ["Active", stats.active, "#f59e0b"], ["Completed", stats.done, "#10b981"]].map(([l, v, c]: any) => (
            <div key={l} style={{ textAlign: "center", padding: "12px 8px", borderRadius: 12, background: `${c}10` }}>
              <p style={{ fontSize: 22, fontWeight: 800, color: c }}>{v}</p>
              <p style={{ fontSize: 10, color: "#6b7280", fontWeight: 500 }}>{l}</p>
            </div>
          ))}
        </div>
        {stats.avgHeal > 0 && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <p style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>⏱ Average Healing: {stats.avgHeal} days</p>
          </div>
        )}
      </div>

      {/* Top Body Parts */}
      <div style={{ borderRadius: 16, border: "1.5px solid #e2e8f0", padding: 18, background: "#fff" }}>
        <SectionHead icon="🦴" title="Common Fractures" color="#ec4899" />
        {stats.topBody.length === 0 ? <p style={{ fontSize: 12, color: "#9ca3af" }}>Data nahi hai abhi</p>
          : stats.topBody.map(([part, cnt], i) => (
            <div key={part} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{part}</span><span style={{ color: colors[i], fontWeight: 700 }}>{cnt}</span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: "#f1f5f9" }}>
                <div style={{ height: "100%", width: `${(cnt / stats.total) * 100}%`, background: colors[i], borderRadius: 99 }} />
              </div>
            </div>
          ))}
      </div>

      {/* Fracture Types */}
      <div style={{ borderRadius: 16, border: "1.5px solid #e2e8f0", padding: 18, background: "#fff" }}>
        <SectionHead icon="📈" title="Fracture Types" color="#f59e0b" />
        {stats.topType.length === 0 ? <p style={{ fontSize: 12, color: "#9ca3af" }}>Data nahi hai abhi</p>
          : stats.topType.map(([type, cnt], i) => (
            <div key={type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 10, background: `${colors[i]}10`, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{type}</span>
              <span style={{ fontSize: 12, color: colors[i], fontWeight: 700, background: `${colors[i]}20`, padding: "2px 10px", borderRadius: 99 }}>{cnt} cases</span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── Active Patient Card ───────────────────────────────────────────────────────
function ActiveCard({ c, onDetail, onEdit, onRemove, onFuDone }: any) {
  const today = todayIso();
  const pct = healPct(c.plaster_date, c.followup_days);
  const dLeft = c.next_followup_date ? diffDays(today, c.next_followup_date) : null;
  const isMissed = dLeft !== null && dLeft < 0;
  const isToday = dLeft === 0;
  const isSoon = dLeft !== null && dLeft > 0 && dLeft <= 2;

  const borderColor = isMissed ? "#ef4444" : isToday ? "#f59e0b" : isSoon ? "#6366f1" : "#e2e8f0";
  const bgColor = isMissed ? "#fef2f2" : isToday ? "#fffbeb" : isSoon ? "#eef2ff" : "#ffffff";

  return (
    <div style={{ borderRadius: 16, border: `2px solid ${borderColor}`, background: bgColor, padding: 16, transition: "box-shadow 0.2s", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.patients?.name}</p>
          <p style={{ fontSize: 11, color: "#6b7280" }}>{c.side} {c.body_part} · {c.plaster_type}</p>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {isMissed && <span style={{ fontSize: 10, fontWeight: 700, background: "#ef4444", color: "#fff", borderRadius: 99, padding: "2px 7px" }}>⚠ Late</span>}
          {isToday && <span style={{ fontSize: 10, fontWeight: 700, background: "#f59e0b", color: "#fff", borderRadius: 99, padding: "2px 7px" }}>Today</span>}
          {isSoon && !isMissed && !isToday && <span style={{ fontSize: 10, fontWeight: 700, background: "#6366f1", color: "#fff", borderRadius: 99, padding: "2px 7px" }}>{dLeft}d</span>}
        </div>
      </div>

      {/* Heal bar */}
      <div style={{ marginBottom: 10 }}><HealBar pct={pct} /></div>

      {/* Dates */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280", marginBottom: 12 }}>
        <span>📅 {fmtDate(c.plaster_date)}</span>
        <span style={{ color: isMissed ? "#ef4444" : isToday ? "#d97706" : "#374151", fontWeight: isMissed || isToday ? 700 : 400 }}>
          FU: {fmtDate(c.next_followup_date)}
        </span>
      </div>

      {/* Action Buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 6 }}>
        <button onClick={() => (isMissed || isToday) ? onFuDone(c) : onDetail(c)}
          style={{ padding: "7px 6px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#fff", background: isMissed || isToday ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          {isMissed || isToday ? <><CheckCircle2 style={{ width: 12, height: 12 }} />FU Done</> : <><MessageCircle style={{ width: 12, height: 12 }} />SMS</>}
        </button>
        {!(isMissed || isToday) ? null : (
          <button onClick={() => onDetail(c)} style={{ padding: "7px 10px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontSize: 11 }}>
            <MessageCircle style={{ width: 12, height: 12 }} />
          </button>
        )}
        <button onClick={() => onEdit(c)} style={{ padding: "7px 10px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#f8fafc", cursor: "pointer" }}>
          <Pencil style={{ width: 12, height: 12, color: "#6366f1" }} />
        </button>
        <button onClick={() => onRemove(c)} style={{ padding: "7px 10px", borderRadius: 10, border: "1.5px solid #fecaca", background: "#fef2f2", cursor: "pointer" }}>
          <PowerOff style={{ width: 12, height: 12, color: "#ef4444" }} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Ortho Page ──────────────────────────────────────────────────────────
export default function Ortho() {
  const today = todayIso();
  const { data: cases = [], refetch: refetchCases } = useFractureCases();
  const { data: followups = [], refetch: refetchFollowups } = useFollowupsAround();
  const addCase    = useAddFractureCase();
  const updateCase = useUpdateFractureCase();
  const addPatient = useAddPatient();

  // ── Form ──
  const [mobile, setMobile] = useState(""); const [name, setName] = useState(""); const [age, setAge] = useState(""); const [selPt, setSelPt] = useState<any>(null);
  const { data: hits = [] } = useSearchPatients(mobile.length >= 4 ? mobile : name.length >= 2 ? name : "");
  const [bodyPart, setBodyPart] = useState(""); const [side, setSide] = useState("Right"); const [fractureType, setFractureType] = useState(""); const [cause, setCause] = useState("");
  const [plasterType, setPlasterType] = useState("POP Cast"); const [plasterDate, setPlasterDate] = useState(today); const [followupDays, setFollowupDays] = useState("7"); const [notes, setNotes] = useState("");
  const nextFU = useMemo(() => addDays(plasterDate, Number(followupDays) || 7), [plasterDate, followupDays]);

  const resetForm = () => { setMobile(""); setName(""); setAge(""); setSelPt(null); setBodyPart(""); setSide("Right"); setFractureType(""); setCause(""); setPlasterType("POP Cast"); setPlasterDate(today); setFollowupDays("7"); setNotes(""); };

  const handleSave = async () => {
    if (!name || !mobile) return toast.error("Naam aur Mobile zaroori hai");
    if (!bodyPart || !fractureType) return toast.error("Body Part aur Fracture Type select karo");
    let patient = selPt;
    if (!patient) patient = await addPatient.mutateAsync({ name, mobile, age: age ? Number(age) : null } as any);
    try {
      await addCase.mutateAsync({ patient_id: patient.id, patient_type: "fracture", body_part: bodyPart, side, fracture_type: fractureType, cause: cause || null, plaster_type: plasterType, plaster_date: plasterDate, followup_days: Number(followupDays) || 7, next_followup_date: nextFU, plaster_status: "Active", doctor_notes: notes || null } as any);
      toast.success("✅ Case save ho gaya!");
      const r = await sendSMS(mobile, tplFollowupReminder(name, nextFU), name, "followup_reminder");
      if (r.ok) toast.success(r.queued ? "⏳ SMS queue mein" : "📱 SMS bheja gaya");
      resetForm(); refetchCases(); refetchFollowups();
    } catch (e: any) { toast.error(e?.message || "Save nahi hua"); }
  };

  // ── Stats ──
  const { active, todayFuList, missedFuList, completed } = useMemo(() => {
    const active = (cases as any[]).filter(c => c.plaster_status === "Active");
    const todayFuList = (followups as any[]).filter(c => c.next_followup_date === today);
    const missedFuList = (followups as any[]).filter(c => c.next_followup_date && c.next_followup_date < today && c.plaster_status === "Active");
    const completed = (cases as any[]).filter(c => c.plaster_status !== "Active");
    return { active, todayFuList, missedFuList, completed };
  }, [cases, followups, today]);

  // ── Filtered lists ──
  const [activeSearch, setActiveSearch] = useState("");
  const [compSearch, setCompSearch] = useState("");
  const activeCases = useMemo(() => {
    const list = (cases as any[]).filter(c => c.plaster_status === "Active");
    const q = activeSearch.toLowerCase();
    return q ? list.filter(c => (c.patients?.name || "").toLowerCase().includes(q) || (c.body_part || "").toLowerCase().includes(q)) : list;
  }, [cases, activeSearch]);
  const completedCases = useMemo(() => {
    const list = (cases as any[]).filter(c => c.plaster_status !== "Active");
    const q = compSearch.toLowerCase();
    return q ? list.filter(c => (c.patients?.name || "").toLowerCase().includes(q)) : list;
  }, [cases, compSearch]);

  // ── Dialogs ──
  const [editCase, setEditCase] = useState<any>(null);
  const [detailCase, setDetailCase] = useState<any>(null);
  const [removeTarget, setRemoveTarget] = useState<any>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [fuDoneCase, setFuDoneCase] = useState<any>(null);

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoveBusy(true);
    try {
      await updateCase.mutateAsync({ id: removeTarget.id, plaster_status: "Removed" } as any);
      const n = removeTarget.patients?.name || "Patient"; const mob = removeTarget.patients?.mobile || "";
      if (mob) { const r = await sendSMS(mob, tplRemoved(n, removeTarget.body_part || ""), n, "plaster_removed"); toast.success(r.ok ? (r.queued ? "⏳ SMS queue" : `✅ ${n} — Plaster removed, SMS bheja`) : "Plaster removed"); }
      else toast.success("✅ Plaster Removed");
      setRemoveTarget(null); refetchCases(); refetchFollowups();
    } catch (e: any) { toast.error(e?.message || "Update fail"); } finally { setRemoveBusy(false); }
  };

  const handleFuDone = async (newDate: string, fuNotes: string) => {
    if (!fuDoneCase) return;
    try {
      await updateCase.mutateAsync({ id: fuDoneCase.id, next_followup_date: newDate, doctor_notes: fuNotes || fuDoneCase.doctor_notes } as any);
      const n = fuDoneCase.patients?.name || ""; const mob = fuDoneCase.patients?.mobile || "";
      if (mob) await sendSMS(mob, tplFollowupReminder(n, newDate), n, "followup_reminder");
      toast.success(`✅ FU complete! Next: ${fmtDate(newDate)}`);
      setFuDoneCase(null); refetchCases(); refetchFollowups();
    } catch (e: any) { toast.error(e?.message || "Update fail"); }
  };

  // ── Calendar ──
  const next7 = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today]);
  const fuByDate = useMemo(() => { const m: Record<string, any[]> = {}; (followups as any[]).forEach(f => { if (f.next_followup_date) (m[f.next_followup_date] ||= []).push(f); }); return m; }, [followups]);
  const [todayBusy, setTodayBusy] = useState(false);
  const sendTodayReminders = async () => {
    if (!todayFuList.length) return toast.error("Aaj koi follow-up nahi");
    setTodayBusy(true); let sent = 0;
    for (const f of todayFuList) { const r = await sendSMS(f.patients?.mobile || "", tplFollowupToday(f.patients?.name || ""), f.patients?.name || "", "followup_today"); if (r.ok) sent++; }
    setTodayBusy(false); toast.success(`✅ ${sent}/${todayFuList.length} SMS bheje`);
  };

  // ── Leave ──
  const [leaves, setLeavesState] = useState<string[]>(getLeaves());
  const [leaveDate, setLeaveDate] = useState(today);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const leaveAffected = useMemo(() => (followups as any[]).filter(f => f.next_followup_date === leaveDate), [followups, leaveDate]);
  const saveLeaves = (l: string[]) => { setLeaveStore(l); setLeavesState(l); };
  const [longFrom, setLongFrom] = useState(today); const [longTo, setLongTo] = useState(addDays(today, 3)); const [longBusy, setLongBusy] = useState(false); const [longConfirm, setLongConfirm] = useState(false);
  const allActive = useMemo(() => (cases as any[]).filter(c => c.plaster_status === "Active"), [cases]);

  const sendLongLeave = async () => {
    setLongConfirm(false); setLongBusy(true); let sent = 0;
    for (const c of allActive) { const r = await sendSMS(c.patients?.mobile || "", tplLongLeave(c.patients?.name || "", longFrom, longTo), c.patients?.name || "", "long_leave"); if (r.ok) sent++; }
    const dates = new Set(leaves); for (let d = longFrom; d <= longTo; d = addDays(d, 1)) dates.add(d);
    saveLeaves([...dates]); setLongBusy(false); toast.success(`✅ ${sent} SMS bheje!`);
  };

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 4px" }}>

        {/* ── HEADER ── */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 50, height: 50, borderRadius: 16, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px #6366f140" }}>
              <Bone style={{ width: 26, height: 26, color: "#fff" }} />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Ortho / Fracture Panel
              </h1>
              <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>Balaji Ortho Care Center · Dr. Rathore</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 11, padding: "6px 14px", borderRadius: 99, background: "#f0fdf4", color: "#16a34a", fontWeight: 700, border: "1px solid #bbf7d0" }}>
              🟢 Offline Ready
            </span>
          </div>
        </div>

        {/* ── STATS ROW ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12, marginBottom: 20 }}>
          <StatCard icon="🦴" label="Active Plaster" value={active.length} gradient="linear-gradient(135deg,#6366f1,#8b5cf6)" textColor="#fff" />
          <StatCard icon="📅" label="Today FU" value={todayFuList.length} gradient="linear-gradient(135deg,#f59e0b,#d97706)" textColor="#fff" />
          <StatCard icon="⚠️" label="Missed FU" value={missedFuList.length} gradient="linear-gradient(135deg,#ef4444,#dc2626)" textColor="#fff" />
          <StatCard icon="✅" label="Completed" value={completed.length} gradient="linear-gradient(135deg,#10b981,#059669)" textColor="#fff" />
          <StatCard icon="📋" label="Total Cases" value={(cases as any[]).length} gradient="linear-gradient(135deg,#0ea5e9,#0284c7)" textColor="#fff" />
        </div>

        {/* ── ALERT BANNER ── */}
        {(todayFuList.length > 0 || missedFuList.length > 0) && (
          <div style={{ borderRadius: 14, padding: "12px 16px", marginBottom: 20, background: missedFuList.length > 0 ? "linear-gradient(135deg,#fef2f2,#fff7ed)" : "linear-gradient(135deg,#fffbeb,#fef9c3)", border: `1.5px solid ${missedFuList.length > 0 ? "#fca5a5" : "#fde68a"}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <BellRing style={{ width: 20, height: 20, color: missedFuList.length > 0 ? "#ef4444" : "#d97706", flexShrink: 0 }} />
              <div>
                {todayFuList.length > 0 && <p style={{ fontSize: 13, fontWeight: 700, color: "#92400e", margin: 0 }}>🔔 आज के {todayFuList.length} Follow-up हैं</p>}
                {missedFuList.length > 0 && <p style={{ fontSize: 12, color: "#dc2626", fontWeight: 600, margin: 0 }}>⚠ {missedFuList.length} Missed Follow-up — तुरंत ध्यान दें</p>}
              </div>
            </div>
            <button disabled={todayBusy || !todayFuList.length} onClick={sendTodayReminders}
              style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg,#f59e0b,#d97706)", display: "flex", alignItems: "center", gap: 6 }}>
              <Send style={{ width: 14, height: 14 }} /> आज Reminder SMS भेजें
            </button>
          </div>
        )}

        {/* ── TABS ── */}
        <Tabs defaultValue="patients">
          <TabsList style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", height: "auto", gap: 4, padding: 4, background: "#f1f5f9", borderRadius: 14, marginBottom: 20 }}>
            {[["patients","👥","Patients"],["entry","➕","New Entry"],["calendar","📅","Calendar"],["leave","✈️","Leave"],["completed","✅","Completed"],["analytics","📊","Analytics"]].map(([val, ic, lb]) => (
              <TabsTrigger key={val} value={val} style={{ borderRadius: 10, fontSize: 11, fontWeight: 600, padding: "8px 4px", gap: 4 }}>
                <span>{ic}</span><span className="hidden sm:inline">{lb}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── PATIENTS ── */}
          <TabsContent value="patients">
            <div style={{ marginBottom: 14 }}>
              <div style={{ position: "relative" }}>
                <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "#9ca3af" }} />
                <Input style={{ paddingLeft: 38 }} placeholder="Patient naam ya body part..." value={activeSearch} onChange={e => setActiveSearch(e.target.value)} />
              </div>
            </div>
            {activeCases.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#9ca3af" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🦴</div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{activeSearch ? "Koi match nahi" : "Koi active plaster patient nahi"}</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 14 }}>
                {activeCases.map((c: any) => (
                  <ActiveCard key={c.id} c={c} onDetail={setDetailCase} onEdit={setEditCase} onRemove={setRemoveTarget} onFuDone={setFuDoneCase} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── NEW ENTRY ── */}
          <TabsContent value="entry">
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ borderRadius: 16, border: "1.5px solid #e2e8f0", padding: 20, background: "#fff" }}>
                <SectionHead icon="👤" title="Patient Details" color="#6366f1" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                  <div><Label className="text-xs">Mobile *</Label><Input value={mobile} onChange={e => { setMobile(e.target.value.replace(/\D/g,"").slice(0,10)); setSelPt(null); }} placeholder="10 अंक" className="h-9 mt-1" /></div>
                  <div><Label className="text-xs">Patient का नाम *</Label><Input value={name} onChange={e => { setName(e.target.value); setSelPt(null); }} className="h-9 mt-1" /></div>
                  <div><Label className="text-xs">उम्र</Label><Input type="number" value={age} onChange={e => setAge(e.target.value)} className="h-9 mt-1" /></div>
                </div>
                {!selPt && (hits as any[]).length > 0 && (
                  <div style={{ marginTop: 8, border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", maxHeight: 160, overflowY: "auto" }}>
                    {(hits as any[]).slice(0,5).map((p: any) => (
                      <button key={p.id} onClick={() => { setSelPt(p); setName(p.name); setMobile(p.mobile || ""); setAge(String(p.age ?? "")); }}
                        style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid #f1f5f9" }}>
                        <span style={{ fontWeight: 600 }}>{p.name}</span><span style={{ color: "#6b7280" }}>{p.mobile}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selPt && <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 10, background: "#f0fdf4", fontSize: 12, color: "#16a34a", fontWeight: 600 }}>✓ Existing patient — {selPt.name}</div>}
              </div>

              <div style={{ borderRadius: 16, border: "1.5px solid #e2e8f0", padding: 20, background: "#fff" }}>
                <SectionHead icon="🦴" title="Fracture Details" color="#ec4899" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                  {[["Body Part *","bodyPart",BODY_PARTS,"Select",setBodyPart,bodyPart],["Side","side",SIDES,"Right",setSide,side],["Fracture Type *","ft",FRACTURE_TYPES,"Select",setFractureType,fractureType],["Cause","cause",CAUSES,"Optional",setCause,cause],["Plaster Type","pt",PLASTER_TYPES,"POP Cast",setPlasterType,plasterType]].map(([label,,opts,ph,setter,val]: any) => (
                    <div key={label}><Label className="text-xs">{label}</Label>
                      <Select value={val} onValueChange={setter}>
                        <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue placeholder={ph} /></SelectTrigger>
                        <SelectContent>{opts.map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  ))}
                  <div><Label className="text-xs">Plaster Date</Label><Input type="date" className="h-9 mt-1 text-sm" value={plasterDate} onChange={e => setPlasterDate(e.target.value)} /></div>
                  <div><Label className="text-xs">Follow-up Days</Label><Input type="number" className="h-9 mt-1 text-sm" value={followupDays} onChange={e => setFollowupDays(e.target.value)} min={1} /></div>
                  <div><Label className="text-xs">Next Follow-up (auto)</Label>
                    <div style={{ marginTop: 4, padding: "8px 12px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 13, fontWeight: 700, color: "#16a34a" }}>📅 {fmtDate(nextFU)}</div>
                  </div>
                  <div style={{ gridColumn: "1/-1" }}><Label className="text-xs">Doctor Notes</Label><Textarea rows={2} className="mt-1 text-sm" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional..." /></div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={handleSave} disabled={addCase.isPending}
                  style={{ padding: "11px 24px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px #6366f130" }}>
                  {addCase.isPending ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : <Save style={{ width: 16, height: 16 }} />}
                  Save & SMS भेजें
                </button>
                <button onClick={resetForm} style={{ padding: "11px 20px", borderRadius: 12, border: "1.5px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#374151" }}>Reset</button>
              </div>
            </div>
          </TabsContent>

          {/* ── CALENDAR ── */}
          <TabsContent value="calendar">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <SectionHead icon="📅" title="Next 7 Days Follow-ups" color="#0ea5e9" count={(followups as any[]).filter(f => next7.includes(f.next_followup_date)).length} />
              <button disabled={todayBusy || !todayFuList.length} onClick={sendTodayReminders}
                style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg,#f59e0b,#d97706)", display: "flex", alignItems: "center", gap: 6 }}>
                <Send style={{ width: 14, height: 14 }} /> आज Reminders ({todayFuList.length})
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 8, marginBottom: 20 }}>
              {next7.map(d => {
                const list = fuByDate[d] || [];
                const isLeave = leaves.includes(d);
                const isT = d === today;
                return (
                  <div key={d} style={{ borderRadius: 14, border: `2px solid ${isLeave ? "#fca5a5" : isT ? "#6366f1" : "#e2e8f0"}`, padding: "10px 8px", minHeight: 90, background: isLeave ? "#fef2f2" : isT ? "#eef2ff" : "#fff" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: isT ? "#6366f1" : "#374151", marginBottom: 6 }}>{fmtShort(d)}</div>
                    {isLeave && <span style={{ fontSize: 9, background: "#ef4444", color: "#fff", borderRadius: 99, padding: "1px 5px", fontWeight: 700 }}>Leave</span>}
                    {!isLeave && list.length === 0 && <p style={{ fontSize: 10, color: "#d1d5db" }}>—</p>}
                    {list.map((f: any) => (
                      <div key={f.id} style={{ fontSize: 10, background: "#f1f5f9", borderRadius: 6, padding: "4px 6px", marginBottom: 3 }}>
                        <p style={{ fontWeight: 700, margin: 0 }}>{(f.patients?.name || "").split(" ")[0]}</p>
                        <p style={{ color: "#6b7280", margin: 0 }}>{f.body_part}</p>
                      </div>
                    ))}
                    {list.length > 0 && <div style={{ marginTop: 4, fontSize: 9, fontWeight: 700, color: "#6366f1" }}>{list.length} FU</div>}
                  </div>
                );
              })}
            </div>

            {/* Missed FU */}
            {missedFuList.length > 0 && (
              <div style={{ borderRadius: 16, border: "2px solid #fca5a5", background: "#fef2f2", padding: 16 }}>
                <SectionHead icon="⚠️" title={`Missed Follow-ups (${missedFuList.length})`} color="#ef4444" />
                <div style={{ display: "grid", gap: 8 }}>
                  {missedFuList.map((f: any) => (
                    <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 12, background: "#fff", border: "1px solid #fecaca", gap: 12 }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>{f.patients?.name}</p>
                        <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>{f.side} {f.body_part} · था: {fmtDate(f.next_followup_date)}</p>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setFuDoneCase(f)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg,#10b981,#059669)", display: "flex", alignItems: "center", gap: 4 }}>
                          <CheckCircle2 style={{ width: 12, height: 12 }} />FU Done
                        </button>
                        <button onClick={() => setDetailCase(f)} style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#f8fafc", cursor: "pointer" }}>
                          <MessageCircle style={{ width: 13, height: 13, color: "#6366f1" }} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── LEAVE ── */}
          <TabsContent value="leave">
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ borderRadius: 16, border: "1.5px solid #e2e8f0", padding: 20, background: "#fff" }}>
                <SectionHead icon="✈️" title="Single Day Leave" color="#f59e0b" />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 160 }}><Label className="text-xs">Leave Date</Label><Input type="date" className="h-9 mt-1" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} /></div>
                  <button onClick={() => { saveLeaves([...new Set([...leaves, leaveDate])]); toast.success("Leave mark ho gayi"); }} style={{ padding: "8px 16px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontSize: 13, fontWeight: 600, height: 36 }}>Mark Leave</button>
                  <button disabled={leaveBusy || !leaveAffected.length} onClick={async () => { setLeaveBusy(true); let sent = 0; for (const f of leaveAffected) { const r = await sendSMS(f.patients?.mobile||"", tplLeave(f.patients?.name||"", leaveDate), f.patients?.name||"", "leave"); if(r.ok) sent++; } saveLeaves([...new Set([...leaves,leaveDate])]); setLeaveBusy(false); toast.success(`✅ ${sent}/${leaveAffected.length} SMS`); }}
                    style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg,#f59e0b,#d97706)", display: "flex", alignItems: "center", gap: 6, height: 36 }}>
                    <Send style={{ width: 14, height: 14 }} /> SMS भेजें ({leaveAffected.length})
                  </button>
                </div>
                {leaveAffected.length > 0 && (
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
                    {leaveAffected.map((f: any) => (
                      <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #f1f5f9" }}>
                        <div><p style={{ fontWeight: 600, fontSize: 13, margin: 0 }}>{f.patients?.name}</p><p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>{f.patients?.mobile} · {f.body_part}</p></div>
                        <button onClick={() => sendSMS(f.patients?.mobile||"", tplLeave(f.patients?.name||"", leaveDate), f.patients?.name||"", "leave").then(r => toast[r.ok?"success":"error"](r.ok?`✅ SMS — ${f.patients?.name}`:"❌ fail"))}
                          style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                          <Send style={{ width: 11, height: 11 }} />SMS
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {leaves.length > 0 && (
                  <div><p style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>Marked Leaves:</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {leaves.sort().map(d => (
                        <span key={d} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 99, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 12, fontWeight: 600 }}>
                          {fmtDate(d)}
                          <button onClick={() => saveLeaves(leaves.filter(x => x !== d))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", lineHeight: 1 }}>×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ borderRadius: 16, border: "1.5px solid #e2e8f0", padding: 20, background: "#fff" }}>
                <SectionHead icon="📤" title="Long Leave / Bulk SMS" color="#6366f1" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div><Label className="text-xs">From</Label><Input type="date" className="h-9 mt-1" value={longFrom} onChange={e => setLongFrom(e.target.value)} /></div>
                  <div><Label className="text-xs">To</Label><Input type="date" className="h-9 mt-1" value={longTo} onChange={e => setLongTo(e.target.value)} /></div>
                </div>
                <p style={{ fontSize: 13, marginBottom: 10 }}>Active Plaster Patients: <strong>{allActive.length}</strong></p>
                <button disabled={longBusy || !allActive.length} onClick={() => setLongConfirm(true)}
                  style={{ padding: "10px 20px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", gap: 8 }}>
                  <Send style={{ width: 15, height: 15 }} /> सभी Active को Bulk SMS
                </button>
              </div>
            </div>
          </TabsContent>

          {/* ── COMPLETED ── */}
          <TabsContent value="completed">
            <div style={{ marginBottom: 12 }}>
              <div style={{ position: "relative" }}>
                <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "#9ca3af" }} />
                <Input style={{ paddingLeft: 38 }} placeholder="Search completed patients..." value={compSearch} onChange={e => setCompSearch(e.target.value)} />
              </div>
            </div>
            {completedCases.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#9ca3af" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <p style={{ fontSize: 14 }}>Koi completed case nahi abhi</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {completedCases.map((c: any) => (
                  <div key={c.id} style={{ borderRadius: 14, border: "1.5px solid #bbf7d0", background: "linear-gradient(135deg,#f0fdf4,#fff)", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#10b981,#059669)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <CheckCircle2 style={{ width: 18, height: 18, color: "#fff" }} />
                      </div>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>{c.patients?.name}</p>
                        <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>{c.side} {c.body_part} · {c.plaster_type} · {fmtDate(c.plaster_date)}</p>
                      </div>
                    </div>
                    <span style={{ fontSize: 11, padding: "4px 12px", borderRadius: 99, background: "#dcfce7", color: "#16a34a", fontWeight: 700, flexShrink: 0 }}>Removed ✓</span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── ANALYTICS ── */}
          <TabsContent value="analytics">
            <AnalyticsSection cases={cases as any[]} />
          </TabsContent>
        </Tabs>
      </div>

      {/* ── DIALOGS ── */}
      <EditDialog open={!!editCase} onClose={() => setEditCase(null)} caseData={editCase} />
      <DetailDialog open={!!detailCase} onClose={() => setDetailCase(null)} caseData={detailCase} />
      <FuDoneDialog open={!!fuDoneCase} onClose={() => setFuDoneCase(null)} caseData={fuDoneCase} onDone={handleFuDone} />

      <AlertDialog open={!!removeTarget} onOpenChange={v => !v && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Plaster Remove करें? 🏥</AlertDialogTitle>
            <AlertDialogDescription><strong>{removeTarget?.patients?.name}</strong> का <strong>{removeTarget?.body_part}</strong> plaster Removed mark होगा और SMS भेजा जाएगा।</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={removeBusy} style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
              {removeBusy ? "Processing..." : "✅ Remove & SMS"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={longConfirm} onOpenChange={setLongConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk SMS Confirm?</AlertDialogTitle>
            <AlertDialogDescription>{allActive.length} active patients को SMS जाएगा कि Dr. Rathore {fmtDate(longFrom)} से {fmtDate(longTo)} तक unavailable हैं।</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={sendLongLeave} disabled={longBusy}>Send SMS</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
