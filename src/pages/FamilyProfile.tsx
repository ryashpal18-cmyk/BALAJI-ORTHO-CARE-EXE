import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { refreshClinicalUrl } from '@/lib/clinicalFiles';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export default function FamilyProfile() {
  const {id}=useParams(),navigate=useNavigate();
  const [groups,setGroups]=useState<any[]>([]),[records,setRecords]=useState<any[]>([]),[search,setSearch]=useState(''),[error,setError]=useState(''),[qr,setQr]=useState(''),[image,setImage]=useState('');
  useEffect(()=>{let active=true;const load=async()=>{try{const bridge=(window as any).electron?.family;if(!bridge)throw Error('Family profile Windows EXE में खोलें।');const data= id?await bridge.profile(id):await bridge.list();if(active){if(id)setRecords(data);else setGroups(data);setError('');}}catch(e:any){if(active)setError(e.message);}};void load();const timer=setInterval(load,5000);return()=>{active=false;clearInterval(timer);};},[id]);
  useEffect(()=>{let active=true;setQr('');if(id&&/^[a-zA-Z0-9_-]{1,100}$/.test(id))void QRCode.toDataURL('balajiclinic://family/'+id.replace(/^local_/,''),{width:180,margin:4}).then(url=>{if(active)setQr(url);});return()=>{active=false;};},[id]);
  const execute=async(fn:()=>Promise<any>)=>{try{await fn();}catch(e:any){setError(e.message);}};
  return <DashboardLayout><div className="mx-auto max-w-6xl space-y-4 p-4"><h1 className="text-2xl font-bold">{id?'Family Profile':'Family Profiles'}</h1>
    <p className="text-sm text-muted-foreground">एक ही सही mobile number वाले सदस्य साथ दिखते हैं। हर सदस्य की Patient ID, X-ray और बिल अलग रहते हैं।</p>
    {error&&<p role="alert" className="text-destructive">{error}</p>}
    {!id?<><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Mobile number या सदस्य का नाम खोजें"/>{groups.filter(g=>[g.mobile,...g.members.map((p:any)=>p.name)].join(' ').toLowerCase().includes(search.toLowerCase())).map(g=><div key={g.id} className="flex items-center justify-between gap-3 rounded border p-3"><div><strong>{g.mobile||'Mobile उपलब्ध नहीं'}</strong><p>{g.members.map((p:any)=>p.name).join(' · ')}</p><p className="text-xs">{g.members.length} सदस्य</p></div><Button onClick={()=>navigate('/family-profile/'+g.id)}>Profile खोलें</Button></div>)}</>:<>
    <div className="flex items-center justify-between"><Button variant="outline" onClick={()=>navigate('/families')}>सभी परिवार</Button><Button onClick={()=>navigate('/opd',{state:{familyMobile:records[0]?.patient.mobile||''}})}>नया family member जोड़ें</Button></div>
    {qr&&<div className="flex items-center gap-3 rounded border p-3"><img src={qr} width="150" height="150" alt="Family profile QR"/><p className="text-sm">Clinic PC software में login के बाद profile खोलने वाला QR।<br/>मरीज के फोन पर medical records का सार्वजनिक portal नहीं है।</p></div>}
    {!records.length&&<p>इस patient reference का रिकॉर्ड उपलब्ध नहीं है।</p>}
    {records.map(({patient,bills,xrays})=><section key={patient.id} className="space-y-3 rounded-xl border p-4"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">{patient.name}</h2><p className="text-sm">{patient.mobile} · Patient ID: {patient.id.replace(/^local_/,'')}</p></div><Button variant="outline" onClick={()=>navigate('/patient-profile/'+patient.id)}>सदस्य का पूरा रिकॉर्ड</Button></div>
      <h3 className="font-medium">Bills ({bills.length})</h3><div className="space-y-2">{bills.map((bill:any)=><div key={bill.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/40 p-2"><span>{new Date(bill.created_at).toLocaleDateString('en-IN')} · {bill.service} · बकाया ₹{Math.max(0,Number(bill.amount||0)-Number(bill.discount||0)-Number(bill.amount_paid||0)).toLocaleString('en-IN')}</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>void execute(()=>(window as any).electron.whatsapp.pdf(bill.id,true))}>QR वाला PDF</Button><Button size="sm" onClick={()=>void execute(async()=>{await (window as any).electron.whatsapp.enqueue(bill.id);navigate('/whatsapp');})}>WhatsApp PDF</Button></div></div>)}</div>
      <h3 className="font-medium">X-rays ({xrays.length})</h3>{xrays.map((r:any,i:number)=><div key={r.id||i} className="flex items-center justify-between rounded border p-2"><span>{r.report_type||r.body_part||r.file_name||'X-ray'} · {new Date(r.image_date||r.created_at).toLocaleDateString('en-IN')}</span><Button size="sm" variant="outline" onClick={()=>void execute(async()=>{const value=r._localFileUrl||r.file_url;if(!value)throw Error('फ़ाइल लिंक उपलब्ध नहीं है; सदस्य का पूरा रिकॉर्ड खोलें।');setImage(await refreshClinicalUrl(value));})}>खोलें</Button></div>)}
    </section>)}
    </>}
    <Dialog open={!!image} onOpenChange={open=>{if(!open)setImage('');}}><DialogContent className="max-h-[90vh] max-w-4xl overflow-auto"><DialogTitle>X-ray / Report</DialogTitle>{image.includes('application/pdf')||/\.pdf(?:\?|$)/i.test(image)?<iframe title="Report PDF" src={image} sandbox="" className="h-[70vh] w-full"/>:<img src={image} alt="Patient X-ray" className="max-h-[75vh] object-contain"/>}</DialogContent></Dialog>
  </div></DashboardLayout>;
}
