import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { openWhatsApp, CLINIC_NAME } from "@/lib/whatsappOrtho";
import {
  ArrowLeft, Search, Plus, Trash2, Printer, MessageCircle, Save, Pill,
} from "lucide-react";

interface Patient {
  id: string;
  name: string;
  mobile: string | null;
  age: number | null;
  gender: string | null;
}

interface MedRow {
  name: string;
  dose: string;
  duration: string;
}

const DOCTOR_NAME = "Dr. S. S. Rathore";
const DOCTOR_QUALIFICATION = "M.S. Orthopaedics";

export default function Prescription() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetPatientId = searchParams.get("patientId");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const [patient, setPatient] = useState<Patient | null>(null);

  const [diagnosis, setDiagnosis] = useState("");
  const [medicines, setMedicines] = useState<MedRow[]>([
    { name: "", dose: "", duration: "" },
  ]);
  const [advice, setAdvice] = useState("");
  const [followupDate, setFollowupDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Agar patientId query param se aaya hai (PatientProfile se), seedha load karo
  useEffect(() => {
    if (!presetPatientId) return;
    (async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, name, mobile, age, gender")
        .eq("id", presetPatientId)
        .single();
      if (data) setPatient(data as Patient);
    })();
  }, [presetPatientId]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setShowDrop(false);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, name, mobile, age, gender")
        .ilike("name", `%${query}%`)
        .limit(8);
      setResults((data as Patient[]) || []);
      setShowDrop(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const selectPatient = (p: Patient) => {
    setPatient(p);
    setQuery("");
    setShowDrop(false);
  };

  const addMedRow = () => setMedicines([...medicines, { name: "", dose: "", duration: "" }]);
  const removeMedRow = (idx: number) => setMedicines(medicines.filter((_, i) => i !== idx));
  const updateMedRow = (idx: number, field: keyof MedRow, value: string) => {
    setMedicines(medicines.map((m, i) => (i === idx ? { ...m, [field]: value } : m)));
  };

  const medicinesToText = () =>
    medicines
      .filter((m) => m.name.trim())
      .map((m) => `${m.name}${m.dose ? " - " + m.dose : ""}${m.duration ? " - " + m.duration : ""}`)
      .join(" | ");

  const handleSave = async () => {
    if (!patient) {
      toast({ title: "Pehle patient select karo", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("prescriptions")
      .insert({
        patient_id: patient.id,
        diagnosis: diagnosis.trim() || null,
        medicines: medicinesToText() || null,
        advice: advice.trim() || null,
        followup_date: followupDate || null,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Prescription save ho gaya!" });
      setSavedId(data?.id || null);
    }
    setSaving(false);
  };

  const handlePrint = () => window.print();

  const handleWhatsApp = () => {
    if (!patient) return;
    const lines = [
      `नमस्ते ${patient.name},`,
      ``,
      `${CLINIC_NAME}`,
      `${DOCTOR_NAME} (${DOCTOR_QUALIFICATION})`,
      ``,
      diagnosis ? `📋 Diagnosis: ${diagnosis}` : null,
      ``,
      `💊 Dawai:`,
      ...medicines
        .filter((m) => m.name.trim())
        .map((m) => `• ${m.name}${m.dose ? " — " + m.dose : ""}${m.duration ? " — " + m.duration : ""}`),
      advice ? `` : null,
      advice ? `⚠️ सलाह: ${advice}` : null,
      followupDate ? `` : null,
      followupDate ? `📅 अगली विजिट: ${new Date(followupDate).toLocaleDateString("hi-IN")}` : null,
      ``,
      `धन्यवाद 🙏`,
    ].filter((l) => l !== null) as string[];
    openWhatsApp(patient.mobile, lines.join("\n"));
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6 p-4">
        {/* Header — no-print */}
        <div className="flex items-center justify-between no-print">
          <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2 -ml-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-3.5 w-3.5" /> Print / PDF
            </Button>
            <Button
              size="sm"
              onClick={handleWhatsApp}
              disabled={!patient}
              className="gap-1.5 bg-green-600 hover:bg-green-700"
            >
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </Button>
          </div>
        </div>

        {/* Patient search — no-print */}
        {!patient && (
          <div className="border rounded-xl p-4 bg-card no-print relative">
            <Label className="mb-1.5 block">Patient Select Karo</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Naam se search karo..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => results.length > 0 && setShowDrop(true)}
              />
            </div>
            {showDrop && (
              <div className="absolute left-4 right-4 mt-1 bg-card border rounded-lg shadow-lg z-50 overflow-hidden">
                {results.length === 0 ? (
                  <div className="p-3 text-sm text-center text-muted-foreground">Koi patient nahi mila</div>
                ) : (
                  <div className="divide-y max-h-64 overflow-auto">
                    {results.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => selectPatient(p)}
                        className="w-full text-left px-4 py-2.5 hover:bg-accent transition-colors"
                      >
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.mobile || "No mobile"}{p.age ? ` • ${p.age} yrs` : ""}{p.gender ? ` • ${p.gender}` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Prescription Pad */}
        <div className="border rounded-xl bg-card shadow-sm print-area" id="prescription-print">
          {/* Letterhead */}
          <div className="p-5 border-b text-center bg-muted/20">
            <h1 className="text-xl font-bold">{CLINIC_NAME}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{DOCTOR_NAME} · {DOCTOR_QUALIFICATION}</p>
          </div>

          <div className="p-5 space-y-5">
            {/* Patient strip */}
            {patient ? (
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <p className="font-semibold">{patient.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {patient.mobile || "No mobile"}{patient.age ? ` • ${patient.age} yrs` : ""}{patient.gender ? ` • ${patient.gender}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost" size="sm"
                  className="no-print"
                  onClick={() => setPatient(null)}
                >
                  Change
                </Button>
                <p className="text-xs text-muted-foreground hidden print-only">
                  Date: {new Date().toLocaleDateString("en-IN")}
                </p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic pb-2 border-b">
                Patient select karne ke baad yahaan details aayengi
              </div>
            )}

            {/* Diagnosis */}
            <div className="space-y-1">
              <Label>Diagnosis</Label>
              <Textarea
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="e.g. Fracture - Right forearm"
                rows={2}
              />
            </div>

            {/* Medicines */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5"><Pill className="h-3.5 w-3.5" /> Medicines</Label>
                <Button variant="outline" size="sm" onClick={addMedRow} className="gap-1 no-print">
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
              <div className="space-y-2">
                {medicines.map((m, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                    <Input
                      placeholder="Medicine name"
                      value={m.name}
                      onChange={(e) => updateMedRow(idx, "name", e.target.value)}
                    />
                    <Input
                      placeholder="Dose (e.g. 1-0-1)"
                      value={m.dose}
                      onChange={(e) => updateMedRow(idx, "dose", e.target.value)}
                    />
                    <Input
                      placeholder="Duration (e.g. 5 days)"
                      value={m.duration}
                      onChange={(e) => updateMedRow(idx, "duration", e.target.value)}
                    />
                    {medicines.length > 1 && (
                      <Button
                        variant="ghost" size="icon"
                        className="no-print text-destructive shrink-0"
                        onClick={() => removeMedRow(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Advice */}
            <div className="space-y-1">
              <Label>Advice / Instructions</Label>
              <Textarea
                value={advice}
                onChange={(e) => setAdvice(e.target.value)}
                placeholder="e.g. Plaster ko geela na karein, support ke saath chalein"
                rows={2}
              />
            </div>

            {/* Follow-up */}
            <div className="space-y-1 max-w-xs">
              <Label>Next Follow-up Date</Label>
              <Input
                type="date"
                value={followupDate}
                onChange={(e) => setFollowupDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Save — no-print */}
        <div className="flex justify-end no-print">
          <Button onClick={handleSave} disabled={saving || !patient} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : savedId ? "Saved ✓ — Update Again" : "Save Prescription"}
          </Button>
        </div>
      </div>

      {/* Print styles scoped to this page */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body * { visibility: hidden; }
          #prescription-print, #prescription-print * { visibility: visible; }
          #prescription-print { position: absolute; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </DashboardLayout>
  );
}
