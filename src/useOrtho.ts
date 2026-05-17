import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bone, CalendarClock, AlertTriangle, Plus, MessageCircle, Search } from "lucide-react";
import { useFollowupsAround, useFractureCases } from "@/hooks/useOrtho";
import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const todayStr = () => new Date().toISOString().slice(0, 10);
const tomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function OrthoPanel() {
  const navigate = useNavigate();
  const { data: cases } = useFractureCases();
  const { data: followups } = useFollowupsAround();
  const [calOpen, setCalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button variant="outline" onClick={() => navigate("/ortho")} className="gap-2 justify-start">
            <Plus className="h-4 w-4" /> New Fracture Entry
          </Button>
          <Button variant="outline" onClick={() => navigate("/whatsapp")} className="gap-2 justify-start">
            <MessageCircle className="h-4 w-4" /> Send WhatsApp
          </Button>
          <Button variant="outline" onClick={() => navigate("/opd")} className="gap-2 justify-start">
            <Search className="h-4 w-4" /> Search Patient
          </Button>
        </CardContent>
      </Card>

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
