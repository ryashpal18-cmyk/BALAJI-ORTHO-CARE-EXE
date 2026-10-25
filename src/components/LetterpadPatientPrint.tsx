import { useState } from "react";
import designUrl from "@/assets/clinic-letterpad.jpg";
import { printPatientLetterpad } from "@/lib/patientPrint";
import { refreshPatientRegistration } from "@/lib/patientRegistration";
import A4PrintPreview from "@/components/A4PrintPreview";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { useBranchContext } from "@/lib/branchContext";
import { readBranchTable } from "@/lib/branchData";
import { recordId } from "@/lib/patientRecords";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { businessDate } from "@/lib/businessDate";
import { buildLetterpadHtml, defaultLetterpadLayout, letterpadFields, letterpadFieldInfo, LETTERPAD_SETTINGS_KEY, normalizeLetterpadLayout } from "@/lib/letterpadPrint";

interface Props { patient: { id: string; name: string; age: number | null; gender: string | null; registration_number?: string | null } | null }
export default function LetterpadPatientPrint({ patient }: Props) {
  const [layout, setLayout] = useState(() => {
    try { return normalizeLetterpadLayout(JSON.parse(localStorage.getItem(LETTERPAD_SETTINGS_KEY) || "null")); }
    catch { return normalizeLetterpadLayout(null); }
  });
  const [date, setDate] = useState(businessDate());
  const [paper, setPaper] = useState<"information" | "complete">("information");
  const [checking, setChecking] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState("");
  const { selectedBranchId } = useBranchContext();
  const { data: registeredPatient, isLoading: registrationLoading, refetch } = useQuery({
    queryKey: ["patient-registration", selectedBranchId, patient?.id],
    enabled: !!patient,
    queryFn: async () => (await readBranchTable("patients", selectedBranchId)).find(p => recordId(p.id) === recordId(patient!.id)) || null,
  });
  const registration = registeredPatient?.registration_number || patient?.registration_number || "";
  const [printing, setPrinting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const formattedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split("-").reverse().join("/") : "";
  const values = { name: patient?.name || "", age: patient?.age != null ? `${patient.age} Y` : "", gender: patient?.gender || "", date: formattedDate, registration: registration.trim() };
  const html = buildLetterpadHtml(values, layout, { background: paper === "complete" ? designUrl : undefined });
  const refreshRegistration = async () => {
    if (checking || !patient) return;
    setChecking(true);
    try { const result = await refreshPatientRegistration(patient.id); setRegistrationMessage(result.message); await refetch(); }
    catch (error: any) { setRegistrationMessage(error.message || "नंबर की जाँच नहीं हुई।"); }
    finally { setChecking(false); }
  };
  const saveSettings = () => {
    try { localStorage.setItem(LETTERPAD_SETTINGS_KEY, JSON.stringify(normalizeLetterpadLayout(layout))); toast({ title: "प्रिंट पोजिशन इस PC पर सेव हो गई" }); }
    catch { toast({ title: "सेटिंग सेव नहीं हुई", variant: "destructive" }); }
  };
  const print = async () => {
    if (!patient || !registration || !formattedDate || printing) return;
    setPrinting(true);
    try {
      await printPatientLetterpad(html);
    } catch (error: any) { toast({ title: "प्रिंट नहीं खुला", description: error.message, variant: "destructive" }); }
    finally { setPrinting(false); }
  };
  return <section className="border rounded-xl p-5 space-y-4 bg-card no-print">
    <h2 className="font-semibold text-lg">मरीज की जानकारी / पूरा A4 लेटरपैड</h2>
    <p className="text-sm text-muted-foreground">ऊपर की पट्टी में मरीज की जानकारी अपने आप भरेगी। नीचे के Vitals, Complaints और Rx हिस्से खाली रहेंगे।</p>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Print paper options">
      <Button variant={paper === "information" ? "default" : "outline"} onClick={() => setPaper("information")}>1. केवल Patient Information</Button>
      <Button variant={paper === "complete" ? "default" : "outline"} onClick={() => setPaper("complete")}>2. पूरा Letterpad + Patient Information</Button>
    </div>
    <p className="text-sm">{paper === "information" ? "पहले से छपे लेटरपैड के लिए: केवल नाम, BAOR नंबर, उम्र, लिंग और तारीख छपेगी।" : "सादे A4 कागज के लिए: आपका पूरा final design और मरीज की भरी हुई जानकारी छपेगी।"}</p>
    {patient ? <p className="font-semibold">{patient.name} · {patient.age ?? "—"} वर्ष · {patient.gender || "—"}</p> : <p>ऊपर से मरीज चुनें।</p>}
    <div className="grid sm:grid-cols-2 gap-3">
      <div><Label htmlFor="letterpad-date">प्रिंट की तारीख</Label><Input id="letterpad-date" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      <div><Label htmlFor="letterpad-reg">मरीज का रजिस्ट्रेशन नंबर</Label>
        <Input id="letterpad-reg" readOnly value={registration} placeholder={registrationLoading ? "लोड हो रहा है…" : "रजिस्ट्रेशन नंबर अभी उपलब्ध नहीं है"} />
        <p className="text-xs text-muted-foreground">यह मरीज का स्थायी नंबर है। बिल बनाए बिना भी प्रिंट कर सकते हैं।</p>
        {patient && !registrationLoading && !registration && <p className="text-sm text-destructive">मरीज सेव है, लेकिन BAOR नंबर स्थानीय रिकॉर्ड में नहीं है। नीचे नंबर की जाँच करें।</p>}
        <Button size="sm" variant="outline" disabled={!patient || checking} onClick={() => void refreshRegistration()}>{checking ? "नंबर की जाँच हो रही है…" : "नंबर की जाँच / डाउनलोड करें"}</Button>
        {registrationMessage && <p role="status" className="text-sm">{registrationMessage}</p>}
      </div>
    </div>
    <details className="border rounded-lg p-3">
      <summary className="cursor-pointer font-medium">प्रिंट पोजिशन / लेटरपैड सेटिंग</summary>
      <p className="text-sm my-3">माप A4 के ऊपरी बाएँ कोने से mm में हैं। X दाएँ की दूरी, Y ऊपर से दूरी है। पहली बार सादे कागज पर जाँचकर पोजिशन मिलाएँ।</p>
      <div className="grid grid-cols-2 gap-3 mb-3">{(["offsetX", "offsetY"] as const).map(key => <div key={key}><Label htmlFor={key}>{key === "offsetX" ? "पूरे प्रिंट को दाएँ (+) / बाएँ (−) mm" : "पूरे प्रिंट को नीचे (+) / ऊपर (−) mm"}</Label><Input id={key} type="number" min={-20} max={20} step="0.5" value={layout[key]} onChange={e => setLayout({ ...layout, [key]: Number(e.target.value) })} /></div>)}</div>
      <label className="flex gap-2 items-center text-sm mb-3"><input type="checkbox" checked={layout.labels} onChange={e => setLayout({ ...layout, labels: e.target.checked })} />Name / Age / Sex / Date / Reg. No. भी छापें (अगर लेटरपैड पर नहीं छपे हैं)</label>
      <div className="overflow-auto"><table className="text-sm w-full"><thead><tr><th className="text-left">फील्ड</th><th>X mm</th><th>Y mm</th><th>फॉन्ट</th></tr></thead><tbody>{letterpadFields.map(field => <tr key={field}><td>{letterpadFieldInfo[field].label}</td>{(["x", "y"] as const).map(axis => <td key={axis} className="p-1"><Input aria-label={`${field} ${axis} mm`} type="number" step="0.5" min={axis === "x" ? letterpadFieldInfo[field].labelWidth : 0} max={axis === "x" ? 210 - letterpadFieldInfo[field].width : 285} value={layout.positions[field][axis]} onChange={e => setLayout({ ...layout, positions: { ...layout.positions, [field]: { ...layout.positions[field], [axis]: Number(e.target.value) } } })} /></td>)}<td className="whitespace-nowrap">{letterpadFieldInfo[field].size} pt Bold</td></tr>)}</tbody></table></div>
      <div className="flex flex-wrap gap-2 mt-3"><Button onClick={saveSettings} variant="outline">पोजिशन सेव करें</Button><Button variant="ghost" onClick={() => setLayout(normalizeLetterpadLayout(defaultLetterpadLayout))}>डिफ़ॉल्ट पोजिशन</Button></div>
    </details>

    <p className="text-sm">Printer: A4 Portrait · Scale 100% / Actual size · Margins None · Headers / Footers बंद। नाम अधिकतम 14 pt, बाकी अधिकतम 12 pt Bold; लंबे टेक्स्ट का आकार अपने आप फिट होगा; हर फील्ड की ऊँचाई 12 mm।</p>
    <Button disabled={!patient} onClick={() => setPreviewOpen(true)}>प्रिंट प्रीव्यू देखें / Print Preview</Button>
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent className="patient-print-preview max-w-4xl w-[calc(100%_-_2rem)] no-print" style={{ top: 16, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle>Prescription Print Preview · A4</DialogTitle>
          <DialogDescription>पूरी 210 × 297 mm शीट का पूर्वावलोकन। प्रिंट में यही मरीज की जानकारी और पोजिशन जाएगी।</DialogDescription>
        </DialogHeader>
        <A4PrintPreview html={html} />
        {!registration && <p role="status" className="text-sm text-destructive">रजिस्ट्रेशन नंबर अभी उपलब्ध नहीं है। पीछे जाकर नंबर की जाँच करें; गलत नंबर के साथ प्रिंट नहीं होगा।</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setPreviewOpen(false)}>वापस जाएँ</Button>
          <Button disabled={!patient || !registration || !formattedDate || registrationLoading || printing} onClick={print}>{printing ? "प्रिंट खुल रहा है…" : "प्रिंट करें / Print"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
