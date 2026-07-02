import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBranches, Branch } from "@/lib/branchContext";
import { logAudit } from "@/hooks/useAuditLog";
import { offlineInsert, offlineUpdate } from "@/lib/offlineQuery";
import { isOnline } from "@/lib/offlineSync";

export default function Branches() {
  const { data: branches = [], isLoading } = useBranches();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "", is_active: true });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        await offlineUpdate("branches", editing.id, form);
        await logAudit({ action: "update", module: "branches", recordId: editing.id, description: form.name });
      } else {
        await offlineInsert("branches", form);
        await logAudit({ action: "create", module: "branches", description: form.name });
      }
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      const online = await isOnline();
      toast({ title: online
        ? (editing ? "Branch update ho gaya ✓" : "Branch add ho gaya ✓")
        : "📥 Offline save ho gaya — net aane par sync hoga" });
      setOpen(false);
    },
    onError: () => toast({ title: "Save fail hua", variant: "destructive" }),
  });

  const openNew = () => { setEditing(null); setForm({ name: "", address: "", phone: "", is_active: true }); setOpen(true); };
  const openEdit = (b: Branch) => {
    setEditing(b);
    setForm({ name: b.name, address: b.address || "", phone: b.phone || "", is_active: b.is_active });
    setOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="module-header flex items-center gap-2">
              <Building2 className="h-6 w-6" /> Branches
            </h1>
            <p className="text-sm text-muted-foreground">Multiple clinic locations manage karo</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="gap-1.5"><Plus className="h-4 w-4" /> Naya Branch</Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>{editing ? "Branch Edit Karo" : "Naya Branch"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Branch Naam</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Khinwara (Main), Jodhpur Branch" /></div>
                <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="flex items-center justify-between">
                  <Label>Active</Label>
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending}>
                  {editing ? "Update" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Branch List ({branches.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Address</th>
                  <th className="text-left p-3 font-medium">Phone</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading...</td></tr>}
                {branches.map((b) => (
                  <tr key={b.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-medium">{b.name}</td>
                    <td className="p-3 text-muted-foreground">{b.address || "—"}</td>
                    <td className="p-3 text-muted-foreground">{b.phone || "—"}</td>
                    <td className="p-3">{b.is_active ? "Active" : "Inactive"}</td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => openEdit(b)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
