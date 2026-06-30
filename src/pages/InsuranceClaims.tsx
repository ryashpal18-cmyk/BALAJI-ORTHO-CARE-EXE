import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ShieldPlus, Plus, Pencil, Trash2 } from "lucide-react";
import {
  useInsuranceClaims, useCreateClaim, useUpdateClaim, useDeleteClaim, InsuranceClaim,
} from "@/hooks/useInsuranceClaims";

const STATUS_OPTIONS = ["Submitted", "Under Review", "Approved", "Partially Approved", "Rejected", "Settled"];

const STATUS_COLOR: Record<string, string> = {
  Submitted: "bg-info/15 text-info",
  "Under Review": "bg-warning/15 text-warning",
  Approved: "bg-success/15 text-success",
  "Partially Approved": "bg-warning/15 text-warning",
  Rejected: "bg-destructive/15 text-destructive",
  Settled: "bg-success/20 text-success",
};

const emptyForm = {
  patient_name: "",
  tpa_name: "",
  policy_number: "",
  claim_amount: "",
  status: "Submitted",
  notes: "",
};

export default function InsuranceClaims() {
  const { data: claims = [], isLoading } = useInsuranceClaims();
  const createClaim = useCreateClaim();
  const updateClaim = useUpdateClaim();
  const deleteClaim = useDeleteClaim();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InsuranceClaim | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filtered = filterStatus === "all" ? claims : claims.filter((c) => c.status === filterStatus);

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (c: InsuranceClaim) => {
    setEditing(c);
    setForm({
      patient_name: c.patient_name, tpa_name: c.tpa_name,
      policy_number: c.policy_number || "", claim_amount: String(c.claim_amount),
      status: c.status, notes: c.notes || "",
    });
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.patient_name || !form.tpa_name || !form.claim_amount) {
      toast({ title: "Patient name, TPA aur amount zaroori hai", variant: "destructive" });
      return;
    }
    try {
      if (editing) {
        await updateClaim.mutateAsync({
          id: editing.id,
          updates: { ...form, claim_amount: Number(form.claim_amount) } as any,
        });
        toast({ title: "Claim update ho gaya ✓" });
      } else {
        await createClaim.mutateAsync({
          ...form, claim_amount: Number(form.claim_amount),
        } as any);
        toast({ title: "Claim file ho gaya ✓" });
      }
      setOpen(false);
    } catch {
      toast({ title: "Kuch gadbad hui", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Ye claim delete karna hai?")) return;
    await deleteClaim.mutateAsync(id);
    toast({ title: "Claim delete ho gaya" });
  };

  const totals = {
    submitted: claims.reduce((s, c) => s + Number(c.claim_amount || 0), 0),
    approved: claims.reduce((s, c) => s + Number(c.approved_amount || 0), 0),
    pending: claims.filter((c) => !["Settled", "Rejected"].includes(c.status)).length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="module-header flex items-center gap-2">
              <ShieldPlus className="h-6 w-6" /> Insurance / TPA Claims
            </h1>
            <p className="text-sm text-muted-foreground">Cashless aur reimbursement claims track karo</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="gap-1.5"><Plus className="h-4 w-4" /> Naya Claim</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>{editing ? "Claim Edit Karo" : "Naya Claim File Karo"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Patient Naam</Label><Input value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} /></div>
                <div><Label>TPA / Insurance Company</Label><Input value={form.tpa_name} onChange={(e) => setForm({ ...form, tpa_name: e.target.value })} placeholder="e.g. Star Health, CGHS" /></div>
                <div><Label>Policy Number</Label><Input value={form.policy_number} onChange={(e) => setForm({ ...form, policy_number: e.target.value })} /></div>
                <div><Label>Claim Amount (₹)</Label><Input type="number" value={form.claim_amount} onChange={(e) => setForm({ ...form, claim_amount: e.target.value })} /></div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit}>{editing ? "Update Karo" : "Save Karo"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card className="stat-card"><p className="text-xs text-muted-foreground">Total Claimed</p><p className="text-xl font-bold">₹{totals.submitted.toFixed(0)}</p></Card>
          <Card className="stat-card"><p className="text-xs text-muted-foreground">Total Approved</p><p className="text-xl font-bold text-success">₹{totals.approved.toFixed(0)}</p></Card>
          <Card className="stat-card"><p className="text-xs text-muted-foreground">Pending Claims</p><p className="text-xl font-bold text-warning">{totals.pending}</p></Card>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant={filterStatus === "all" ? "default" : "outline"} onClick={() => setFilterStatus("all")}>All</Button>
          {STATUS_OPTIONS.map((s) => (
            <Button key={s} size="sm" variant={filterStatus === s ? "default" : "outline"} onClick={() => setFilterStatus(s)}>{s}</Button>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Claims ({filtered.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left p-3 font-medium">Patient</th>
                    <th className="text-left p-3 font-medium">TPA</th>
                    <th className="text-left p-3 font-medium">Claim ₹</th>
                    <th className="text-left p-3 font-medium">Approved ₹</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading...</td></tr>}
                  {!isLoading && filtered.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Koi claim nahi mila</td></tr>}
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-medium">{c.patient_name}</td>
                      <td className="p-3">{c.tpa_name}</td>
                      <td className="p-3">₹{Number(c.claim_amount).toFixed(0)}</td>
                      <td className="p-3">{c.approved_amount ? `₹${Number(c.approved_amount).toFixed(0)}` : "—"}</td>
                      <td className="p-3"><Badge variant="secondary" className={STATUS_COLOR[c.status]}>{c.status}</Badge></td>
                      <td className="p-3 text-muted-foreground">{new Date(c.submitted_date).toLocaleDateString("en-IN")}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => handleDelete(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
