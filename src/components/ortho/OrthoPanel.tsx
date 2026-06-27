import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Bone, CalendarClock, AlertTriangle, Plus,
  MessageCircle, Search, Send, MessageSquare,
  CheckSquare, Square, Loader2, Pencil, CheckCircle2,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { useFollowupsAround, useFractureCases, useUpdateFractureCase } from "@/hooks/useOrtho";
import { useNavigate } from "react-router-dom";
import { useMemo, useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { sendSMS } from "@/services/smsService";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

const todayStr = () => new Date().toISOString().slice(0, 10);
const tomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

function fmtDate(d?: string | null) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("hi-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
}

function fmtDateHindi(d?: string | null) {
  if (!d) return "-";
  try { return new Date(d).toLocaleDateString("hi-IN"); } catch { return d; }
}

// ──────────────────────────────────────────────
// SMS Dialog (unchanged)
// ──────────────────────────────────────────────
type SmsPatient = {
  id: string;
  name: string;
  mobile: string;
  body_part: string | null;
  side: string | null;
  next_followup_date: string | null;
};

const DEFAULT_TEMPLATE =
  `नमस्ते {{naam}},\n\nBalaji Ortho Care Center से सूचना:\n\n{{message}}\n\nधन्यवाद 🙏`;

function resolveTemplate(template: string, patient: SmsPatient, customBody: string) {
  return template
    .replace(/{{naam}}/g, patient.name)
    .replace(/{{mobile}}/g, patient.mobile)
    .replace(/{{body_part}}/g, `${patient.side || ""} ${patient.body_part || ""}`.trim() || "-")
    .replace(/{{followup}}/g, fmtDateHindi(patient.next_followup_date))
    .replace(/{{message}}/g, customBody);
}

interface CustomSmsDialogProps {
  open: boolean;
  onClose: () => void;
  patients: SmsPatient[];
}

function CustomSmsDialog({ open, onClose, patients }: CustomSmsDialogProps) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customBody, setCustomBody] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<{ name: string; ok: boolean; queued: boolean }[]>([]);
  const [step, setStep] = useState<"compose" | "done">("compose");

  const handleOpenChange = useCallback(
    (val: boolean) => {
      if (!val) {
        setSelected(new Set());
        setCustomBody("");
        setResults([]);
        setStep("compose");
        onClose();
      }
    },
    [onClose],
  );

  const allSelected = selected.size === patients.length && patients.length > 0;
  const toggleAll = () => { if (allSelected) setSelected(new Set()); else setSelected(new Set(patients.map((p) => p.id))); };
  const toggleOne = (id: string) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const previewPatient = patients.find((p) => selected.has(p.id));
  const preview = previewPatient ? resolveTemplate(DEFAULT_TEMPLATE, previewPatient, customBody) : null;

  const handleSend = async () => {
    if (!customBody.trim()) { toast({ title: "Message likh please", description: "SMS message khali hai.", variant: "destructive" }); return; }
    if (selected.size === 0) { toast({ title: "Patient select karo", description: "Koi patient selected nahi.", variant: "destructive" }); return; }
    setSending(true);
    const targetPatients = patients.filter((p) => selected.has(p.id));
    const res: { name: string; ok: boolean; queued: boolean }[] = [];
    for (const p of targetPatients) {
      const msg = resolveTemplate(DEFAULT_TEMPLATE, p, customBody);
      const r = await sendSMS(p.mobile, msg, p.name, "ortho_custom");
      res.push({ name: p.name, ok: r.ok, queued: r.queued });
    }
    setSending(false);
    setResults(res);
    setStep("done");
    const sentCount = res.filter((r) => r.ok && !r.queued).length;
    const queuedCount = res.filter((r) => r.queued).length;
    toast({
      title: queuedCount > 0 ? `SMS: ${sentCount} भेजे, ${queuedCount} pending` : `SMS भेजे: ${sentCount}/${res.length}`,
      description: queuedCount > 0 ? "Internet aane par baaki SMS automatically bhej diye jayenge 🎉" : "सभी successfully भेजे गए 🎉",
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Custom SMS — Ortho Patients
          </DialogTitle>
        </DialogHeader>

        {step === "compose" ? (
          <>
            <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Patients ({patients.length})</p>
                <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={toggleAll}>
                  {allSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                  {allSelected ? "Deselect All" : "Select All"}
                </Button>
              </div>
              <ScrollArea className="h-44 border rounded-md p-2">
                {patients.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">कोई active plaster patient नहीं।</p>}
                <div className="space-y-1">
                  {patients.map((p) => (
                    <div key={p.id} className={`flex items-center gap-3 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${selected.has(p.id) ? "bg-primary/10" : "hover:bg-muted"}`} onClick={() => toggleOne(p.id)}>
                      <Checkbox id={`sms-pt-${p.id}`} checked={selected.has(p.id)} onCheckedChange={() => toggleOne(p.id)} onClick={(e) => e.stopPropagation()} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.mobile} &middot; {`${p.side || ""} ${p.body_part || ""}`.trim() || "-"}</p>
                      </div>
                      {p.next_followup_date && <span className="text-xs text-muted-foreground shrink-0">FU: {fmtDateHindi(p.next_followup_date)}</span>}
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="space-y-1">
                <Label className="text-sm font-medium">Custom Message <span className="text-xs text-muted-foreground font-normal">(Variables: {"{{"}naam{"}}"}, {"{{"}followup{"}}"}, {"{{"}body_part{"}}"} )</span></Label>
                <Textarea placeholder="यहाँ अपना message लिखें..." className="min-h-[80px] text-sm" value={customBody} onChange={(e) => setCustomBody(e.target.value)} />
              </div>
              {preview && customBody.trim() && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs font-semibold text-primary mb-1 uppercase tracking-wide">Preview ({previewPatient?.name})</p>
                  <pre className="text-xs whitespace-pre-wrap font-sans text-foreground">{preview}</pre>
                </div>
              )}
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSend} disabled={sending || selected.size === 0 || !customBody.trim()} className="gap-2">
                {sending ? <><Loader2 className="h-4 w-4 animate-spin" />Sending...</> : <><Send className="h-4 w-4" />Send to {selected.size} Patient{selected.size !== 1 ? "s" : ""}</>}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <ScrollArea className="flex-1 max-h-64">
              <div className="space-y-1 p-1">
                {results.map((r, i) => (
                  <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-md text-sm ${r.queued ? "bg-amber-50 dark:bg-amber-950/20" : "bg-green-50 dark:bg-green-950/20"}`}>
                    <span>{r.name}</span>
                    <Badge variant={r.queued ? "secondary" : "default"}>{r.queued ? "⏳ Pending" : "✓ Sent"}</Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <DialogFooter><Button onClick={() => handleOpenChange(false)}>Close</Button></DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────
// Edit Dialog — Active Plaster Patient
// ──────────────────────────────────────────────
const BODY_PARTS = ["Wrist", "Forearm", "Elbow", "Humerus", "Shoulder", "Clavicle", "Finger", "Thumb", "Hand", "Femur", "Tibia", "Fibula", "Ankle", "Foot", "Toe", "Knee", "Hip", "Pelvis", "Spine", "Rib", "Skull", "Other"];
const SIDES = ["Right", "Left", "Both", "N/A"];
const FRACTURE_TYPES = ["Closed", "Open", "Comminuted", "Greenstick", "Stress", "Hairline", "Spiral", "Oblique", "Transverse", "Other"];
const PLASTER_TYPES = ["POP Cast", "Fiber Cast", "Splint", "Back Slab", "U-Slab", "Functional Brace", "Other"];
const CAUSES = ["Fall", "Road Accident", "Sports Injury", "Direct Blow", "Twist", "Pathological", "Other"];

interface EditCaseDialogProps {
  open: boolean;
  onClose: () => void;
  caseData: any;
}

function EditCaseDialog({ open, onClose, caseData }: EditCaseDialogProps) {
  const { toast } = useToast();
  const updateCase = useUpdateFractureCase();
  const [form, setForm] = useState<any>({});

  // Initialize form when dialog opens
  useEffect(() => {
    if (open && caseData) setForm({ ...caseData });
  }, [open, caseData]);

  const handleOpenChange = useCallback((val: boolean) => {
    if (!val) { setForm({}); onClose(); }
  }, [onClose]);

  const set = (key: string, val: any) => setForm((prev: any) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!form.id) {
      toast({ title: "Error", description: "Case ID nahi mila. Dobara try karo.", variant: "destructive" });
      return;
    }
    try {
      await updateCase.mutateAsync({
        id: form.id,
        body_part: form.body_part || null,
        side: form.side || null,
        fracture_type: form.fracture_type || null,
        cause: form.cause || null,
        plaster_type: form.plaster_type || null,
        plaster_date: form.plaster_date || null,
        followup_days: Number(form.followup_days) || 7,
        next_followup_date: form.next_followup_date || null,
        doctor_notes: form.doctor_notes || null,
        hospital_name: form.hospital_name || null,
        doctor_name: form.doctor_name || null,
        plaster_status: form.plaster_status || "Active",
      });
      toast({ title: "✅ Update ho gaya!", description: "Patient ki details save ho gayi." });
      handleOpenChange(false);
    } catch (e: any) {
      toast({ title: "❌ Save nahi hua", description: e?.message || "Server se connect nahi ho paya. Internet check karo.", variant: "destructive" });
    }
  };

  if (!caseData) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Edit — {caseData?.patients?.name || "Patient"}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-3 p-1">
            {/* Body Part + Side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Body Part</Label>
                <Select value={form.body_part || ""} onValueChange={(v) => set("body_part", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{BODY_PARTS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Side</Label>
                <Select value={form.side || ""} onValueChange={(v) => set("side", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{SIDES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Fracture Type + Cause */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Fracture Type</Label>
                <Select value={form.fracture_type || ""} onValueChange={(v) => set("fracture_type", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{FRACTURE_TYPES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Cause</Label>
                <Select value={form.cause || ""} onValueChange={(v) => set("cause", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{CAUSES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Plaster Type + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Plaster Type</Label>
                <Select value={form.plaster_type || ""} onValueChange={(v) => set("plaster_type", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{PLASTER_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Plaster Date</Label>
                <Input type="date" className="h-9 text-sm" value={form.plaster_date || ""} onChange={(e) => set("plaster_date", e.target.value)} />
              </div>
            </div>

            {/* Followup days + Next followup */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Followup Days</Label>
                <Input type="number" className="h-9 text-sm" value={form.followup_days || ""} onChange={(e) => set("followup_days", e.target.value)} min={1} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Next Followup Date</Label>
                <Input type="date" className="h-9 text-sm" value={form.next_followup_date || ""} onChange={(e) => set("next_followup_date", e.target.value)} />
              </div>
            </div>

            {/* Hospital + Doctor */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Hospital</Label>
                <Input className="h-9 text-sm" value={form.hospital_name || ""} onChange={(e) => set("hospital_name", e.target.value)} placeholder="Hospital naam..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Doctor</Label>
                <Input className="h-9 text-sm" value={form.doctor_name || ""} onChange={(e) => set("doctor_name", e.target.value)} placeholder="Doctor naam..." />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Doctor Notes</Label>
              <Textarea className="text-sm min-h-[70px]" value={form.doctor_notes || ""} onChange={(e) => set("doctor_notes", e.target.value)} placeholder="कोई notes..." />
            </div>
          </div>
        </ScrollArea>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateCase.isPending} className="gap-2">
            {updateCase.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : "✅ Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────
// Group cases by plaster_date (for date-wise display)
// ──────────────────────────────────────────────
function groupByDate(cases: any[], dateKey: string) {
  const groups: Record<string, any[]> = {};
  for (const c of cases) {
    const d = c[dateKey]?.slice(0, 10) || "Unknown";
    if (!groups[d]) groups[d] = [];
    groups[d].push(c);
  }
  // Sort dates descending (newest first)
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

// ──────────────────────────────────────────────
// Active Patient Row
// ──────────────────────────────────────────────
function ActivePatientRow({ c, onEdit }: { c: any; onEdit: (c: any) => void }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors border border-border/40">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{c.patients?.name || "—"}</p>
        <p className="text-xs text-muted-foreground">
          {[c.side, c.body_part].filter(Boolean).join(" ")} · {c.plaster_type || "-"}
          {c.next_followup_date && <> · FU: {fmtDate(c.next_followup_date)}</>}
        </p>
      </div>
      <Button size="sm" variant="ghost" className="gap-1 text-xs h-7 px-2 ml-2 shrink-0" onClick={() => onEdit(c)}>
        <Pencil className="h-3 w-3" /> Edit
      </Button>
    </div>
  );
}

// ──────────────────────────────────────────────
// Completed Patient Row
// ──────────────────────────────────────────────
function CompletedPatientRow({ c }: { c: any }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-green-50/50 dark:bg-green-950/10 border border-green-200/40">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-muted-foreground">{c.patients?.name || "—"}</p>
        <p className="text-xs text-muted-foreground">
          {[c.side, c.body_part].filter(Boolean).join(" ")} · {c.plaster_type || "-"}
        </p>
      </div>
      <Badge variant="secondary" className="text-[10px] shrink-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Removed
      </Badge>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main OrthoPanel
// ──────────────────────────────────────────────
export function OrthoPanel() {
  const navigate = useNavigate();
  const { data: cases } = useFractureCases();
  const { data: followups } = useFollowupsAround();
  const [calOpen, setCalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);
  const [editCase, setEditCase] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  const { activePlaster, todayFu, missedFu, tomorrowFu } = useMemo(() => {
    const t = todayStr();
    const tm = tomorrowStr();
    const activePlaster = (cases || []).filter((c: any) => c.plaster_status === "Active").length;
    const list = followups || [];
    const todayFu = list.filter((c: any) => c.next_followup_date === t);
    const tomorrowFu = list.filter((c: any) => c.next_followup_date === tm);
    const missedFu = list.filter((c: any) => c.next_followup_date && c.next_followup_date < t && c.plaster_status === "Active");
    return { activePlaster, todayFu, missedFu, tomorrowFu };
  }, [cases, followups]);

  // Active patients — sorted newest first, then filtered by search
  const activeCases = useMemo(() => {
    const filtered = (cases || []).filter((c: any) => c.plaster_status === "Active");
    if (!search.trim()) return filtered;
    const s = search.toLowerCase();
    return filtered.filter((c: any) =>
      (c.patients?.name || "").toLowerCase().includes(s) ||
      (c.body_part || "").toLowerCase().includes(s) ||
      (c.side || "").toLowerCase().includes(s)
    );
  }, [cases, search]);

  // Completed patients — sorted newest first
  const completedCases = useMemo(() => {
    return (cases || []).filter((c: any) => c.plaster_status !== "Active");
  }, [cases]);

  // Group by plaster_date descending
  const activeGroups = useMemo(() => groupByDate(activeCases, "plaster_date"), [activeCases]);
  const completedGroups = useMemo(() => groupByDate(completedCases, "plaster_date"), [completedCases]);

  // Calendar
  const calendarDays = useMemo(() => {
    const days: { date: string; count: number; items: any[] }[] = [];
    for (let i = -3; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().slice(0, 10);
      const items = (followups || []).filter((c: any) => c.next_followup_date === ds);
      days.push({ date: ds, count: items.length, items });
    }
    return days;
  }, [followups]);

  const dayItems = selectedDate ? calendarDays.find((d) => d.date === selectedDate)?.items || [] : [];

  const smsPatients: SmsPatient[] = useMemo(() => {
    return (cases || [])
      .filter((c: any) => c.plaster_status === "Active" && c.patients?.mobile && c.patients?.name)
      .map((c: any) => ({ id: c.id, name: c.patients.name, mobile: c.patients.mobile, body_part: c.body_part, side: c.side, next_followup_date: c.next_followup_date }));
  }, [cases]);

  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-heading font-semibold flex items-center gap-2">
          <Bone className="h-5 w-5 text-primary" />
          🦴 Ortho Panel
        </h2>
        <Button size="sm" onClick={() => navigate("/ortho")} className="gap-1">
          <Plus className="h-4 w-4" /> New Fracture Entry
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-primary/20">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active Plaster</p>
            <p className="text-2xl font-bold text-primary">{activePlaster}</p>
          </CardContent>
        </Card>
        <Card className="border-info/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Today Follow-ups</p>
            <p className="text-2xl font-bold text-info">{todayFu.length}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Missed Follow-ups</p>
            <p className="text-2xl font-bold text-destructive">{missedFu.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Follow-up Alerts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            Follow-up Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FuList title="आज" items={todayFu} tone="info" />
          <FuList title="कल" items={tomorrowFu} tone="muted" />
          <FuList title="Missed" items={missedFu} tone="destructive" icon={<AlertTriangle className="h-3 w-3" />} />
          {!todayFu.length && !tomorrowFu.length && !missedFu.length && (
            <p className="text-sm text-muted-foreground text-center py-2">No upcoming or missed follow-ups</p>
          )}
        </CardContent>
      </Card>

      {/* ✅ ACTIVE PLASTER PATIENTS — Date-wise, Newest First */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <Bone className="h-4 w-4 text-primary" />
            Active Plaster Patients
            <Badge className="ml-auto text-xs">{activeCases.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Patient ya body part search karo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {activeCases.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {search ? "Koi match nahi mila." : "Abhi koi active plaster patient nahi."}
            </p>
          )}

          {/* Date groups */}
          <div className="space-y-4">
            {activeGroups.map(([date, group]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    📅 {fmtDate(date)}
                  </span>
                  <span className="text-xs text-muted-foreground">({group.length} patient{group.length !== 1 ? "s" : ""})</span>
                </div>
                <div className="space-y-1.5">
                  {group.map((c: any) => (
                    <ActivePatientRow key={c.id} c={c} onEdit={setEditCase} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ✅ COMPLETED / REMOVED PLASTER — Alag Section */}
      <Card className="border-green-200/50">
        <CardHeader className="pb-2">
          <button
            className="flex items-center justify-between w-full text-left"
            onClick={() => setShowCompleted((v) => !v)}
          >
            <CardTitle className="text-base font-heading flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Completed Plaster Removed
              <Badge variant="secondary" className="ml-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                {completedCases.length}
              </Badge>
            </CardTitle>
            {showCompleted ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
        </CardHeader>
        {showCompleted && (
          <CardContent className="space-y-4">
            {completedCases.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Koi completed patient nahi abhi.</p>
            )}
            {completedGroups.map(([date, group]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-green-700 bg-green-100 dark:bg-green-900/20 dark:text-green-400 px-2 py-0.5 rounded-full">
                    ✅ {fmtDate(date)}
                  </span>
                  <span className="text-xs text-muted-foreground">({group.length} patient{group.length !== 1 ? "s" : ""})</span>
                </div>
                <div className="space-y-1.5">
                  {group.map((c: any) => (
                    <CompletedPatientRow key={c.id} c={c} />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      {/* Mini Calendar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-heading">📅 Follow-up Calendar (next 14 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1.5">
            {calendarDays.map((d) => {
              const isToday = d.date === todayStr();
              const isPast = d.date < todayStr();
              return (
                <button
                  key={d.date}
                  onClick={() => { setSelectedDate(d.date); setCalOpen(true); }}
                  className={`aspect-square rounded-md border text-xs flex flex-col items-center justify-center transition-colors ${isToday ? "border-primary bg-primary/10" : isPast && d.count ? "border-destructive/40 bg-destructive/5" : "border-border hover:bg-muted"}`}
                >
                  <span className="font-medium">{Number(d.date.slice(8, 10))}</span>
                  {d.count > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px] mt-0.5">{d.count}</Badge>}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-heading">⚡ Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <Button variant="outline" onClick={() => navigate("/ortho")} className="gap-2 justify-start">
            <Plus className="h-4 w-4" /> New Fracture Entry
          </Button>
          <Button variant="outline" onClick={() => navigate("/whatsapp")} className="gap-2 justify-start">
            <MessageCircle className="h-4 w-4" /> Send WhatsApp
          </Button>
          <Button variant="outline" onClick={() => navigate("/opd")} className="gap-2 justify-start">
            <Search className="h-4 w-4" /> Search Patient
          </Button>
          <Button variant="outline" onClick={() => setSmsOpen(true)} className="gap-2 justify-start border-primary/40 text-primary hover:bg-primary/10">
            <MessageSquare className="h-4 w-4" />
            Custom SMS
            {smsPatients.length > 0 && <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1">{smsPatients.length}</Badge>}
          </Button>
        </CardContent>
      </Card>

      {/* Calendar Dialog */}
      <Dialog open={calOpen} onOpenChange={setCalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Follow-ups on {selectedDate ? new Date(selectedDate).toLocaleDateString() : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-auto">
            {!dayItems.length && <p className="text-sm text-muted-foreground text-center py-4">No follow-ups</p>}
            {dayItems.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{c.patients?.name}</p>
                  <p className="text-xs text-muted-foreground">{c.side} {c.body_part} · {c.plaster_type}</p>
                </div>
                <Badge variant="outline">{c.plaster_status}</Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* SMS Dialog */}
      <CustomSmsDialog open={smsOpen} onClose={() => setSmsOpen(false)} patients={smsPatients} />

      {/* ✅ Edit Dialog */}
      <EditCaseDialog
        open={!!editCase}
        onClose={() => setEditCase(null)}
        caseData={editCase}
      />
    </div>
  );
}

function FuList({ title, items, tone, icon }: { title: string; items: any[]; tone: "info" | "destructive" | "muted"; icon?: React.ReactNode }) {
  if (!items.length) return null;
  const toneCls = tone === "info" ? "text-info" : tone === "destructive" ? "text-destructive" : "text-muted-foreground";
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 flex items-center gap-1 ${toneCls}`}>
        {icon}{title} ({items.length})
      </p>
      <div className="space-y-1">
        {items.slice(0, 4).map((c: any) => (
          <div key={c.id} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/50">
            <span className="font-medium">{c.patients?.name}</span>
            <span className="text-xs text-muted-foreground">{c.side} {c.body_part}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
