import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export function WhatsAppConnection() {
  const bridge=(window as any).electron?.whatsapp;
  const [status,setStatus]=useState<any>(null),[qr,setQr]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const refresh=async()=>{if(!bridge)return;try{setStatus(await bridge.status());}catch(e:any){setError(e.message);}};
  useEffect(()=>{void refresh();const timer=setInterval(refresh,2500);return()=>clearInterval(timer);},[]);
  useEffect(()=>{let live=true;setQr('');if(status?.qr)void QRCode.toDataURL(status.qr,{width:280,margin:4}).then(data=>{if(live)setQr(data);});return()=>{live=false;};},[status?.qr]);
  const action=async(fn:()=>Promise<any>)=>{setBusy(true);setError('');try{await fn();await refresh();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  if(!bridge)return <p>WhatsApp QR connection Windows EXE में उपलब्ध है।</p>;
  return <Card><CardHeader><CardTitle>WhatsApp जोड़ें — QR scan</CardTitle></CardHeader><CardContent className="space-y-3">
    <p>WhatsApp → Linked devices → Link a device से यह QR scan करें। API key की जरूरत नहीं है। PC में Edge या Chrome होना चाहिए।</p>
    <p className="text-sm">स्थिति: {status?.state||'पढ़ रहे हैं…'} {status?.ready?'✓':''}</p>
    {qr&&<img src={qr} width="280" height="280" alt="WhatsApp linked device QR"/>}
    <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void action(()=>bridge.connect())}>WhatsApp जोड़ें</Button><Button variant="outline" disabled={busy} onClick={()=>void action(()=>bridge.disconnect())}>Disconnect</Button></div>
    <label className="flex items-center gap-2"><input type="checkbox" checked={status?.auto!==false} onChange={e=>void action(()=>bridge.setAuto(e.target.checked))}/>नए बिल का QR वाला PDF अपने आप queue करें</label>
    <p className="text-xs text-muted-foreground">PC software और इंटरनेट चालू रहने पर जुड़े WhatsApp से queue भेजेगी। यह WhatsApp Web connector है; Web में बदलाव आने पर दोबारा connection/update जरूरी हो सकता है। Sent का अर्थ WhatsApp ने message स्वीकार किया; मरीज ने पढ़ा, इसकी पुष्टि नहीं है।</p>
    {(error||status?.error)&&<p role="alert" className="text-destructive">{error||status.error}</p>}
    <div className="max-h-80 space-y-2 overflow-auto">{status?.jobs?.slice(0,50).map((j:any)=><div key={j.id} className="rounded border p-2 text-sm"><p>{j.kind==='statement'?'Patient Statement':'Bill PDF'} · {j.patientName} · {j.mobile} · {j.state}</p>{j.error&&<p className="text-destructive">{j.error}</p>}
      {['unconfirmed','failed','queued'].includes(j.state)&&<div className="mt-1 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>{if(confirm('WhatsApp chat में जाँच लिया और PDF नहीं गया? फिर भेजने से duplicate हो सकता है।'))void action(()=>bridge.review(j.id,'retry'));}}>जाँच की, दोबारा भेजें</Button><Button size="sm" variant="outline" onClick={()=>void action(()=>bridge.review(j.id,'cancel'))}>रद्द करें</Button>{j.state==='unconfirmed'&&<Button size="sm" variant="outline" onClick={()=>{if(confirm('WhatsApp chat में PDF भेजा हुआ दिख रहा है?'))void action(()=>bridge.review(j.id,'sent'));}}>भेजा हुआ मिला</Button>}</div>}</div>)}</div>
  </CardContent></Card>;
}
