import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { UserPlus, Search, FileText, Printer, Download, MessageCircle, Trash2 } from "lucide-react";
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAddPatient, useSearchPatients, useAddPrescription, usePatients, useDeletePatient } from "@/hooks/useDatabase";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { openWhatsAppWeb } from "@/pages/WhatsApp";
import { useIsAdmin } from "@/hooks/useIsAdmin";

const orthoAdvice: Record<string, string> = {
  "Plaster Care": "प्लास्टर केयर सलाह:\n• प्लास्टर को सूखा रखें\n• उंगलियों को हिलाते रहें\n• सूजन या सुन्नपन होने पर तुरंत डॉक्टर से मिलें\n• प्लास्टर को खुद न निकालें",
  "Fracture Healing": "फ्रैक्चर हीलिंग सलाह:\n• कैल्शियम युक्त भोजन लें (दूध, दही, पनीर)\n• प्रोटीन से भरपूर खाना खाएं\n• विटामिन D के लिए धूप में बैठें\n• डॉक्टर की सलाह के बिना वजन न डालें",
  "Upper Limb": "ऊपरी अंग सलाह:\n• हाथ को ऊंचा रखें (तकिये पर)\n• उंगलियों की एक्सरसाइज करें\n• भारी वस्तु न उठाएं\n• स्लिंग नियमित पहनें",
  "Lower Limb": "निचले अंग सलाह:\n• पैर को ऊंचा रखें\n• बिना सहारे के न चलें\n• बर्फ की सिकाई करें\n• वजन डालने से पहले डॉक्टर से पूछें",
  "Physiotherapy": "फिजियोथेरेपी सलाह:\n• रोजाना बताई गई एक्सरसाइज करें\n• दर्द होने पर रुकें, जबरदस्ती न करें\n• गर्म/ठंडी सिकाई नियम से करें\n• फॉलो-अप में आएं",
  "Emergency Warning": "आपातकालीन चेतावनी:\n⚠️ तुरंत डॉक्टर से मिलें यदि:\n• उंगलियां नीली/सुन्न हो जाएं\n• असहनीय दर्द हो\n• प्लास्टर टूट जाए\n• बुखार आए\n• सूजन बहुत बढ़ जाए",
};

const CLINIC = {
  name: "Balaji Ortho Care Center",
  doctor: "Dr. S. S. Rathore (DMRT | BPT)",
  address: "Opp Govt Hospital, Bay Pass Road, Khinwara, Rajasthan – 306502",
  phone: "+91 8005707783",
};

function getSelectedPatient(allPatients: any[] | undefined, patientId: string) {
  return allPatients?.find((p) => p.id === patientId);
}

