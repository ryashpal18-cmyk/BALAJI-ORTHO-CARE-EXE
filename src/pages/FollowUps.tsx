import { attendedVisit } from "@/lib/followupState";
import { offlineUpdate } from '@/lib/offlineQuery';
import { VillageMessagePanel } from '@/components/VillageMessagePanel';
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFractureCases } from "@/hooks/useOrtho";
import { useBranchContext } from "@/lib/branchContext";
import { businessDate } from "@/lib/businessDate";
import { saveFollowUpDates } from "@/lib/offlineQuery";
import { useAppointments } from "@/hooks/useDatabase";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

export default function FollowUps() {
  const { data: cases = [], isLoading, error } = useFractureCases();
  const { data: appointments = [] } = useAppointments();
  const { selectedBranchId } = useBranchContext();
  const navigate = useNavigate(), qc = useQueryClient();
  const today = businessDate();
  const [filter, setFilter] = useState("due"), [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>(null), [saving, setSaving] = useState(false);
  const removalFor = (c: any) => appointments.find(a => a.notes === "cast-removal:" + String(c.id).replace(/^local_/, "") && a.status !== "Cancelled")?.date || "";
  const rows = cases.filter(c => c.plaster_status === "Active" && (!selectedBranchId || c.patients?.branch_id === selectedBranchId))
    .filter(c => !search || ((c.patients?.name || "") + " " + (c.patients?.mobile || "")).toLowerCase().includes(search.toLowerCase()))
    .filter(c => filter === "all" || (filter === "due" ? (!attendedVisit(c) && (c.next_followup_date && c.next_followup_date <= today)) || (removalFor(c) && removalFor(c) <= today) : !c.next_followup_date && !removalFor(c)))
    .sort((a, b) => (a.next_followup_date || "9999").localeCompare(b.next_followup_date || "9999"));
  const save = async () => {
    if (!editing || saving) return;
    setSaving(true);
    try {
      await saveFollowUpDates(editing.id, editing.followup, editing.removal);
      await qc.invalidateQueries();
      setEditing(null); toast({ title: "डॉक्टर की निर्धारित तारीखें सेव हैं" });
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); } finally { setSaving(false); }
  };
  return <DashboardLayout><div className="space-y-4">
    <h1 className="text-2xl font-bold">Follow-up / Cast Removal</h1>
    <p className="text-sm text-muted-foreground">तारीख डॉक्टर के निर्णय से दर्ज करें। कास्ट हटाने की तारीख अपने आप तय नहीं होगी।</p>
    <div className="flex flex-wrap gap-2"><Input className="max-w-sm" placeholder="मरीज का नाम या मोबाइल" value={search} onChange={e => setSearch(e.target.value)} />
      <select aria-label="Follow-up filter" className="rounded border bg-background p-2" value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="due">आज और छूटे हुए follow-up / removal</option><option value="all">सभी Active cases</option><option value="missing">तारीख दर्ज नहीं</option>
      </select></div>
    {isLoading && <p>लोड हो रहा है…</p>}{error && <p role="alert">रिकॉर्ड लोड नहीं हुए। दोबारा खोलें।</p>}
    {!isLoading && !error && !rows.length && <p>इस सूची में कोई केस नहीं है।</p>}
    {rows.map(c => <div key={c.id} className="rounded-lg border p-4 space-y-2">
      <p className="font-semibold">{c.patients?.name || "मरीज"} · {c.patients?.mobile || "मोबाइल उपलब्ध नहीं"}</p>
      <p>{c.body_part} · Follow-up: {c.next_followup_date || "दर्ज नहीं"} {c.next_followup_date && c.next_followup_date < today && !attendedVisit(c) ? " · छूटा हुआ" : ""}</p>
      <p>स्थिति: {(c as any).workflow_data?.followup_state || "तय है"}</p><div className="flex gap-2">{["आ गया","नहीं आया"].map(state=><Button key={state} disabled={saving} variant="outline" onClick={async()=>{setSaving(true);try{await offlineUpdate("fracture_cases",c.id,{_workflowPatch:{followup_state:state,followup_for:c.next_followup_date,followup_checked_at:new Date().toISOString()}});await qc.invalidateQueries();}catch(e:any){toast({title:e.message,variant:"destructive"});}finally{setSaving(false);}}}>{state}</Button>)}</div><VillageMessagePanel patientIds={[c.patient_id]} title={"Follow-up: "+(c.patients?.name||"मरीज")}/><p>डॉक्टर द्वारा तय cast removal: {removalFor(c) || "दर्ज नहीं"}</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setEditing({ ...c, followup:c.next_followup_date || "", removal:removalFor(c) })}>तारीख दर्ज / बदलें</Button>
        <Button variant="outline" onClick={() => navigate("/patient-profile/" + c.patient_id)}>मरीज की हिस्ट्री</Button></div>
      {editing?.id === c.id && <div className="grid gap-3 rounded bg-muted p-3 sm:grid-cols-2">
        <div><Label>अगला follow-up</Label><Input type="date" value={editing.followup} onChange={e => setEditing({ ...editing, followup:e.target.value })} /></div>
        <div><Label>डॉक्टर की तय cast removal तारीख</Label><Input type="date" value={editing.removal} onChange={e => setEditing({ ...editing, removal:e.target.value })} /></div>
        <Button disabled={saving} onClick={() => void save()}>सेव करें</Button><Button variant="outline" disabled={saving} onClick={() => setEditing(null)}>रद्द करें</Button>
      </div>}
    </div>)}
  </div></DashboardLayout>;
}
