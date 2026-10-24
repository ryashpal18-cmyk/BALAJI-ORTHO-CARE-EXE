import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
const labels:Record<string,string>={queued:'प्रतीक्षा',sending:'भेज रहे हैं',sent:'स्वीकार हुआ',failed:'असफल',unconfirmed:'जाँच ज़रूरी',cancelled:'रद्द'};
export function OutreachStatus({ campaignId, compact=false }: {campaignId?:string;compact?:boolean}){
 const bridge=(window as any).electron?.outreach;
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=async()=>{if(bridge)setData(await bridge.status());};
 useEffect(()=>{let live=true;const read=async()=>{try{const d=await bridge?.status();if(live)setData(d);}catch(e:any){if(live)setError(e.message);}};void read();const t=setInterval(read,5000);return()=>{live=false;clearInterval(t);};},[]);
 const run=async(fn:()=>Promise<any>)=>{setBusy(true);setError('');try{await fn();await refresh();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 if(!bridge)return null;
 const rows=(data?.campaigns||[]).filter((c:any)=>!campaignId||c.id===campaignId);
 return <Card><CardHeader><CardTitle>{compact?'भेजने की स्थिति':'बकाया भुगतान पुष्टि और सामूहिक संदेश'}</CardTitle></CardHeader><CardContent className="space-y-4">
 {!compact&&data&&<div className="space-y-2 rounded border p-3"><p className="font-medium">नया बकाया भुगतान जमा होने पर अपने आप पुष्टि भेजें</p>
 <label className="flex items-center gap-2"><input type="checkbox" checked={data.settings.enabled} disabled={busy} onChange={e=>void run(()=>bridge.settings({...data.settings,enabled:e.target.checked}))}/>ऑटो पुष्टि चालू</label>
 <div className="flex flex-wrap gap-4">{['whatsapp','sms'].map(ch=><label className="flex items-center gap-2" key={ch}><input type="checkbox" disabled={busy} checked={data.settings.channels.includes(ch)} onChange={e=>void run(()=>bridge.settings({...data.settings,channels:e.target.checked?[...data.settings.channels,ch]:data.settings.channels.filter((x:string)=>x!==ch)}))}/>{ch==='sms'?'सामान्य SMS':'WhatsApp text'}</label>)}</div>
 <p className="text-xs text-muted-foreground">नए जमा भुगतान की तारीख, रकम और उस भुगतान के बाद का बकाया भेजेगा। अपडेट से पहले के पुराने भुगतानों को दोबारा नहीं भेजेगा।</p></div>}
 <p className="text-xs text-muted-foreground">WhatsApp: {data?.whatsappReady?'Connected':'कनेक्शन की प्रतीक्षा'} · SMS gateway: {data?.smsReady?'तैयार':'सेटिंग की प्रतीक्षा'}। परिणाम अनिश्चित हो तो अपने आप दोबारा नहीं भेजेगा।</p>
 {error&&<p role="alert" className="text-destructive">{error}</p>}
 {!rows.length&&<p className="text-sm text-muted-foreground">अभी कोई संदेश नहीं है।</p>}
 <div className="max-h-[480px] space-y-3 overflow-auto">{rows.map((c:any)=><div key={c.id} className="space-y-2 rounded border p-3 text-sm"><p className="font-medium">{c.title} · {new Date(c.createdAt).toLocaleString('hi-IN',{timeZone:'Asia/Kolkata'})}</p><p>{Object.entries(c.counts).map(([s,n])=>`${labels[s]||s}: ${n}`).join(' · ')}</p>
 <div className="flex flex-wrap gap-2">{c.state==='active'&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void run(()=>bridge.change(c.id,'pause'))}>रोकें</Button>}{c.state==='paused'&&<Button size="sm" disabled={busy} onClick={()=>void run(()=>bridge.change(c.id,'resume'))}>फिर चालू करें</Button>}{c.state!=='cancelled'&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void run(()=>bridge.change(c.id,'cancel'))}>बाकी संदेश रद्द करें</Button>}</div>
 <details><summary className="cursor-pointer">हर नंबर और संदेश की स्थिति</summary>{c.jobs.map((j:any)=><div key={j.id} className="mt-2 rounded border p-2"><p>{j.mobile||'नंबर उपलब्ध नहीं'} · {j.channel} · {labels[j.state]}</p><p className="whitespace-pre-wrap">{j.message}</p>{j.error&&<p className="text-destructive">{j.error}</p>}{['unconfirmed','failed'].includes(j.state)&&<div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>{if(confirm('चैट/SMS gateway में यह संदेश भेजा हुआ मिला है?'))void run(()=>bridge.review(c.id,j.id,'sent'));}}>भेजा हुआ मिला</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>void run(()=>bridge.review(c.id,j.id,'cancel'))}>रद्द करें</Button></div>}</div>)}</details>
 </div>)}</div>
 </CardContent></Card>;
}
