import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { OutreachStatus } from './OutreachStatus';
export function VillageMessagePanel({patientIds,title,disabled=false}:{patientIds:string[];title:string;disabled?:boolean}){
 const bridge=(window as any).electron?.outreach;
 const [open,setOpen]=useState(false),[wa,setWa]=useState(true),[sms,setSms]=useState(false),[message,setMessage]=useState('नमस्ते [NAME] जी,\nBalaji Digital X-Ray & Ortho Care Center की ओर से सूचना।\n'),[preview,setPreview]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[campaign,setCampaign]=useState(''),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const identity=JSON.stringify([...patientIds].sort());
 useEffect(()=>{setPreview(null);},[identity,title,wa,sms,message]);
 const input=()=>({requestId,patientIds,title,channels:[...(wa?['whatsapp']:[]),...(sms?['sms']:[])],whatsapp:message,sms:message});
 const run=async(fn:()=>Promise<any>)=>{setBusy(true);setError('');try{await fn();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 if(!bridge)return null;
 return <div className="space-y-3"><Button disabled={disabled||!patientIds.length} onClick={()=>setOpen(v=>!v)}>चुने हुए गाँव / सूची को WhatsApp या SMS भेजें</Button>
 {open&&<Card><CardHeader><CardTitle>{title} — संदेश तैयार करें</CardTitle></CardHeader><CardContent className="space-y-3">
 <p className="text-sm">पूरी filtered सूची चुनी है, केवल स्क्रीन के 50 मरीज नहीं। सही साझा family नंबर पर हर माध्यम से एक बार संदेश जाएगा।</p>
 <div className="flex gap-4"><label className="flex items-center gap-2"><input type="checkbox" checked={wa} onChange={e=>setWa(e.target.checked)}/>WhatsApp text</label><label className="flex items-center gap-2"><input type="checkbox" checked={sms} onChange={e=>setSms(e.target.checked)}/>सामान्य SMS</label></div>
 <Textarea aria-label="Village message" rows={5} maxLength={1500} value={message} onChange={e=>setMessage(e.target.value)}/><p className="text-xs text-muted-foreground">[NAME] की जगह मरीज / परिवार का नाम लगेगा। Preview तक कोई संदेश नहीं जाएगा।</p>
 <Button variant="outline" disabled={busy||disabled} onClick={()=>void run(async()=>setPreview(await bridge.preview(input())))}>अंतिम सूची और संदेश देखें</Button>
 {preview&&<div className="space-y-3 rounded border p-3"><p><strong>{preview.count} अलग नंबर</strong> · {preview.duplicates} दोहराए · {preview.invalid} अमान्य · {preview.excluded} बंद नंबर</p><p>कुल {preview.count*preview.channels.length} संदेश · कम से कम लगभग {Math.ceil(preview.durationSeconds/60)} मिनट (कनेक्शन और भेजने में लगने वाला समय अतिरिक्त)।</p>
 <p className="text-xs text-muted-foreground">पहले प्राप्तकर्ता के लिए अंतिम संदेश का उदाहरण:</p><p className="whitespace-pre-wrap">{preview.samples?.whatsapp||preview.samples?.sms||message}</p><details><summary>सभी प्राप्तकर्ता देखें</summary><div className="max-h-48 overflow-auto">{preview.rows.map((p:any)=><p key={p.mobile}>{p.name} · {p.mobile}</p>)}</div></details>
 <Button disabled={busy||disabled||!preview.count} onClick={()=>void run(async()=>{if(!confirm(`इन ${preview.count} अलग नंबरों पर ${preview.channels.join(' + ')} से संदेश भेजना शुरू करें?`))return;const id=await bridge.enqueue({...input(),fingerprint:preview.fingerprint});setCampaign(id);setPreview(null);setRequestId(crypto.randomUUID());})}>इन {preview.count} नंबरों पर भेजना शुरू करें</Button></div>}
 {error&&<p role="alert" className="text-destructive">{error}</p>}
 </CardContent></Card>}{campaign&&<OutreachStatus campaignId={campaign} compact/>}
 </div>;
}
