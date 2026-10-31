import { useState } from 'react';
import { offlineUpdate } from '@/lib/offlineQuery';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from './ui/button';
import { toast } from '@/hooks/use-toast';
export function PatientWorkflow({patient}:{patient:any}) {
 const qc=useQueryClient(),[busy,setBusy]=useState(false);
 const data=patient.workflow_data||{};
 const save=async(patch:any)=>{setBusy(true);try{await offlineUpdate('patients',patient.id,{_workflowPatch:patch,updated_at:new Date().toISOString()});await qc.invalidateQueries();toast({title:'मरीज की पसंद सेव है'});}catch(e:any){toast({title:e.message,variant:'destructive'});}finally{setBusy(false);}};
 return <div className="rounded border p-3 space-y-2"><p className="font-semibold">मरीज की संपर्क पसंद</p>{data.merged_into&&<a href={"#/patient-profile/"+data.merged_into}>यह record मिलाया गया है — मुख्य मरीज खोलें</a>}<div className="flex flex-wrap gap-3">{['sms','whatsapp','marketing'].map(k=><label key={k}><input type="checkbox" checked={data[k]!==false} disabled={busy} onChange={e=>void save({[k]:e.target.checked})}/> {k==='marketing'?'सामूहिक / त्योहार संदेश':k.toUpperCase()}</label>)}<Button variant="outline" disabled={busy} onClick={()=>void save({archived:!data.archived})}>{data.archived?'मरीज फिर सक्रिय करें':'मरीज Archive करें'}</Button></div><p className="text-xs">Archive से पुराने bills, due और history सुरक्षित रहते हैं।</p></div>;
}
