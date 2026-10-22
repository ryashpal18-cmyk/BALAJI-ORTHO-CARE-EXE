import { useEffect, useState } from "react";
import { businessDate } from "@/lib/businessDate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
const money=(n:number)=>"₹"+(n/100).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
function lastMonth(){const [y,m]=businessDate().slice(0,7).split("-").map(Number);return new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7);}
export function MonthlyReportPanel(){
  const bridge=(window as any).electron?.monthly;
  const [mobile,setMobile]=useState(""),[enabled,setEnabled]=useState(false),[month,setMonth]=useState(lastMonth),[preview,setPreview]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[configured,setConfigured]=useState(false),[dirty,setDirty]=useState(false);
  useEffect(()=>{if(bridge)void bridge.settings().then((r:any)=>{setMobile(r.mobile);setEnabled(r.enabled);setConfigured(!!r.mobile);}).catch((e:any)=>setError(e.message));},[]);
  if(!bridge)return null;
  const action=async(fn:()=>Promise<void>)=>{setBusy(true);setError("");try{await fn();}catch(e:any){setError(e?.message||"MONTHLY-001: Report उपलब्ध नहीं है।");}finally{setBusy(false);}};
  const save=()=>action(async()=>{const r=await bridge.saveSettings({mobile,enabled});setMobile(r.mobile);setEnabled(r.enabled);setConfigured(!!r.mobile);setDirty(false);setPreview(null);toast({title:"मासिक report की setting save हो गई",description:r.enabled?"इस महीने से शुरू होकर अगले महीने की पहली तारीख सुबह 9 बजे report तैयार होगी।":"Automatic report बंद है; PDF निकाल सकते हैं।"});});
  const load=()=>action(async()=>setPreview(await bridge.preview(month)));
  const pdf=(save:boolean)=>action(async()=>{const r=await bridge.pdf({month:preview.month,fingerprint:preview.fingerprint,save});if(save&&r?.success)toast({title:"मासिक PDF save हो गई"});});
  const send=()=>action(async()=>{const job=await bridge.enqueue({month:preview.month,fingerprint:preview.fingerprint,configId:preview.configId});toast({title:job.state==="sent"?"यह report पहले भेजी जा चुकी है":"मासिक PDF WhatsApp queue में है",description:"स्थिति ऊपर WhatsApp queue में दिखेगी।"});});
  return <Card id="monthly-report"><CardHeader><CardTitle>मासिक हिसाब PDF / Automatic WhatsApp</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm">Report में मरीजों के नाम, नंबर, bills और payments होंगे। इसे पाने वाले अपने/हिसाब देखने वाले व्यक्ति का सही WhatsApp नंबर सहेजें। यह पूरी clinic report उसी एक नंबर पर जाएगी।</p>
    <label className="block text-sm">Report प्राप्त करने वाला नंबर<Input aria-label="Monthly report recipient" type="tel" value={mobile} disabled={busy} placeholder="10 digit number या +91" onChange={e=>{setMobile(e.target.value);setDirty(true);setPreview(null);}}/></label>
    <label className="flex items-center gap-2 text-sm"><input aria-label="Automatic monthly report" type="checkbox" checked={enabled} disabled={busy} onChange={e=>{setEnabled(e.target.checked);setDirty(true);setPreview(null);}}/>हर महीने की पहली तारीख सुबह 9 बजे पिछला महीना अपने-आप भेजें</label>
    {dirty&&<p className="text-sm">नया नंबर/setting अभी save नहीं है। Automatic भेजना पिछली saved setting पर रहेगा।</p>}
    <Button disabled={busy} onClick={()=>void save()}>नंबर और setting Save करें</Button>
    <p className="text-xs text-muted-foreground">समय भारत का है। PC/software और जुड़ा WhatsApp चालू चाहिए। बंद हो तो अगली बार खुलने पर छूटी report queue होगी। ON/नंबर बदलने पर नई schedule इस महीने से शुरू होगी; उससे पुराने महीने अपने-आप नहीं भेजेगा। नया नंबर save करने से पुरानी unsent reports cancel होंगी; पहले से भेजा message वापस नहीं होता।</p>
    <div className="flex flex-wrap items-end gap-2"><label className="text-sm">महीना<Input aria-label="Monthly report month" type="month" value={month} max={businessDate().slice(0,7)} disabled={busy} onChange={e=>{setMonth(e.target.value);setPreview(null);}}/></label><Button disabled={busy||!month} variant="outline" onClick={()=>void load()}>हिसाब देखें / PDF तैयार करें</Button></div>
    {busy&&<p role="status">कृपया प्रतीक्षा करें…</p>}{error&&<p role="alert" className="text-destructive break-words">{error}</p>}
    {preview&&<div className="space-y-3 rounded border p-3"><p className="font-medium">{preview.month}{preview.partial?" — चालू महीना, आंशिक report":""}</p><dl className="grid grid-cols-2 gap-2 text-sm"><dt>महीने के bills का Net</dt><dd>{money(preview.totals.monthNet)}</dd><dt>महीने में प्राप्त (net entries)</dt><dd>{money(preview.totals.received)}</dd><dt>वर्तमान कुल बकाया</dt><dd>{money(preview.totals.currentDue)}</dd><dt>मरीज / Bills / Receipts</dt><dd>{preview.patientCount} / {preview.billCount} / {preview.receiptCount}</dd><dt>अज्ञात तारीख की पुरानी जमा</dt><dd>{money(preview.undatedPaid)}</dd></dl>
      <p className="text-xs text-muted-foreground">बकाया report बनने के समय का है, महीने के अंत का पुराना balance नहीं। महीने की प्राप्ति receipt की तारीख से है; पुराने bills पर इस महीने जमा भी शामिल है। केवल इस PC के उपलब्ध records हैं।</p>
      {preview.warnings.map((w:string,i:number)=><p key={i} className="text-xs text-amber-800 break-words">{w}</p>)}
      <p className="text-sm">प्राप्तकर्ता: {preview.mobile||"पहले नंबर Save करें"}</p><div className="flex flex-wrap gap-2"><Button disabled={busy} variant="outline" onClick={()=>void pdf(false)}>Monthly PDF खोलें</Button><Button disabled={busy} variant="outline" onClick={()=>void pdf(true)}>Monthly PDF Save करें</Button><Button disabled={busy||dirty||!preview.mobile||!configured} onClick={()=>void send()}>इस नंबर पर अभी भेजें</Button></div>
    </div>}
  </CardContent></Card>;
}
