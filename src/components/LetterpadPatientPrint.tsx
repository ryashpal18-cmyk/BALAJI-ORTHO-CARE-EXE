import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBranchContext } from "@/lib/branchContext";
import { readBranchTable } from "@/lib/branchData";
import { invoiceNumber, letterpadPatientInvoices } from "@/lib/invoiceNumber";
import { recordId } from "@/lib/patientRecords";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { businessDate } from "@/lib/businessDate";
import { writeReportDocument } from "@/lib/safeReportHtml";
import { buildLetterpadHtml, defaultLetterpadLayout, letterpadFields, letterpadFieldInfo, LETTERPAD_SETTINGS_KEY, normalizeLetterpadLayout } from "@/lib/letterpadPrint";

interface Props { patient: { id: string; name: string; age: number | null; gender: string | null } | null }
export default function LetterpadPatientPrint({ patient }: Props) {
  const [layout, setLayout] = useState(() => {
    try { return normalizeLetterpadLayout(JSON.parse(localStorage.getItem(LETTERPAD_SETTINGS_KEY) || "null")); }
    catch { return normalizeLetterpadLayout(null); }
  });
  const [date, setDate] = useState(businessDate());
  const { selectedBranchId } = useBranchContext();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const { data: bills = [], isLoading: invoicesLoading, isError: invoicesError, refetch } = useQuery({
    queryKey: ["letterpad-bills", selectedBranchId, patient?.id],
    enabled: !!patient,
    queryFn: async () => letterpadPatientInvoices(await readBranchTable("billing", selectedBranchId), patient!.id),
  });
  const selectedBill = bills.find(bill => recordId(bill.id) === recordId(selectedInvoiceId)) || bills[0];
  const registration = selectedBill ? invoiceNumber(selectedBill.id) : "";
  const [printing, setPrinting] = useState(false);
  const formattedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split("-").reverse().join("/") : "";
  const values = { name: patient?.name || "", age: patient?.age != null ? `${patient.age} Y` : "", gender: patient?.gender || "", date: formattedDate, registration: registration.trim() };
  const html = buildLetterpadHtml(values, layout);
  const saveSettings = () => {
    try { localStorage.setItem(LETTERPAD_SETTINGS_KEY, JSON.stringify(normalizeLetterpadLayout(layout))); toast({ title: "प्रिंट पोजिशन इस PC पर सेव हो गई" }); }
    catch { toast({ title: "सेटिंग सेव नहीं हुई", variant: "destructive" }); }
  };
  const print = async () => {
    if (!patient || !registration || !formattedDate || printing) return;
    setPrinting(true);
    try {
      const native = (window as any).electron;
      if (native?.print) await native.print(html, { patientLetterpad: true });
      else {
        const win = window.open("", "_blank");
        if (!win) throw new Error("Print window blocked. Pop-up allow करें।");
        writeReportDocument(win, html);
        await win.document.fonts.ready;
        win.focus(); win.print();
      }
    } catch (error: any) { toast({ title: "प्रिंट नहीं खुला", description: error.message, variant: "destructive" }); }
    finally { setPrinting(false); }
  };
  return <section className="border rounded-xl p-5 space-y-4 bg-card no-print">
    <h2 className="font-semibold text-lg">पहले से छपे A4 लेटरपैड पर मरीज की जानकारी</h2>
    <p className="text-sm text-muted-foreground">केवल नाम, उम्र, लिंग, तारीख और मरीज के बिल का invoice नंबर रजिस्ट्रेशन की जगह छपेगा। कागज का बाकी हिस्सा खाली रहेगा।</p>
    {patient ? <p className="font-semibold">{patient.name} · {patient.age ?? "—"} वर्ष · {patient.gender || "—"}</p> : <p>ऊपर से मरीज चुनें।</p>}
    <div className="grid sm:grid-cols-2 gap-3">
      <div><Label htmlFor="letterpad-date">प्रिंट की तारीख</Label><Input id="letterpad-date" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      <div><Label htmlFor="letterpad-reg">रजिस्ट्रेशन नंबर = Invoice नंबर</Label>
        <select id="letterpad-reg" className="w-full border rounded-md bg-background px-3 py-2 text-sm" disabled={!bills.length || invoicesLoading} value={selectedBill?.id || ""} onChange={e => setSelectedInvoiceId(e.target.value)}>
          {!bills.length && <option value="">{invoicesLoading ? "बिल लोड हो रहे हैं…" : "इस मरीज का बिल नहीं मिला"}</option>}
          {bills.map(bill => <option key={bill.id} value={bill.id}>{invoiceNumber(bill.id)} · {businessDate(bill.created_at)}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">नवीनतम बिल अपने आप चुना जाएगा। पुराने बिल के लिए सूची से चुनें। {patient && !invoicesLoading && !bills.length && "पहले मरीज का बिल सेव करें।"}</p>
        {invoicesError && <p className="text-sm text-destructive">बिल लोड नहीं हुए।</p>}
        <Button size="sm" variant="ghost" disabled={!patient || invoicesLoading} onClick={() => void refetch()}>बिल फिर लोड करें</Button>
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
    {patient && <details><summary className="cursor-pointer text-sm">केवल छपने वाली जानकारी का पूर्वावलोकन</summary><div className="overflow-auto border mt-2"><iframe title="Patient information print preview" sandbox="" srcDoc={html} style={{ width: "210mm", height: "95mm", border: 0 }} /></div></details>}
    <p className="text-sm">Printer: A4 Portrait · Scale 100% / Actual size · Margins None · Headers / Footers बंद। नाम 14 pt, बाकी 12 pt Bold; हर फील्ड की ऊँचाई 12 mm।</p>
    <Button disabled={!patient || !registration || !formattedDate || invoicesLoading || printing} onClick={print}>{printing ? "प्रिंट खुल रहा है…" : "केवल मरीज की जानकारी प्रिंट करें"}</Button>
  </section>;
}
