import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Bone, CalendarClock, AlertTriangle, Plus,
  MessageCircle, Search, Send, MessageSquare,
  CheckSquare, Square, Loader2,
} from "lucide-react";
import { useFollowupsAround, useFractureCases } from "@/hooks/useOrtho";
import { useNavigate } from "react-router-dom";
import { useMemo, useState, useCallback } from "react";
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

// ──────────────────────────────────────────────
// Custom SMS Dialog
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

function fmtDateHindi(d?: string | null) {
  if (!d) return "-";
  try { return new Date(d).toLocaleDateString("hi-IN"); } catch { return d; }
}

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
  const [results, setResults] = useState<{ name: string; ok: boolean }[]>([]);
  const [step, setStep] = useState<"compose" | "done">("compose");

  // Reset on open
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

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(patients.map((p) => p.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Live preview for first selected patient
  const previewPatient = patients.find((p) => selected.has(p.id));
  const preview = previewPatient
    ? resolveTemplate(DEFAULT_TEMPLATE, previewPatient, customBody)
    : null;

  const handleSend = async () => {
    if (!customBody.trim()) {
      toast({ title: "Message likh please", description: "SMS message khali hai.", variant: "destructive" });
      return;
    }
    if (selected.size === 0) {
      toast({ title: "Patient select karo", description: "Koi patient selected nahi.", variant: "destructive" });
      return;
    }
    setSending(true);
    const targetPatients = patients.filter((p) => selected.has(p.id));
    const res: { name: string; ok: boolean }[] = [];
    for (const p of targetPatients) {
      const msg = resolveTemplate(DEFAULT_TEMPLATE, p, customBody);
      const ok = await sendSMS(p.mobile, msg, p.name, "ortho_custom");
      res.push({ name: p.name, ok });
    }
    setSending(false);
    setResults(res);
    setStep("done");
    const sentCount = res.filter((r) => r.ok).length;
    toast({
      title: `SMS भेजे: ${sentCount}/${res.length}`,
      description: sentCount === res.length ? "सभी successfully भेजे गए 🎉" : "कुछ SMS fail हुए।",
      variant: sentCount === res.length ? "default" : "destructive",
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Custom SMS — Ortho Patients
          </DialogTitle>
        </DialogHeader>

        {step === "compose" ? (
          <>
            {/* Patient list */}
            <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">
                  Patients ({patients.length})
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={toggleAll}
                >
                  {allSelected ? (
                    <CheckSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                  {allSelected ? "Deselect All" : "Select All"}
                </Button>
              </div>

              <ScrollArea className="h-44 border rounded-md p-2">
                {patients.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    कोई active plaster patient नहीं।
                  </p>
                )}
                <div className="space-y-1">
                  {patients.map((p) => (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                        selected.has(p.id) ? "bg-primary/10" : "hover:bg-muted"
                      }`}
                      onClick={() => toggleOne(p.id)}
                    >
                      <Checkbox
                        id={`sms-pt-${p.id}`}
                        checked={selected.has(p.id)}
                        onCheckedChange={() => toggleOne(p.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.mobile} &middot; {`${p.side || ""} ${p.body_part || ""}`.trim() || "-"}
                        </p>
                      </div>
                      {p.next_followup_date && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          FU: {fmtDateHindi(p.next_followup_date)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Message */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">
                  Custom Message{" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    (Variables: {"{{"} naam {"}}"}, {"{{"} followup {"}}"}, {"{{"} body_part {"}}"} )
                  </span>
                </Label>
                <Textarea
                  placeholder="यहाँ अपना message लिखें..."
                  className="min-h-[80px] text-sm"
                  value={customBody}
                  onChange={(e) => setCustomBody(e.target.value)}
                />
              </div>

              {/* Preview */}
              {preview && customBody.trim() && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs font-semibold text-primary mb-1 uppercase tracking-wide">
                    Preview ({previewPatient?.name})
                  </p>
                  <pre className="text-xs whitespace-pre-wrap font-sans text-foreground">
                    {preview}
                  </pre>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || selected.size === 0 || !customBody.trim()}
                className="gap-2"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send to {selected.size} Patient{selected.size !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          // Done screen
          <>
            <ScrollArea className="flex-1 max-h-64">
              <div className="space-y-1 p-1">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-3 py-2 rounded-md text-sm ${
                      r.ok ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"
                    }`}
                  >
                    <span>{r.name}</span>
                    <Badge variant={r.ok ? "default" : "destructive"}>
                      {r.ok ? "✓ Sent" : "✗ Failed"}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
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

  const { activePlaster, todayFu, missedFu, tomorrowFu } = useMemo(() => {
    const t = todayStr();
    const tm = tomorrowStr();
    const activePlaster =
      (cases || []).filter((c: any) => c.plaster_status === "Active").length;
    const list = followups || [];
    const todayFu = list.filter((c: any) => c.next_followup_date === t);
    const tomorrowFu = list.filter((c: any) => c.next_followup_date === tm);
    const missedFu = list.filter(
      (c: any) =>
        c.next_followup_date &&
        c.next_followup_date < t &&
        c.plaster_status === "Active",
    );
    return { activePlaster, todayFu, missedFu, tomorrowFu };
  }, [cases, followups]);

  // Calendar: 14-day view with counts
  const calendarDays = useMemo(() => {
    const days: { date: string; count: number; items: any[] }[] = [];
    for (let i = -3; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().slice(0, 10);
      const items = (followups || []).filter(
        (c: any) => c.next_followup_date === ds,
      );
      days.push({ date: ds, count: items.length, items });
    }
    return days;
  }, [followups]);

  const dayItems = selectedDate
    ? calendarDays.find((d) => d.date === selectedDate)?.items || []
    : [];

  // Build SMS patient list — Active plaster patients with mobile number
  const smsPatients: SmsPatient[] = useMemo(() => {
    return (cases || [])
      .filter(
        (c: any) =>
          c.plaster_status === "Active" &&
          c.patients?.mobile &&
          c.patients?.name,
      )
      .map((c: any) => ({
        id: c.id,
        name: c.patients.name,
        mobile: c.patients.mobile,
        body_part: c.body_part,
        side: c.side,
        next_followup_date: c.next_followup_date,
      }));
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

      {/* Today + Tomorrow + Missed Lists */}
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
            <p className="text-sm text-muted-foreground text-center py-2">
              No upcoming or missed follow-ups
            </p>
          )}
        </CardContent>
      </Card>

      {/* Mini calendar */}
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
                  onClick={() => {
                    setSelectedDate(d.date);
                    setCalOpen(true);
                  }}
                  className={`aspect-square rounded-md border text-xs flex flex-col items-center justify-center transition-colors ${
                    isToday
                      ? "border-primary bg-primary/10"
                      : isPast && d.count
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <span className="font-medium">{Number(d.date.slice(8, 10))}</span>
                  {d.count > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] mt-0.5">
                      {d.count}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick actions */}
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
          {/* ✅ NEW: Custom SMS button */}
          <Button
            variant="outline"
            onClick={() => setSmsOpen(true)}
            className="gap-2 justify-start border-primary/40 text-primary hover:bg-primary/10"
          >
            <MessageSquare className="h-4 w-4" />
            Custom SMS
            {smsPatients.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1">
                {smsPatients.length}
              </Badge>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Calendar dialog */}
      <Dialog open={calOpen} onOpenChange={setCalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Follow-ups on {selectedDate ? new Date(selectedDate).toLocaleDateString() : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-auto">
            {!dayItems.length && (
              <p className="text-sm text-muted-foreground text-center py-4">No follow-ups</p>
            )}
            {dayItems.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{c.patients?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.side} {c.body_part} · {c.plaster_type}
                  </p>
                </div>
                <Badge variant="outline">{c.plaster_status}</Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ✅ Custom SMS Dialog */}
      <CustomSmsDialog
        open={smsOpen}
        onClose={() => setSmsOpen(false)}
        patients={smsPatients}
      />
    </div>
  );
}

function FuList({
  title,
  items,
  tone,
  icon,
}: {
  title: string;
  items: any[];
  tone: "info" | "destructive" | "muted";
  icon?: React.ReactNode;
}) {
  if (!items.length) return null;
  const toneCls =
    tone === "info"
      ? "text-info"
      : tone === "destructive"
      ? "text-destructive"
      : "text-muted-foreground";
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 flex items-center gap-1 ${toneCls}`}>
        {icon}
        {title} ({items.length})
      </p>
      <div className="space-y-1">
        {items.slice(0, 4).map((c: any) => (
          <div key={c.id} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/50">
            <span className="font-medium">{c.patients?.name}</span>
            <span className="text-xs text-muted-foreground">
              {c.side} {c.body_part}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
