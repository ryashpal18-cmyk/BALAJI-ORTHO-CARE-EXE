import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Activity, Plus } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { usePhysioSessions, useAddPhysioSession, usePatients } from "@/hooks/useDatabase";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

export default function Physiotherapy() {
  const { data: sessions, isLoading } = usePhysioSessions();
  const { data: patients } = usePatients();
  const addSession = useAddPhysioSession();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ patient_id: "", exercise_plan: "", session_number: "1", total_sessions: "10", pain_scale: "5", progress_notes: "" });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_id) {
      toast({ title: "Error", description: "Select a patient", variant: "destructive" });
      return;
    }
    try {
      await addSession.mutateAsync({
        patient_id: form.patient_id,
        exercise_plan: form.exercise_plan,
        session_number: parseInt(form.session_number),
        total_sessions: parseInt(form.total_sessions),
        pain_scale: parseInt(form.pain_scale),
        progress_notes: form.progress_notes,
      });
      toast({ title: "Success", description: "Session recorded!" });
      setForm({ patient_id: "", exercise_plan: "", session_number: "1", total_sessions: "10", pain_scale: "5", progress_notes: "" });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="module-header">Physiotherapy</h1>
            <p className="text-sm text-muted-foreground">Track exercise plans and patient progress</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" />New Session</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-heading">New Physiotherapy Session</DialogTitle></DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-2">
                  <Label>Patient</Label>
                  <Select value={form.patient_id} onValueChange={v => setForm(p => ({ ...p, patient_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                    <SelectContent>
                      {patients?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Exercise Plan</Label>
                  <Input placeholder="e.g., Shoulder ROM Exercises" value={form.exercise_plan} onChange={e => setForm(p => ({ ...p, exercise_plan: e.target.value }))} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Session #</Label>
                    <Input type="number" min="1" value={form.session_number} onChange={e => setForm(p => ({ ...p, session_number: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Total</Label>
                    <Input type="number" min="1" value={form.total_sessions} onChange={e => setForm(p => ({ ...p, total_sessions: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Pain (0-10)</Label>
                    <Input type="number" min="0" max="10" value={form.pain_scale} onChange={e => setForm(p => ({ ...p, pain_scale: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Progress Notes</Label>
                  <Textarea placeholder="Notes..." value={form.progress_notes} onChange={e => setForm(p => ({ ...p, progress_notes: e.target.value }))} />
                </div>
                <Button type="submit" className="w-full" disabled={addSession.isPending}>
                  {addSession.isPending ? "Saving..." : "Record Session"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : !sessions?.length ? (
          <p className="text-muted-foreground text-sm text-center py-8">No physiotherapy sessions yet</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {sessions.map((s) => (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-heading">{(s.patients as any)?.name}</CardTitle>
                    <Badge variant="outline" className="text-xs">Session {s.session_number}/{s.total_sessions}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-secondary" />
                    <span className="text-sm">{s.exercise_plan}</span>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Progress</span>
                      <span>{Math.round((s.session_number / s.total_sessions) * 100)}%</span>
                    </div>
                    <Progress value={(s.session_number / s.total_sessions) * 100} className="h-2" />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Pain Scale</span>
                    <span className="font-medium">{s.pain_scale}/10</span>
                  </div>
                  {s.progress_notes && <p className="text-xs text-muted-foreground border-t pt-2">{s.progress_notes}</p>}
                  <div className="text-xs text-muted-foreground">Remaining: {s.total_sessions - s.session_number} sessions</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