function buildPrescriptionHTML(patient: any, rxForm: any, advice: string) {
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 24px; color: #1a1a2e;">
      <div style="text-align: center; border-bottom: 3px solid #0a2647; padding-bottom: 16px; margin-bottom: 16px;">
        <h1 style="margin: 0; font-size: 22px; color: #0a2647;">${CLINIC.name}</h1>
        <p style="margin: 4px 0; font-size: 14px; font-weight: 600; color: #00b4d8;">${CLINIC.doctor}</p>
        <p style="margin: 2px 0; font-size: 12px; color: #555;">${CLINIC.address}</p>
        <p style="margin: 2px 0; font-size: 12px; color: #555;">Phone: ${CLINIC.phone}</p>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 13px;">
        <div><strong>Patient:</strong> ${patient?.name || "N/A"}</div>
        <div><strong>Date:</strong> ${today}</div>
      </div>
      <div style="display: flex; gap: 16px; margin-bottom: 16px; font-size: 13px;">
        <div><strong>Age:</strong> ${patient?.age || "N/A"}</div>
        <div><strong>Gender:</strong> ${patient?.gender || "N/A"}</div>
        <div><strong>Mobile:</strong> ${patient?.mobile || "N/A"}</div>
      </div>
      <div style="border-top: 1px solid #ddd; padding-top: 12px; margin-bottom: 12px;">
        <h3 style="margin: 0 0 6px; font-size: 14px; color: #0a2647;">Diagnosis</h3>
        <p style="margin: 0; font-size: 13px;">${rxForm.diagnosis || "—"}</p>
      </div>
      <div style="border-top: 1px solid #ddd; padding-top: 12px; margin-bottom: 12px;">
        <h3 style="margin: 0 0 6px; font-size: 14px; color: #0a2647;">℞ Medicines</h3>
        <pre style="margin: 0; font-size: 13px; white-space: pre-wrap; font-family: inherit;">${rxForm.medicines || "—"}</pre>
      </div>
      <div style="border-top: 1px solid #ddd; padding-top: 12px; margin-bottom: 12px;">
        <h3 style="margin: 0 0 6px; font-size: 14px; color: #0a2647;">Advice</h3>
        <pre style="margin: 0; font-size: 13px; white-space: pre-wrap; font-family: inherit;">${advice || "—"}</pre>
      </div>
      ${rxForm.followup_date ? `<div style="border-top: 1px solid #ddd; padding-top: 12px; margin-bottom: 12px;">
        <h3 style="margin: 0 0 6px; font-size: 14px; color: #0a2647;">Next Visit</h3>
        <p style="margin: 0; font-size: 13px;">${new Date(rxForm.followup_date).toLocaleDateString("en-IN")}</p>
      </div>` : ""}
      <div style="border-top: 2px solid #0a2647; padding-top: 16px; margin-top: 24px; text-align: right;">
        <p style="margin: 0; font-size: 14px; font-weight: 600; color: #0a2647;">${CLINIC.doctor}</p>
        <p style="margin: 2px 0; font-size: 11px; color: #555;">${CLINIC.name}</p>
      </div>
    </div>
  `;
}

export default function OPD() {
  const navigate = useNavigate();
  const [advice, setAdvice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [regForm, setRegForm] = useState({ name: "", mobile: "", age: "", gender: "", address: "" });
  const [showVillageOptions, setShowVillageOptions] = useState(false);
  const [existingPatient, setExistingPatient] = useState<any>(null);
  const [mobileSearchStatus, setMobileSearchStatus] = useState<"idle" | "searching" | "found" | "new">("idle");
  const [rxForm, setRxForm] = useState({ patient_id: "", diagnosis: "", medicines: "", followup_date: "" });
  const [isExporting, setIsExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const addPatient = useAddPatient();
  const deletePatient = useDeletePatient();
  const { isAdmin } = useIsAdmin();
  const { data: searchResults } = useSearchPatients(searchQuery);
  const { data: allPatients } = usePatients();
  const addPrescription = useAddPrescription();
  const villageOptions = Array.from(new Set((allPatients || []).map((p) => p.address?.trim()).filter(Boolean) as string[]));
  const filteredVillages = regForm.address
    ? villageOptions.filter((v) => v.toLowerCase().includes(regForm.address.toLowerCase())).slice(0, 8)
    : villageOptions.slice(0, 8);

  // Auto-search patient by mobile number
  const handleMobileChange = async (mobile: string) => {
    setRegForm(p => ({ ...p, mobile }));
    setExistingPatient(null);
    setMobileSearchStatus("idle");

    const cleanMobile = mobile.replace(/\D/g, "");
    if (cleanMobile.length >= 10) {
      setMobileSearchStatus("searching");
      try {
        const { data, error } = await supabase
          .from("patients")
          .select("*")
          .or(`mobile.eq.${cleanMobile},mobile.eq.+91${cleanMobile},mobile.ilike.%${cleanMobile.slice(-10)}%`)
          .limit(1);

        if (!error && data && data.length > 0) {
          const patient = data[0];
          setExistingPatient(patient);
          setRegForm({
            mobile,
            name: patient.name || "",
            age: patient.age?.toString() || "",
            gender: patient.gender || "",
            address: patient.address || "",
          });
          setMobileSearchStatus("found");
        } else {
          setMobileSearchStatus("new");
        }
      } catch {
        setMobileSearchStatus("new");
      }
    }
  };

  const handleDeletePatient = async (patient: any) => {
    try {
      await deletePatient.mutateAsync({ id: patient.id, logData: patient });
      toast({ title: "🗑️ Patient Deleted", description: `${patient.name} और सभी related records delete हो गए`, duration: 10000 });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regForm.mobile) {
      toast({ title: "Error", description: "Mobile number is required", variant: "destructive" });
      return;
    }
    if (!regForm.name) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }

    try {
      let patientId = existingPatient?.id;

      if (existingPatient) {
        // Update existing patient details if changed
        await supabase.from("patients").update({
          name: regForm.name,
          age: regForm.age ? parseInt(regForm.age) : null,
          gender: regForm.gender || null,
          address: regForm.address || null,
        }).eq("id", existingPatient.id);
        toast({ title: "✅ Patient Found", description: `${regForm.name} already registered — details updated` });
      } else {
        // Create new patient
        const result = await addPatient.mutateAsync({
          name: regForm.name,
          mobile: regForm.mobile.replace(/\D/g, ""),
          age: regForm.age ? parseInt(regForm.age) : null,
          gender: regForm.gender || null,
          address: regForm.address || null,
        });
        patientId = result.id;
        toast({ title: "🆕 New Patient Registered", description: `${regForm.name} successfully registered!` });
      }

      // Navigate to billing page directly after registration
      toast({ title: "✅ Redirecting to Billing", description: "Patient saved — opening billing page..." });
      setTimeout(() => {
        navigate("/billing", { state: { patientId: patientId, patientName: regForm.name } });
      }, 500);

      setRegForm({ name: "", mobile: "", age: "", gender: "", address: "" });
      setExistingPatient(null);
      setMobileSearchStatus("idle");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const savePrescription = async () => {
    if (!rxForm.patient_id || !rxForm.diagnosis) {
      toast({ title: "Error", description: "Select patient and enter diagnosis", variant: "destructive" });
      return false;
    }
    try {
      await addPrescription.mutateAsync({
        patient_id: rxForm.patient_id,
        diagnosis: rxForm.diagnosis,
        medicines: rxForm.medicines,
        advice,
        followup_date: rxForm.followup_date || null,
      });
      return true;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      return false;
    }
  };

  const handlePrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    const saved = await savePrescription();
    if (saved) {
      toast({ title: "Success", description: "Prescription saved!" });
      setRxForm({ patient_id: "", diagnosis: "", medicines: "", followup_date: "" });
      setAdvice("");
    }
  };

  const getFileName = () => {
    const patient = getSelectedPatient(allPatients, rxForm.patient_id);
    const date = new Date().toISOString().slice(0, 10);
    const name = (patient?.name || "Patient").replace(/\s+/g, "_");
    return `Prescription_${name}_${date}`;
  };

  const generatePdfBlob = async (): Promise<Blob | null> => {
    const patient = getSelectedPatient(allPatients, rxForm.patient_id);
    const html = buildPrescriptionHTML(patient, rxForm, advice);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const blob = await html2pdf()
        .set({
          margin: 10,
          filename: getFileName() + ".pdf",
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(container)
        .outputPdf("blob");
      return blob as Blob;
    } catch (err) {
      console.error("PDF generation error:", err);
      return null;
    } finally {
      document.body.removeChild(container);
    }
  };

  const handlePrint = async () => {
    if (!rxForm.patient_id || !rxForm.diagnosis) {
      toast({ title: "Error", description: "Select patient and enter diagnosis first", variant: "destructive" });
      return;
    }
    setIsExporting(true);
    await savePrescription();

    const patient = getSelectedPatient(allPatients, rxForm.patient_id);
    const html = buildPrescriptionHTML(patient, rxForm, advice);
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html><head><title>Prescription - ${patient?.name || "Patient"}</title>
        <style>@media print { body { margin: 0; } }</style>
        </head><body>${html}</body></html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    }
    setIsExporting(false);
  };

  const handlePdfDownload = async () => {
    if (!rxForm.patient_id || !rxForm.diagnosis) {
      toast({ title: "Error", description: "Select patient and enter diagnosis first", variant: "destructive" });
      return;
    }
    setIsExporting(true);
    await savePrescription();

    try {
      const blob = await generatePdfBlob();
      if (!blob) throw new Error("PDF generation failed");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getFileName() + ".pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Success", description: "PDF downloaded!" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setIsExporting(false);
  };

  const handleWhatsApp = async () => {
    if (!rxForm.patient_id || !rxForm.diagnosis) {
      toast({ title: "Error", description: "Select patient and enter diagnosis first", variant: "destructive" });
      return;
    }
    setIsExporting(true);
    await savePrescription();

    const patient = getSelectedPatient(allPatients, rxForm.patient_id);

    try {
      // Generate PDF and upload to storage
      const blob = await generatePdfBlob();
      if (!blob) throw new Error("PDF generation failed");

      const fileName = `${getFileName()}_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("prescriptions")
        .upload(fileName, blob, { contentType: "application/pdf", upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("prescriptions")
        .getPublicUrl(fileName);

      const pdfLink = urlData.publicUrl;

      // Build WhatsApp message with PDF link
      const msg = [
        `📋 *Prescription from ${CLINIC.name}*`,
        `👨‍⚕️ ${CLINIC.doctor}`,
        ``,
        `👤 Patient: ${patient?.name || "N/A"}`,
        `🩺 Diagnosis: ${rxForm.diagnosis}`,
        rxForm.followup_date ? `📅 Next Visit: ${new Date(rxForm.followup_date).toLocaleDateString("en-IN")}` : "",
        ``,
        `📥 Download Prescription PDF:`,
        pdfLink,
        ``,
        `📞 Contact: ${CLINIC.phone}`,
        `📍 ${CLINIC.address}`,
      ].filter(Boolean).join("\n");

      const whatsappUrl = patient?.mobile
        ? `https://wa.me/91${patient.mobile.replace(/\D/g, "").replace(/^91/, "")}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;

      window.open(whatsappUrl, "_blank");
      toast({ title: "Success", description: "WhatsApp share opened with PDF link!" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setIsExporting(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="module-header">OPD Module</h1>
            <p className="text-sm text-muted-foreground">Out Patient Department Management</p>
          </div>
        </div>

        <Tabs defaultValue="register" className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="register">Register</TabsTrigger>
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="prescription">Prescription</TabsTrigger>
          </TabsList>

          <TabsContent value="register">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" />
                  Patient Registration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister} className="space-y-4">
                  {/* Mobile Number FIRST */}
                  <div className="space-y-2">
                    <Label>Mobile Number * (पहले मोबाइल नंबर डालें)</Label>
                    <Input
                      placeholder="10 digit mobile number"
                      value={regForm.mobile}
                      onChange={e => handleMobileChange(e.target.value)}
                      required
                      className="text-lg font-medium"
                      maxLength={13}
                    />
                    {mobileSearchStatus === "searching" && (
                      <p className="text-xs text-muted-foreground animate-pulse">🔍 Searching patient...</p>
                    )}
                    {mobileSearchStatus === "found" && (
                      <p className="text-xs text-green-600 font-medium">✅ Patient already registered — details auto-filled</p>
                    )}
                    {mobileSearchStatus === "new" && (
                      <p className="text-xs text-blue-600 font-medium">🆕 New Patient — please fill details below</p>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Patient Name *</Label>
                      <Input placeholder="Enter full name" value={regForm.name} onChange={e => setRegForm(p => ({ ...p, name: e.target.value }))} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Age</Label>
                      <Input type="number" placeholder="Age" value={regForm.age} onChange={e => setRegForm(p => ({ ...p, age: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Gender</Label>
                      <Select value={regForm.gender} onValueChange={v => setRegForm(p => ({ ...p, gender: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 relative">
                      <Label>Address</Label>
                      <Input
                        placeholder="Village / Address"
                        value={regForm.address}
                        onFocus={() => setShowVillageOptions(true)}
                        onBlur={() => setTimeout(() => setShowVillageOptions(false), 150)}
                        onChange={e => { setRegForm(p => ({ ...p, address: e.target.value })); setShowVillageOptions(true); }}
                      />
                      {showVillageOptions && filteredVillages.length > 0 && (
                        <div className="absolute z-20 w-full rounded-md border bg-card shadow-lg max-h-52 overflow-auto">
                          {filteredVillages.map((village) => (
                            <button key={village} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted" onMouseDown={() => setRegForm(p => ({ ...p, address: village }))}>
                              {village}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <Button type="submit" disabled={addPatient.isPending} className="w-full sm:w-auto">
                      {addPatient.isPending ? "Saving..." : existingPatient ? "✅ Update & Continue" : "🆕 Register New Patient"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="search">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">Search Patient</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input placeholder="Search by mobile number or name" className="flex-1" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  <Button variant="outline" className="gap-2"><Search className="h-4 w-4" />Search</Button>
                </div>
                {searchResults && searchResults.length > 0 ? (
                  <div className="space-y-2">
                    {searchResults.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30">
                        <div>
                          <p className="font-medium text-sm">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.mobile} · {p.age}y · {p.gender}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{p.address}</Badge>
                          {isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete Patient">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Are you sure you want to delete this patient record?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {p.name} की सभी records (appointments, bills, prescriptions, x-rays) permanently delete हो जाएँगी।
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeletePatient(p)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Delete Patient
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : searchQuery ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">No patients found</p>
                ) : (
                  <p className="text-center py-8 text-muted-foreground text-sm">Enter a mobile number or name to search</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="prescription">
            <div className="grid lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="font-heading text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Digital Prescription
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handlePrescription} className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Patient *</Label>
                        <Select value={rxForm.patient_id} onValueChange={v => setRxForm(p => ({ ...p, patient_id: v }))}>
                          <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                          <SelectContent>
                            {allPatients?.map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.name} ({p.mobile})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Follow-up Date</Label>
                        <Input type="date" value={rxForm.followup_date} onChange={e => setRxForm(p => ({ ...p, followup_date: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Diagnosis *</Label>
                      <Input placeholder="e.g., Radius Fracture, Knee OA" value={rxForm.diagnosis} onChange={e => setRxForm(p => ({ ...p, diagnosis: e.target.value }))} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Medicines</Label>
                      <Textarea placeholder="Medicine 1 - Dose - Duration&#10;Medicine 2 - Dose - Duration" rows={4} value={rxForm.medicines} onChange={e => setRxForm(p => ({ ...p, medicines: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Advice</Label>
                      <Textarea placeholder="Special instructions..." rows={3} value={advice} onChange={e => setAdvice(e.target.value)} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={addPrescription.isPending}>
                        {addPrescription.isPending ? "Saving..." : "Save Prescription"}
                      </Button>
                      <Button type="button" variant="outline" className="gap-2" onClick={handlePrint} disabled={isExporting}>
                        <Printer className="h-4 w-4" />Print
                      </Button>
                      <Button type="button" variant="outline" className="gap-2" onClick={handlePdfDownload} disabled={isExporting}>
                        <Download className="h-4 w-4" />PDF
                      </Button>
                      <Button type="button" variant="outline" className="gap-2 text-success" onClick={handleWhatsApp} disabled={isExporting}>
                        <MessageCircle className="h-4 w-4" />WhatsApp
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-heading text-sm">Smart Advice Templates</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Object.keys(orthoAdvice).map((key) => (
                    <Button key={key} variant="outline" size="sm" className="w-full justify-start text-xs"
                      onClick={() => setAdvice(prev => prev ? prev + "\n\n" + orthoAdvice[key] : orthoAdvice[key])}>
                      {key}
                    </Button>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
