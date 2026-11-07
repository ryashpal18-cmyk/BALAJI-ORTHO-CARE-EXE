import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

const labels:Record<string,string>={queued:'प्रतीक्षा',sending:'भेज रहे हैं',sent:'स्वीकार हुआ',failed:'असफल',unconfirmed:'जाँच ज़रूरी',cancelled:'रद्द'};
type JobPage={jobs:any[];offset:number;limit:number;total:number;hasMore:boolean};

export function OutreachStatus({ campaignId, compact=false }: {campaignId?:string;compact?:boolean}){
 const bridge=(window as any).electron?.outreach;
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [openIds,setOpenIds]=useState<Record<string,boolean>>({}),[pages,setPages]=useState<Record<string,JobPage>>({}),[loading,setLoading]=useState<Record<string,boolean>>({});
 const live=useRef(false),openRef=useRef(openIds),pagesRef=useRef(pages),refreshing=useRef<Promise<void>|null>(null),trailingRefresh=useRef<Promise<void>|null>(null),detailRequests=useRef<Record<string,Promise<void>|undefined>>({});
 useEffect(()=>{openRef.current=openIds;},[openIds]);
 useEffect(()=>{pagesRef.current=pages;},[pages]);

 const loadJobs=useCallback((id:string,append=false)=>{
  if(!bridge?.jobs||detailRequests.current[id])return detailRequests.current[id]||Promise.resolve();
  const current=pagesRef.current[id];
  const requests=append
   ? [bridge.jobs(id,current?.jobs.length||0,50)]
   : current?.jobs.length
    ? Array.from({length:Math.ceil(current.jobs.length/100)},(_,index)=>{const offset=index*100;return bridge.jobs(id,offset,Math.min(100,current.jobs.length-offset));})
    : [bridge.jobs(id,0,50)];
  setLoading(x=>({...x,[id]:true}));
  const request=Promise.all(requests).then((parts:JobPage[])=>{
   if(!live.current||!openRef.current[id])return;
   setPages(existing=>{
    if(append&&existing[id]){const before=existing[id],page=parts[0];return {...existing,[id]:{...page,jobs:[...before.jobs,...page.jobs],offset:0}};}
    const jobs=parts.flatMap(page=>page.jobs),last=parts[parts.length-1];
    return {...existing,[id]:{jobs,offset:0,limit:jobs.length,total:last.total,hasMore:jobs.length<last.total}};
   });
  }).catch((e:any)=>{if(live.current)setError(e.message);}).finally(()=>{
   delete detailRequests.current[id];if(live.current)setLoading(x=>({...x,[id]:false}));
  });
  detailRequests.current[id]=request;return request;
 },[bridge]);

 const refresh=useCallback((force=false)=>{
  if(!bridge||!live.current||!force&&document.hidden)return refreshing.current||Promise.resolve();
  if(refreshing.current){
   if(force&&!trailingRefresh.current)trailingRefresh.current=refreshing.current.then(()=>{trailingRefresh.current=null;return refresh(true);});
   return trailingRefresh.current||refreshing.current;
  }
  const request=Promise.resolve(bridge.status()).then(async(d:any)=>{
   if(!live.current)return;
   setData(d);setError('');
   await Promise.all(Object.keys(openRef.current).filter(id=>openRef.current[id]).map(id=>loadJobs(id,false)));
  }).catch((e:any)=>{if(live.current)setError(e.message);}).finally(()=>{if(refreshing.current===request)refreshing.current=null;});
  refreshing.current=request;return request;
 },[bridge,loadJobs]);

 useEffect(()=>{
  live.current=true;void refresh(true);
  const poll=()=>{if(!document.hidden)void refresh();};
  const timer=setInterval(poll,5000),visible=()=>{if(!document.hidden)void refresh();};
  document.addEventListener('visibilitychange',visible);
  return()=>{live.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[refresh]);

 const run=async(fn:()=>Promise<any>,detailId?:string)=>{setBusy(true);setError('');try{await fn();if(detailId){await detailRequests.current[detailId];await loadJobs(detailId,false);}await refresh(true);}catch(e:any){if(live.current)setError(e.message);}finally{if(live.current)setBusy(false);}};
 const toggle=(id:string,opened:boolean)=>{setOpenIds(value=>({...value,[id]:opened}));if(opened){openRef.current={...openRef.current,[id]:true};void loadJobs(id,false);}else openRef.current={...openRef.current,[id]:false};};
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
 <div className="max-h-[480px] space-y-3 overflow-auto">{rows.map((c:any)=>{const page=pages[c.id];return <div key={c.id} className="space-y-2 rounded border p-3 text-sm"><p className="font-medium">{c.title} · {new Date(c.createdAt).toLocaleString('hi-IN',{timeZone:'Asia/Kolkata'})}</p><p>{Object.entries(c.counts).map(([s,n])=>`${labels[s]||s}: ${n}`).join(' · ')}</p>
 <div className="flex flex-wrap gap-2">{c.state==='active'&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void run(()=>bridge.change(c.id,'pause'))}>रोकें</Button>}{c.state==='paused'&&<Button size="sm" disabled={busy} onClick={()=>void run(()=>bridge.change(c.id,'resume'))}>फिर चालू करें</Button>}{c.state!=='cancelled'&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void run(()=>bridge.change(c.id,'cancel'))}>बाकी संदेश रद्द करें</Button>}</div>
 <details onToggle={e=>toggle(c.id,e.currentTarget.open)}><summary className="cursor-pointer">हर नंबर और संदेश की स्थिति</summary>
 {openIds[c.id]&&<>
 {loading[c.id]&&!page&&<p className="mt-2 text-muted-foreground">स्थिति पढ़ रहे हैं…</p>}
 {page?.jobs.map((j:any)=><div key={j.id} className="mt-2 rounded border p-2"><p>{j.mobile||'नंबर उपलब्ध नहीं'} · {j.channel} · {labels[j.state]}</p><p className="whitespace-pre-wrap">{j.message}</p>{j.error&&<p className="text-destructive">{j.error}</p>}{['unconfirmed','failed'].includes(j.state)&&<div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>{if(confirm('चैट/SMS gateway में यह संदेश भेजा हुआ मिला है?'))void run(()=>bridge.review(c.id,j.id,'sent'),c.id);}}>भेजा हुआ मिला</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>void run(()=>bridge.review(c.id,j.id,'cancel'),c.id)}>रद्द करें</Button></div>}</div>)}
 {page?.hasMore&&<Button className="mt-2" size="sm" variant="outline" disabled={loading[c.id]} onClick={()=>void loadJobs(c.id,true)}>{loading[c.id]?'पढ़ रहे हैं…':'और दिखाएँ'}</Button>}
 </>}
 </details></div>;})}</div>
 </CardContent></Card>;
}
