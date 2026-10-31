import { useState } from 'react';
import { offlineUpdate } from '@/lib/offlineQuery';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { toast } from '@/hooks/use-toast';
export function DuePromise({bill}:{bill:any}) {
 const [date,setDate]=useState(bill.workflow_data?.promise_date||''),[note,setNote]=useState(bill.workflow_data?.collection_note||''),[busy,setBusy]=useState(false);
 const save=async()=>{setBusy(true);try{await offlineUpdate('billing',bill.id,{_workflowPatch:{promise_date:date,collection_note:note},_auditReason:'Collection promise recorded'});toast({title:'भुगतान का वादा सेव है'});}catch(e:any){toast({title:e.message,variant:'destructive'});}finally{setBusy(false);}};
 return <details className="border-t pt-2"><summary>भुगतान का वादा / संपर्क</summary><p className="text-xs">पिछला reminder: {bill.workflow_data?.last_reminder||'दर्ज नहीं'}</p><Input aria-label="भुगतान की तय तारीख" type="date" value={date} onChange={e=>setDate(e.target.value)}/><Input aria-label="Collection note" placeholder="मरीज ने क्या बताया" value={note} onChange={e=>setNote(e.target.value)}/><Button disabled={busy} variant="outline" onClick={()=>void save()}>सेव करें</Button></details>;
}
