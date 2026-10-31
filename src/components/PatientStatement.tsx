import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
type Preview={patient:{id:string;name:string;mobile:string};billCount:number;paymentCount:number;wallet?:number;totals:{gross:number;discount:number;net:number;paid:number;due:number;credit:number};warnings:string[];pending:number;excluded:number;fingerprint:string;scope:string;generatedAt:string};
const money=(n:number)=>"₹"+(n/100).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
export function PatientStatement({patientId}:{patientId:string}) {
  const navigate=useNavigate(),bridge=(window as any).electron?.statement;
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState("");
  const load=async()=>{setBusy(true);setError("");setPreview(null);setOpen(true);try{setPreview(await bridge.preview(patientId));}catch(e:any){setError(e.message||"STATEMENT-001: Statement उपलब्ध नहीं है।");}finally{setBusy(false);}};
  const pdf=async(save:boolean)=>{if(!preview)return;setBusy(true);setError("");try{const r=await bridge.pdf(patientId,preview.fingerprint,save);if(r?.success&&save)toast({title:"Statement PDF save हो गया"});}catch(e:any){setError(e.message||"STATEMENT-006: PDF नहीं बनी।");}finally{setBusy(false);}};
  const enqueue=async()=>{if(!preview)return;setBusy(true);setError("");try{const job=await bridge.enqueue(patientId,preview.fingerprint);toast({title:job.state==="sent"?"यही statement पहले भेजा हुआ दर्ज है":"Statement WhatsApp queue में है",description:job.state==="sent"?"Duplicate PDF फिर नहीं भेजा गया।":"WhatsApp जुड़ा और इंटरनेट चालू होने पर भेजेगा।"});setOpen(false);navigate("/whatsapp");}catch(e:any){setError(e.message||"STATEMENT-003: Queue नहीं बनी।");}finally{setBusy(false);}};
  if(!bridge)return null;
  return <>
    <Button data-diagnostic-action="patient-statement" variant="outline" disabled={busy} onClick={()=>void load()}>Patient Statement / पूरा हिसाब PDF</Button>
    <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><DialogContent className="max-h-[88vh] overflow-y-auto"><DialogHeader><DialogTitle>Patient Account Statement</DialogTitle></DialogHeader>
      {busy&&<p role="status">कृपया प्रतीक्षा करें…</p>}{error&&<p role="alert" className="text-destructive break-words">{error}</p>}
      {preview&&<div className="space-y-4">
        <div><p className="font-semibold">{preview.patient.name}</p><p className="text-sm">WhatsApp number: {preview.patient.mobile||"नंबर दर्ज नहीं है"}</p><p className="text-xs text-muted-foreground">{preview.scope}</p></div>
        <dl className="grid grid-cols-2 gap-3 rounded border p-3 text-sm"><dt>उपलब्ध Advance</dt><dd>{money(preview.wallet||0)}</dd><dt>Bills</dt><dd>{preview.billCount}</dd><dt>कुल मूल राशि</dt><dd>{money(preview.totals.gross)}</dd><dt>Discount</dt><dd>{money(preview.totals.discount)}</dd><dt>कुल Net</dt><dd>{money(preview.totals.net)}</dd><dt>कुल जमा</dt><dd>{money(preview.totals.paid)}</dd><dt className="font-semibold">कुल बकाया</dt><dd className="font-semibold">{money(preview.totals.due)}</dd></dl>
        {preview.totals.credit>0&&<p className="text-sm">अतिरिक्त जमा: {money(preview.totals.credit)}। दूसरे bill में अपने आप समायोजित नहीं किया गया।</p>}
        <p className="text-xs text-muted-foreground">PDF में सभी उपलब्ध bills और receipt history होगी। पुराने संयुक्त payments में अलग तारीख उपलब्ध नहीं हो सकती। Cloud या दूसरे PC के छूटे records इस report में अपने आप नहीं जुड़ते।</p>
        {(preview.pending>0||preview.excluded>0)&&<p className="text-sm">Pending-sync bills: {preview.pending} · रद्द bills totals से अलग: {preview.excluded}</p>}
        {preview.warnings.map((w,i)=><p key={i} className="text-sm text-amber-800 break-words">{w}</p>)}
        <div className="flex flex-wrap gap-2"><Button disabled={busy} variant="outline" onClick={()=>void pdf(false)}>PDF खोलें</Button><Button disabled={busy} variant="outline" onClick={()=>void pdf(true)}>PDF Save करें</Button><Button data-diagnostic-action="send-patient-statement" disabled={busy||!preview.patient.mobile||!preview.billCount} onClick={()=>void enqueue()}>इसी मरीज को WhatsApp भेजें</Button></div>
      </div>}
      <Button disabled={busy} variant="ghost" onClick={()=>void load()}>हिसाब फिर पढ़ें</Button>
    </DialogContent></Dialog>
  </>;
}
