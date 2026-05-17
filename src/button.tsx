import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Pill } from "lucide-react";

interface Medicine { id: string; name: string; rate: number }

interface Props {
  open: boolean;
  onClose: () => void;
  patientName: string;
  invoiceNo: string;
}

export function MedicineEntryPopup({ open, onClose, patientName, invoiceNo }: Props) {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected({});
    supabase.from("medicines").select("*").order("name").then(({ data }) => {
      setMedicines((data as any) || []);
    });
  }, [open]);

  const chosen = medicines.filter((m) => selected[m.id]);
  const total = chosen.reduce((s, m) => s + Number(m.rate), 0);
  const commission = total * 0.3;

  const handleSave = async () => {
    if (chosen.length === 0) {
      toast({ title: "Select at least one medicine", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: entry, error } = await supabase
        .from("medicine_entries")
        .insert({
          invoice_no: invoiceNo,
          patient_name: patientName,
          total_amount: total,
          commission,
        } as any)
        .select()
        .single();
      if (error) throw error;
      const rows = chosen.map((m) => ({
        entry_id: (entry as any).id,
        medicine_id: m.id,
        medicine_name: m.name,
        rate: m.rate,
      }));
      const { error: mErr } = await supabase.from("invoice_medicine_mapping").insert(rows as any);
      if (mErr) throw mErr;
      toast({ title: "Saved", description: `Commission: ₹${commission.toFixed(2)}` });
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5 text-primary" /> Medicine Entry
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm bg-muted/40 rounded-md p-3">
            <div><span className="text-muted-foreground">Patient: </span><b>{patientName}</b></div>
            <div><span className="text-muted-foreground">Invoice: </span><b>{invoiceNo}</b></div>
          </div>
          <div className="space-y-2 max-h-72 overflow-auto pr-1">
            {medicines.map((m) => (
              <label key={m.id} className="flex items-center justify-between gap-3 border rounded-md p-2 cursor-pointer hover:bg-accent">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={!!selected[m.id]}
                    onCheckedChange={(v) => setSelected((s) => ({ ...s, [m.id]: !!v }))}
                  />
                  <span className="text-sm">{m.name}</span>
                </div>
                <span className="text-sm font-medium">₹{Number(m.rate).toFixed(2)}</span>
              </label>
            ))}
          </div>
          <div className="rounded-md border p-3 text-sm space-y-1 bg-card">
            <div className="flex justify-between"><span>Total</span><b>₹{total.toFixed(2)}</b></div>
            <div className="flex justify-between text-success"><span>Commission (30%)</span><b>₹{commission.toFixed(2)}</b></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Skip</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
