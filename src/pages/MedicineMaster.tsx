import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Pill, Plus, Pencil, Trash2, Save, X } from "lucide-react";

interface Medicine {
  id: string;
  name: string;
  rate: number;
  created_at?: string;
}

export default function MedicineMaster() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");
  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchMedicines = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("medicines" as any)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      // If table doesn't exist, use default medicines
      setMedicines([
        { id: "med1", name: "Tab Aconex SP", rate: 68.72 },
        { id: "med2", name: "Tab Calcikem K27", rate: 135.73 },
        { id: "med3", name: "Tab Cefnex 200 LB", rate: 150.20 },
        { id: "med4", name: "SYP Unisure D3 Nano", rate: 48.54 },
        { id: "med5", name: "Tab Cytocal + D3", rate: 126.89 },
        { id: "med6", name: "Cap Raquil DSR", rate: 118.94 },
      ]);
    } else {
      setMedicines((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchMedicines(); }, []);

  const handleAdd = async () => {
    if (!newName.trim() || !newRate) {
      toast({ title: "Error", description: "Name aur Rate dono bharo", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("medicines" as any)
      .insert({ name: newName.trim(), rate: parseFloat(newRate) } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Medicine Add Ho Gayi!" });
      setNewName(""); setNewRate(""); setAdding(false);
      fetchMedicines();
    }
    setSaving(false);
  };

  const handleEdit = (m: Medicine) => {
    setEditingId(m.id);
    setEditName(m.name);
    setEditRate(String(m.rate));
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim() || !editRate) {
      toast({ title: "Error", description: "Name aur Rate dono bharo", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("medicines" as any)
      .update({ name: editName.trim(), rate: parseFloat(editRate) } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Medicine Update Ho Gayi!" });
      setEditingId(null);
      fetchMedicines();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`"${name}" delete karna chahte ho?`)) return;
    const { error } = await supabase.from("medicines" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "🗑️ Medicine Delete Ho Gayi!" });
      fetchMedicines();
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Pill className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Medicine Master</h1>
              <p className="text-sm text-muted-foreground">Medicines add, edit ya delete karo</p>
            </div>
          </div>
          <Button onClick={() => setAdding(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add Medicine
          </Button>
        </div>

        {/* Add New Medicine Form */}
        {adding && (
          <div className="border rounded-xl p-4 bg-blue-50 space-y-3">
            <p className="font-semibold text-blue-800">Nai Medicine Add Karo</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Medicine Name</label>
                <Input
                  placeholder="Jaise: Tab XYZ 500"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Rate (₹)</label>
                <Input
                  type="number"
                  placeholder="Jaise: 150.00"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => { setAdding(false); setNewName(""); setNewRate(""); }}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button onClick={handleAdd} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}

        {/* Medicines List */}
        <div className="border rounded-xl overflow-hidden">
          <div className="bg-muted/50 px-4 py-3 grid grid-cols-12 text-xs font-semibold text-muted-foreground uppercase">
            <span className="col-span-1">#</span>
            <span className="col-span-7">Medicine Name</span>
            <span className="col-span-2 text-right">Rate</span>
            <span className="col-span-2 text-right">Actions</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : medicines.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Koi medicine nahi hai — "Add Medicine" karo
            </div>
          ) : (
            <div className="divide-y">
              {medicines.map((m, i) => (
                <div key={m.id} className="px-4 py-3 grid grid-cols-12 items-center hover:bg-muted/20">
                  <span className="col-span-1 text-sm text-muted-foreground">{i + 1}</span>

                  {editingId === m.id ? (
                    <>
                      <div className="col-span-7 pr-2">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="col-span-2 pr-2">
                        <Input
                          type="number"
                          value={editRate}
                          onChange={(e) => setEditRate(e.target.value)}
                          className="h-8 text-sm text-right"
                        />
                      </div>
                      <div className="col-span-2 flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600"
                          onClick={() => handleSaveEdit(m.id)} disabled={saving}>
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
                          onClick={() => setEditingId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="col-span-7 text-sm font-medium">{m.name}</span>
                      <span className="col-span-2 text-sm font-semibold text-right">₹{Number(m.rate).toFixed(2)}</span>
                      <div className="col-span-2 flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-500"
                          onClick={() => handleEdit(m)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500"
                          onClick={() => handleDelete(m.id, m.name)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Total Count */}
        <p className="text-xs text-muted-foreground text-right">
          Total: {medicines.length} medicines
        </p>
      </div>
    </DashboardLayout>
  );
}
