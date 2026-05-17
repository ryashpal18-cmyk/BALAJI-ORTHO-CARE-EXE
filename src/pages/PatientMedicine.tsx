import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Pill, Search, Save, Trash2, Plus, User, FileText } from "lucide-react";

const DEFAULT_MEDICINES = [
  { id: "med1", name: "Tab Aconex SP",      rate: 68.72  },
  { id: "med2", name: "Tab Calcikem K27",    rate: 135.73 },
  { id: "med3", name: "Tab Cefnex 200 LB",   rate: 150.20 },
  { id: "med4", name: "SYP Unisure D3 Nano", rate: 48.54  },
  { id: "med5", name: "Tab Cytocal + D3",    rate: 126.89 },
  { id: "med6", name: "Cap Raquil DSR",      rate: 118.94 },
];

export default function PatientMedicine() {
  const [searchParams] = useSearchParams();
  const [patients, setPatients] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>(DEFAULT_MEDICINES);
  const [search, setSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [selectedBill, setSelectedBill] = useState<any>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [existingEntry, setExistingEntry] = useState<any>(null);

  // Fetch patients
  useEffect(() => {
    supabase.from("patients").select("id, name, mobile").order("name")
      .then(({ data }) => {
        const list = data || [];
        setPatients(list);
        // Auto-select patient from URL param
        const pid = searchParams.get("patientId");
        if (pid) {
          const found = list.find((p: any) => p.id === pid);
          if (found) setSelectedPatient(found);
        }
      });
  }, []);

  // Auto-select bill from invoiceId param
  useEffect(() => {
    const invoiceId = searchParams.get("invoiceId");
    if (!invoiceId || bills.length === 0) return;
    const found = bills.find((b: any) => 
      `INV-${b.id.slice(0,8).toUpperCase()}` === invoiceId
    );
    if (found) setSelectedBill(found);
  }, [bills, searchParams]);

  // Fetch medicines from DB
  useEffect(() => {
    supabase.from("medicines" as any).select("*").order("created_at")
      .then(({ data, error }) => {
        if (!error && data && (data as any[]).length > 0) setMedicines(data as any[]);
      });
  }, []);

  // Fetch bills when patient selected
  useEffect(() => {
    if (!selectedPatient) return;
    supabase.from("billing").select("*")
      .eq("patient_id", selectedPatient.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setBills(data || []));
  }, [selectedPatient]);

  // Fetch existing medicine entry for selected bill
  useEffect(() => {
    if (!selectedBill) { setChecked({}); setExistingEntry(null); return; }
    loadExistingEntry(selectedBill);
  }, [selectedBill]);

  const loadExistingEntry = async (bill: any) => {
    const invoiceNo = `INV-${bill.id.slice(0, 8).toUpperCase()}`;
    const { data } = await supabase
      .from("medicine_entries" as any)
      .select("*, invoice_medicine_mapping(*)")
      .eq("invoice_no", invoiceNo)
      .maybeSingle();

    if (data) {
      setExistingEntry(data);
      const mapping = (data as any).invoice_medicine_mapping || [];
      const newChecked: Record<string, boolean> = {};
      mapping.forEach((m: any) => { newChecked[m.medicine_id] = true; });
      setChecked(newChecked);
    } else {
      setExistingEntry(null);
      setChecked({});
    }
  };

  const filteredPatients = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const chosen = medicines.filter(m => checked[m.id]);
  const total = chosen.reduce((s, m) => s + Number(m.rate), 0);
  const commission = total * 0.3;

  const handleSave = async () => {
    if (!selectedBill) {
      toast({ title: "Bill select karo pehle", variant: "destructive" }); return;
    }
    setSaving(true);
    const invoiceNo = `INV-${selectedBill.id.slice(0, 8).toUpperCase()}`;

    try {
      // Delete existing entry if any
      if (existingEntry) {
        await supabase.from("invoice_medicine_mapping" as any).delete().eq("entry_id", existingEntry.id);
        await supabase.from("medicine_entries" as any).delete().eq("id", existingEntry.id);
      }

      if (chosen.length === 0) {
        toast({ title: "✅ Medicine entry clear ho gayi!" });
        setExistingEntry(null);
        setSaving(false);
        return;
      }

      // Create new entry
      const { data: entry, error } = await supabase
        .from("medicine_entries" as any)
        .insert({
          invoice_no: invoiceNo,
          patient_name: selectedPatient.name,
          total_amount: total,
          commission,
        } as any)
        .select().single();
      if (error) throw error;

      const rows = chosen.map(m => ({
        entry_id: (entry as any).id,
        medicine_id: m.id,
        medicine_name: m.name,
        rate: m.rate,
      }));
      const { error: mErr } = await supabase.from("invoice_medicine_mapping" as any).insert(rows as any);
      if (mErr) throw mErr;

      toast({ title: "✅ Saved!", description: `Total: ₹${total.toFixed(2)} | Commission: ₹${commission.toFixed(2)}` });
      loadExistingEntry(selectedBill);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Pill className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Patient Medicine Entry</h1>
            <p className="text-sm text-muted-foreground">Patient select karo → Bill select karo → Medicines tick karo</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* LEFT — Patient List */}
          <div className="border rounded-xl overflow-hidden">
            <div className="bg-muted/50 px-4 py-3 flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Patient Chunno</span>
            </div>
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Patient name search..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-7 h-8 text-sm"
                />
              </div>
            </div>
            <div className="max-h-80 overflow-auto divide-y">
              {filteredPatients.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPatient(p); setSelectedBill(null); setChecked({}); }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors ${selectedPatient?.id === p.id ? "bg-primary/10 font-semibold text-primary" : ""}`}
                >
                  {p.name}
                  {p.mobile && <span className="block text-xs text-muted-foreground">{p.mobile}</span>}
                </button>
              ))}
              {filteredPatients.length === 0 && (
                <p className="p-4 text-sm text-center text-muted-foreground">Koi patient nahi mila</p>
              )}
            </div>
          </div>

          {/* MIDDLE — Bill List */}
          <div className="border rounded-xl overflow-hidden">
            <div className="bg-muted/50 px-4 py-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Bill Chunno</span>
            </div>
            <div className="max-h-96 overflow-auto divide-y">
              {!selectedPatient ? (
                <p className="p-4 text-sm text-center text-muted-foreground">Pehle patient chunno</p>
              ) : bills.length === 0 ? (
                <p className="p-4 text-sm text-center text-muted-foreground">Koi bill nahi hai</p>
              ) : bills.map(b => {
                const invoiceNo = `INV-${b.id.slice(0, 8).toUpperCase()}`;
                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBill(b)}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors ${selectedBill?.id === b.id ? "bg-primary/10 font-semibold text-primary" : ""}`}
                  >
                    <span className="font-mono text-xs">{invoiceNo}</span>
                    <span className="block text-xs text-muted-foreground">
                      ₹{Number(b.amount).toFixed(0)} • {new Date(b.created_at).toLocaleDateString("en-IN")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT — Medicine Checkboxes */}
          <div className="border rounded-xl overflow-hidden">
            <div className="bg-muted/50 px-4 py-3 flex items-center gap-2">
              <Pill className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Medicines</span>
              {existingEntry && (
                <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Saved ✓</span>
              )}
            </div>

            {!selectedBill ? (
              <p className="p-4 text-sm text-center text-muted-foreground">Pehle bill chunno</p>
            ) : (
              <>
                <div className="divide-y max-h-72 overflow-auto">
                  {medicines.map(m => (
                    <label
                      key={m.id}
                      className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!checked[m.id]}
                          onChange={e => setChecked(s => ({ ...s, [m.id]: e.target.checked }))}
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="text-sm">{m.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">₹{Number(m.rate).toFixed(2)}</span>
                    </label>
                  ))}
                </div>

                {/* Totals */}
                <div className="border-t p-3 space-y-1 text-sm bg-card">
                  <div className="flex justify-between">
                    <span>Total</span>
                    <b>₹{total.toFixed(2)}</b>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Commission (30%)</span>
                    <b>₹{commission.toFixed(2)}</b>
                  </div>
                </div>

                <div className="p-3 border-t">
                  <Button onClick={handleSave} disabled={saving} className="w-full">
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Saving..." : existingEntry ? "Update Karo" : "Save Karo"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
