import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const labels: Record<string,string> = { queued:'प्रतीक्षा', sending:'भेज रहे हैं', sent:'स्वीकार हुआ', failed:'असफल', unconfirmed:'जाँच ज़रूरी', cancelled:'रद्द', expired:'समय समाप्त' };
export default function FestivalGreetings(){
 const bridge=(window as any).electron?.festival;
 const [status,setStatus]=useState<any>(null),[festival,setFestival]=useState('diwali'),[title,setTitle]=useState('दीपावली');
 const [date,setDate]=useState(''),[time,setTime]=useState('09:00'),[wa,setWa]=useState(true),[sms,setSms]=useState(false);
 const [whatsapp,setWhatsapp]=useState(''),[smsText,setSmsText]=useState(''),[preview,setPreview]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[excluded,setExcluded]=useState('');
 const refresh=async()=>{if(!bridge)return;const s=await bridge.status();setStatus(s);return s;};
 useEffect(()=>{let live=true;if(bridge)bridge.status().then((s:any)=>{if(!live)return;setStatus(s);setExcluded(s.exclusions.join('\n'));const f=s.festivals[0];setWhatsapp(f.whatsapp);setSmsText(f.sms);}).catch((e:any)=>{if(live)setError(e.message);});const timer=setInterval(()=>{if(live)void refresh().catch(()=>{});},5000);return()=>{live=false;clearInterval(timer);};},[]);
 const run=async(fn:()=>Promise<any>)=>{setBusy(true);setError('');try{await fn();await refresh();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const input=()=>({festival,title,scheduledAt:date?`${date}T${time}:00+05:30`:'',channels:[...(wa?['whatsapp']:[]),...(sms?['sms']:[])],whatsapp,sms:smsText});
 const edit=(fn:()=>void)=>{fn();setPreview(null);setNotice('');};
 const choose=(id:string)=>edit(()=>{const f=status.festivals.find((x:any)=>x.id===id);setFestival(id);setTitle(f.name);setWhatsapp(f.whatsapp);setSmsText(f.sms);});
 return <DashboardLayout><div className="space-y-6 page-enter">
  <div><h1 className="module-header">त्योहार शुभकामनाएँ</h1><p className="text-sm text-muted-foreground">सभी अलग-अलग मोबाइल नंबरों पर WhatsApp text और सामान्य SMS — तारीख व समय तय करें।</p></div>
  {!bridge?<p>यह सुविधा Windows EXE में उपलब्ध है।</p>:<>
  <Card><CardHeader><CardTitle>त्योहार और संदेश तैयार करें</CardTitle></CardHeader><CardContent className="space-y-4">
   <p className="text-sm text-muted-foreground">हर वर्ष त्योहार की सही तारीख चुनकर अभियान सेव करें। समय भारतीय समय (IST) है। PC, सॉफ्टवेयर, Admin लॉगिन और इंटरनेट चालू होने पर भेजेगा। केवल चुने हुए दिन भेजेगा; बची हुई कतार अगले दिन अपने आप समाप्त होगी।</p>
   <div className="grid gap-4 md:grid-cols-2">
    <div className="space-y-2"><Label htmlFor="festival">त्योहार</Label><select id="festival" className="w-full rounded border bg-background p-2" value={festival} onChange={e=>choose(e.target.value)}>{status?.festivals.map((f:any)=><option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
    <div className="space-y-2"><Label htmlFor="festival-name">अभियान का नाम</Label><Input id="festival-name" value={title} maxLength={80} onChange={e=>edit(()=>setTitle(e.target.value))}/></div>
    <div className="space-y-2"><Label htmlFor="festival-date">त्योहार की तारीख</Label><Input id="festival-date" type="date" value={date} onChange={e=>edit(()=>setDate(e.target.value))}/></div>
    <div className="space-y-2"><Label htmlFor="festival-time">भेजना शुरू करने का समय (IST)</Label><Input id="festival-time" type="time" value={time} onChange={e=>edit(()=>setTime(e.target.value))}/></div>
   </div>
   <div className="flex flex-wrap gap-6"><label className="flex items-center gap-2"><input type="checkbox" checked={wa} onChange={e=>edit(()=>setWa(e.target.checked))}/>WhatsApp text</label><label className="flex items-center gap-2"><input type="checkbox" checked={sms} onChange={e=>edit(()=>setSms(e.target.checked))}/>सामान्य SMS</label></div>
   {wa&&<div className="space-y-2"><Label htmlFor="festival-wa">WhatsApp संदेश</Label><Textarea id="festival-wa" rows={7} value={whatsapp} maxLength={1500} onChange={e=>edit(()=>setWhatsapp(e.target.value))}/><p className="text-xs text-muted-foreground">WhatsApp पेज पर QR जोड़कर Connected करें। यह text संदेश है; PDF संलग्न नहीं होगी।</p></div>}
   {sms&&<div className="space-y-2"><Label htmlFor="festival-sms">SMS संदेश</Label><Textarea id="festival-sms" rows={4} value={smsText} maxLength={1500} onChange={e=>edit(()=>setSmsText(e.target.value))}/><p className="text-xs text-muted-foreground">{smsText.length} अक्षर · हिंदी SMS के लगभग {smsText.length<=70?1:Math.ceil(smsText.length/67)} भाग प्रति नंबर। अंतिम शुल्क gateway/SIM पर निर्भर है। SMS gateway: {status?.smsReady?'तैयार':'सेटिंग उपलब्ध नहीं — SMS प्रतीक्षा में रहेगा'}।</p></div>}
   <Button disabled={busy||!status} onClick={()=>void run(async()=>setPreview(await bridge.preview(input())))}>संदेश और नंबरों की सूची देखें</Button>
  </CardContent></Card>
  {preview&&<Card><CardHeader><CardTitle>भेजने से पहले जाँचें</CardTitle></CardHeader><CardContent className="space-y-4">
   <p><strong>{preview.count} अलग मोबाइल नंबर</strong> · {preview.duplicates} दोहराए नंबर हटाए · {preview.invalid} अमान्य · {preview.excluded} बंद नंबर</p>
   <p>{title} · {date} · {time} IST · {preview.channels.join(' + ')} · कुल {preview.count*preview.channels.length} संदेश</p>
   {preview.estimate&&<div className="rounded border p-3 text-sm"><p>कुल {preview.estimate.messageCount} संदेश · कम से कम लगभग {Math.max(1,Math.ceil(preview.estimate.minimumSeconds/60))} मिनट। सबसे जल्दी पूरा होने का अनुमान: {new Date(preview.estimate.earliestFinishAt).toLocaleString('hi-IN',{timeZone:'Asia/Kolkata'})} IST।</p><p className="text-muted-foreground">इंटरनेट, WhatsApp कनेक्शन, retries और दूसरे अभियानों के {preview.estimate.otherPending} pending संदेशों से अधिक समय लग सकता है।</p>{!preview.estimate.fitsDay&&<p role="alert" className="text-destructive">चुने हुए दिन में सभी संदेश पूरे नहीं हो पाएँगे। समय पहले रखें या माध्यम/सूची कम करें।</p>}</div>}
   {wa&&<div><p className="font-medium">WhatsApp का अंतिम संदेश</p><p className="whitespace-pre-wrap rounded border p-3">{preview.messages.whatsapp}</p></div>}
   {sms&&<div><p className="font-medium">SMS का अंतिम संदेश</p><p className="whitespace-pre-wrap rounded border p-3">{preview.messages.sms}</p></div>}
   <details><summary className="cursor-pointer">सभी प्राप्तकर्ता देखें ({preview.count})</summary><div className="max-h-60 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>नाम / परिवार</th><th>मोबाइल</th></tr></thead><tbody>{preview.rows.map((r:any)=><tr key={r.mobile}><td className="p-2">{r.name}</td><td>{r.mobile}</td></tr>)}</tbody></table></div></details>
   <Button disabled={busy||!preview.count||preview.estimate?.fitsDay===false} onClick={()=>void run(async()=>{await bridge.create({...input(),fingerprint:preview.fingerprint});setPreview(null);setNotice('अभियान सेव हुआ। चुने हुए समय पर भेजना शुरू होगा।');})}>इन {preview.count} नंबरों के लिए अभियान सेव करें</Button>
  </CardContent></Card>}
  {error&&<p role="alert" className="text-destructive">{error}</p>}{notice&&<p role="status" className="text-green-700">{notice}</p>}
  <Card><CardHeader><CardTitle>इन नंबरों पर त्योहार संदेश बंद रखें</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm">जो नंबर शुभकामना संदेश नहीं चाहते, उन्हें यहाँ डालें। बिल के संदेश पर इसका असर नहीं पड़ेगा।</p><Textarea aria-label="त्योहार संदेश बंद वाले नंबर" rows={3} value={excluded} onChange={e=>setExcluded(e.target.value)} placeholder="एक लाइन में एक मोबाइल नंबर"/><Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{await bridge.exclude(excluded);setPreview(null);setNotice('बंद नंबरों की सूची सेव हुई।');})}>बंद नंबर सेव करें</Button></CardContent></Card>
  <Card><CardHeader><CardTitle>सेव किए हुए अभियान</CardTitle></CardHeader><CardContent className="space-y-4">
   <p className="text-xs text-muted-foreground">हर 30 सेकंड में एक संदेश भेजने की कोशिश होगी। Sent का मतलब माध्यम ने स्वीकार किया; मरीज तक पहुँचने या पढ़ने की पुष्टि नहीं है। अनिश्चित संदेश अपने आप दोबारा नहीं भेजेंगे।</p>
   {!status?.campaigns.length&&<p>अभी कोई अभियान नहीं है।</p>}
   {status?.campaigns.map((c:any)=><div className="space-y-3 rounded border p-3" key={c.id}><p className="font-medium">{c.title} · {new Date(c.scheduledAt).toLocaleString('hi-IN',{timeZone:'Asia/Kolkata'})} IST</p><p>अभियान: {c.state==='active'?'चालू':c.state==='paused'?'रोका हुआ':'रद्द'} · {Object.entries(c.counts).map(([s,n])=>`${labels[s]||s}: ${n}`).join(' · ')}</p><p className="text-xs text-muted-foreground">बाकी संदेश: {c.estimate?.messageCount??0} · कम से कम लगभग {Math.ceil((c.estimate?.minimumSeconds||0)/60)} मिनट{c.state==='paused'?' (अभियान रुका है)':''}। कनेक्शन और retries से समय बढ़ सकता है।</p><div className="flex flex-wrap gap-2">{c.state==='active'&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void run(()=>bridge.change(c.id,'pause'))}>रोकें</Button>}{c.state==='paused'&&<Button size="sm" disabled={busy} onClick={()=>void run(()=>bridge.change(c.id,'resume'))}>फिर चालू करें</Button>}{c.state!=='cancelled'&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void run(()=>bridge.change(c.id,'cancel'))}>बाकी संदेश रद्द करें</Button>}</div>
    <details><summary className="cursor-pointer text-sm">हर नंबर की स्थिति देखें</summary><div className="max-h-72 space-y-2 overflow-auto">{c.jobs.map((j:any)=><div className="rounded border p-2 text-sm" key={j.id}><p>{j.mobile} · {j.channel} · {labels[j.state]||j.state}</p>{j.error&&<p>{j.error}</p>}{['unconfirmed','failed'].includes(j.state)&&<div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>{if(confirm('चैट या SMS gateway में संदेश भेजा हुआ मिल गया है?'))void run(()=>bridge.review(c.id,j.id,'sent'));}}>जाँच में भेजा हुआ मिला</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>void run(()=>bridge.review(c.id,j.id,'cancel'))}>रद्द करें</Button></div>}</div>)}</div></details>
   </div>)}
  </CardContent></Card>
  </>}
 </div></DashboardLayout>;
}
