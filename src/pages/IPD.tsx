import { useRef, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BedDouble } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cacheGetAll, cacheGetRow } from "@/lib/offlineDb";
import { useBeds, usePatients, useUpdateBed } from "@/hooks/useDatabase";

const statusColor = {
  available: "bg-success/20 border-success/40 text-success",
  occupied: "bg-destructive/20 border-destructive/40 text-destructive",
  reserved: "bg-warning/20 border-warning/40 text-warning",
};
const statusBg = {
  available: "bg-success",
  occupied: "bg-destructive",
  reserved: "bg-warning",
};

export default function IPD() {
  const { data: beds, isLoading, isError } = useBeds();
  const { data: patients = [] } = usePatients();
  const updateBed = useUpdateBed();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [newAdmission, setNewAdmission] = useState(false);
  const [selectedBed, setSelectedBed] = useState<any>(null);
  const [patientId, setPatientId] = useState("");
  const [status, setStatus] = useState("occupied");
  const saving = useRef(false);
  const availableBeds = (beds || []).filter(b => b.status === "available");
  const begin = (bed: any = null) => {
    setSelectedBed(bed);
    setNewAdmission(!bed);
    setPatientId(bed?.patient_id || "");
    setStatus(bed && bed.status !== "available" ? bed.status : "occupied");
    setOpen(true);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving.current || !selectedBed) return;
    saving.current = true;
    try {
      const current = await cacheGetRow("beds", selectedBed.id);
      if (!current || current.status !== selectedBed.status || current.patient_id !== selectedBed.patient_id) {
        throw new Error("Bed ki details badal gayi hain. Form band karke dobara kholein.");
      }
      if (status !== "available") {
        if (!patientId || !(await cacheGetRow("patients", patientId))) throw new Error("Registered patient select karein.");
        const other = (await cacheGetAll("beds")).find(b => b.id !== selectedBed.id && b.patient_id === patientId && b.status !== "available");
        if (other) throw new Error(`Patient pehle se bed ${other.bed_number} par assigned hai.`);
      }
      await updateBed.mutateAsync({ id: selectedBed.id, status, patient_id: status === "available" ? null : patientId, updated_at: new Date().toISOString() });
      setOpen(false);
      toast({ title: "Bed update PC par save ho gaya", description: "Internet aane par automatically sync hoga." });
    } catch (error: any) {
      toast({ title: "Bed save nahi hua", description: error.message, variant: "destructive" });
    } finally { saving.current = false; }
  };

  const grouped = {
    Ward: beds?.filter(b => b.bed_type === "Ward") || [],
    "Semi-Private": beds?.filter(b => b.bed_type === "Semi-Private") || [],
    Private: beds?.filter(b => b.bed_type === "Private") || [],
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 page-enter">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div style={{
            background: "linear-gradient(135deg, #0d2351 0%, #1e57b0 55%, #0e7c4a 100%)",
            borderRadius: "18px", padding: "22px 24px",
            display: "flex", alignItems: "center", gap: "16px",
            boxShadow: "0 8px 32px rgba(13,35,81,0.28)",
            flex: 1, marginRight: "16px",
          }}>
            <div style={{
              width: "54px", height: "54px", borderRadius: "14px",
              background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "28px", flexShrink: 0,
            }}>🛏️</div>
            <div>
              <h1 style={{ fontSize: "22px", fontWeight: 800, color: "white", margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>IPD / Bed Management</h1>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)", margin: 0 }}>Manage admissions and bed allocation</p>
            </div>
          </div>
          <Button className="gap-2" onClick={() => begin()} disabled={isLoading || isError || availableBeds.length === 0}><BedDouble className="h-4 w-4" />New Admission</Button>
        </div>

        {!isLoading && !isError && availableBeds.length === 0 && (
          <p className="text-sm text-muted-foreground">Koi available bed nahi hai. Existing occupied / reserved bed kholkar zarurat par release karein. Bed list khaali ho to setup / sync check karein.</p>
        )}
        <Dialog open={open} onOpenChange={value => { if (!saving.current) setOpen(value); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedBed ? `Bed ${selectedBed.bed_number}` : "New Admission"}</DialogTitle>
              <DialogDescription>Registered patient ko bed assign / reserve karein, ya bed release karein.</DialogDescription>
            </DialogHeader>
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admission-bed">Bed</Label>
                <select id="admission-bed" className="w-full h-10 rounded-md border bg-background px-3 text-sm" required disabled={updateBed.isPending || !newAdmission}
                  value={selectedBed?.id || ""} onChange={e => setSelectedBed(availableBeds.find(b => b.id === e.target.value) || null)}>
                  <option value="">Select available bed</option>
                  {(newAdmission ? availableBeds : selectedBed ? [selectedBed] : []).map(b => <option key={b.id} value={b.id}>{b.bed_number} — {b.bed_type}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admission-status">Status</Label>
                <select id="admission-status" className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={status} disabled={updateBed.isPending} onChange={e => setStatus(e.target.value)}>
                  <option value="occupied">Occupied / Admit patient</option>
                  <option value="reserved">Reserved</option>
                  <option value="available">Available / Release bed</option>
                </select>
              </div>
              {status !== "available" ? <div className="space-y-2">
                <Label htmlFor="admission-patient">Patient</Label>
                <select id="admission-patient" className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={patientId} onChange={e => setPatientId(e.target.value)} required disabled={updateBed.isPending || !!selectedBed?.patient_id}>
                  <option value="">Select registered patient</option>
                  {selectedBed?.patient_id && !patients.some(p => p.id === selectedBed.patient_id) && <option value={selectedBed.patient_id}>{selectedBed.patients?.name || "Assigned patient"}</option>}
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name} ({p.mobile || "No mobile"})</option>)}
                </select>
                <p className="text-xs text-muted-foreground">Naye patient ko pehle OPD mein register karein. Patient badalne se pehle bed release karein.</p>
              </div> : <p className="text-sm">Save karne par patient is bed se unassign hoga. Patient aur billing records delete nahi honge.</p>}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={updateBed.isPending} onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={updateBed.isPending || !selectedBed}>{updateBed.isPending ? "Saving..." : "Save Bed"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <div className="flex gap-4 flex-wrap">
          {(["available", "occupied", "reserved"] as const).map(s => (
            <div key={s} className="flex items-center gap-2 text-sm">
              <div className={cn("h-3 w-3 rounded-full", statusBg[s])} />
              <span className="capitalize">{s}</span>
            </div>
          ))}
        </div>

        {isError ? <p role="alert" className="text-destructive">Bed list load nahi hui. Dobara page kholein.</p> : isLoading ? (
          <p className="text-muted-foreground text-sm">Loading beds...</p>
        ) : (
          Object.entries(grouped).map(([type, typeBeds]) => (
            <Card key={type}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-heading">{type} ({typeBeds.length} beds)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {typeBeds.map(bed => (
                    <button type="button" key={bed.id} onClick={() => begin(bed)} aria-label={`Bed ${bed.bed_number}, ${bed.status}`} className={cn("border-2 rounded-xl p-3 text-center cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1 hover:scale-105 duration-200", statusColor[bed.status as keyof typeof statusColor] || "")}>
                      <BedDouble className="h-6 w-6 mx-auto mb-1" />
                      <p className="font-bold text-sm">{bed.bed_number}</p>
                      {(bed.patients as any)?.name && <p className="text-[10px] mt-1 truncate">{(bed.patients as any).name}</p>}
                      <Badge variant="secondary" className={cn("text-[9px] mt-1 border-0", statusColor[bed.status as keyof typeof statusColor] || "")}>
                        {bed.status}
                      </Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </DashboardLayout>
  );
}
