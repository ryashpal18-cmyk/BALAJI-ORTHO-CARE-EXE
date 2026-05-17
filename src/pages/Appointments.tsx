import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar, Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppointments, useAddAppointment, usePatients, useUpdateAppointment } from "@/hooks/useDatabase";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

const statusStyle: Record<string, string> = {
  Scheduled: "bg-info/10 text-info border-info/20",
  Completed: "bg-success/10 text-success border-success/20",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function Appointments() {
  const { data: appointments, isLoading } = useAppointments();
  const { data: patients } = usePatients();
  const addAppointment = useAddAppointment();
  const updateAppointment = useUpdateAppointment();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ patient_id: "", date: "", time_slot: "", notes: "" });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_id || !form.date) {
      toast({ title: "Error", description: "Patient and date required", variant: "destructive" });
      return;
    }
    try {
      await addAppointment.mutateAsync({
        patient_id: form.patient_id,
        date: form.date,
        time_slot: form.time_slot || null,
        notes: form.notes || null,
      });
      toast({ title: "Success", description: "Appointment created!" });
      setForm({ patient_id: "", date: "", time_slot: "", notes: "" });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateAppointment.mutateAsync({ id, status });
      toast({ title: "Updated", description: `Status changed to ${status}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="module-header">Appointments</h1>
            <p className="text-sm text-muted-foreground">Schedule and manage patient appointments</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" />New Appointment</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-heading">New Appointment</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-2">
                  <Label>Patient</Label>
                  <Select value={form.patient_id} onValueChange={v => setForm(p => ({ ...p, patient_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                    <SelectContent>
                      {patients?.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.mobile})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Time Slot</Label>
                  <Input placeholder="e.g., 10:00 AM" value={form.time_slot} onChange={e => setForm(p => ({ ...p, time_slot: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input placeholder="Consultation type" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
                </div>
                <Button type="submit" className="w-full" disabled={addAppointment.isPending}>
                  {addAppointment.isPending ? "Creating..." : "Create Appointment"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              All Appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : !appointments?.length ? (
              <p className="text-muted-foreground text-sm text-center py-8">No appointments yet</p>
            ) : (
              <div className="space-y-3">
                {appointments.map(apt => (
                  <div key={apt.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Clock className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{(apt.patients as any)?.name}</p>
                        <p className="text-xs text-muted-foreground">{apt.notes || "Consultation"} · {apt.date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium hidden sm:inline">{apt.time_slot || "--"}</span>
                      <Select value={apt.status} onValueChange={v => handleStatusChange(apt.id, v)}>
                        <SelectTrigger className={cn("h-7 w-28 text-xs border", statusStyle[apt.status] || "")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Scheduled">Scheduled</SelectItem>
                          <SelectItem value="Completed">Completed</SelectItem>
                          <SelectItem value="Cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
