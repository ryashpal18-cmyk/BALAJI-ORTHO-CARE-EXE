import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBranchContext } from "@/lib/branchContext";
import { DirectoryPatient, filterPatients, uniqueSmsNumbers, villageOptions } from "@/lib/patientDirectory";

export default function PatientSearch() {
  const navigate = useNavigate(), { selectedBranchId } = useBranchContext();
  const [query,setQuery] = useState(""), [village,setVillage] = useState(""), [exact,setExact] = useState<string|null>(null);
  const [page,setPage] = useState(0), [notice,setNotice] = useState("");
  const {data = [],isLoading,isError,error,refetch,isFetching} = useQuery<DirectoryPatient[]>({
    queryKey:["patients","directory"], networkMode:"always", refetchInterval:5000,
    queryFn:async()=>{
      const bridge = (window as any).electron;
      if (!bridge?.patientDirectory) throw Error("Patient Search नया Windows EXE में खोलें।");
      return bridge.patientDirectory();
    },
  });
  const rows = useMemo(()=>data.filter(p=>!selectedBranchId || p.branch_id===selectedBranchId),[data,selectedBranchId]);
  const options = useMemo(()=>villageOptions(rows),[rows]);
  const filtered = useMemo(()=>filterPatients(rows,query,village,exact),[rows,query,village,exact]);
  const numbers = useMemo(()=>uniqueSmsNumbers(filtered),[filtered]);
  const missing = filtered.filter(p=>!uniqueSmsNumbers([p]).length).length;
  const lastPage = Math.max(0,Math.ceil(filtered.length/50)-1), currentPage = Math.min(page,lastPage);
  useEffect(()=>{setPage(0);setNotice("");},[query,village,exact,selectedBranchId]);
  const copy = async()=>{
    setNotice("");
    try { await navigator.clipboard.writeText(numbers.join("\n")); setNotice(`${numbers.length} अलग मोबाइल नंबर Copy हो गए। कोई SMS नहीं भेजा गया।`); }
    catch { setNotice("Copy नहीं हुआ। नीचे के नंबर चुनकर Ctrl+C दबाएँ।"); }
  };
  return <DashboardLayout><div className="space-y-4 p-2">
    <h1 className="module-header">Patient Search / मरीज खोजें</h1>
    <p className="text-sm text-muted-foreground">नाम, मोबाइल या गाँव से मरीज खोजें। यह सूची इस PC के सेव रिकॉर्ड और चुनी हुई branch की है। Shared mobile वाले परिवार के सभी मरीज अलग दिखेंगे।</p>
    <div className="grid gap-4 rounded-xl border bg-card p-4 lg:grid-cols-3">
      <label className="space-y-2 text-sm">नाम / मोबाइल नंबर<Input aria-label="Patient name or mobile" placeholder="नाम या पूरा / कुछ अंकों वाला मोबाइल" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <label className="space-y-2 text-sm">गाँव / पते में खोजें<Input aria-label="Village search" placeholder="जैसे Khinwara / खिंवाड़ा" value={village} onChange={e=>{setVillage(e.target.value);setExact(null);}}/></label>
      <label className="space-y-2 text-sm">सेव गाँव / पता चुनें<select aria-label="Saved village" className="flex h-10 w-full rounded-md border bg-background px-3" value={exact===null?"all":"v:"+exact} onChange={e=>{setExact(e.target.value==="all"?null:e.target.value.slice(2));setVillage("");}}><option value="all">सभी गाँव / पते</option>{options.map(o=><option key={o.key} value={"v:"+o.key}>{o.label} ({o.count})</option>)}</select></label>
    </div>
    <p className="text-xs text-muted-foreground">गाँव OPD के Village / Address से लिया गया है। पूरे पते में गाँव लिखा हो तो “गाँव / पते में खोजें” इस्तेमाल करें। हिंदी और English की अलग spelling अपने आप एक गाँव नहीं मानी जाती।</p>
    <div className="flex flex-wrap items-center gap-3"><strong aria-live="polite">मरीज: {filtered.length} · अलग सही मोबाइल: {numbers.length} · बिना सही मोबाइल: {missing}</strong><Button variant="outline" onClick={()=>{setQuery("");setVillage("");setExact(null);}}>Filter हटाएँ</Button><Button variant="outline" disabled={isFetching} onClick={()=>void refetch()}>Refresh</Button><Button disabled={!numbers.length||isError||isLoading} onClick={()=>void copy()}>SMS के नंबर Copy करें</Button></div>
    {notice&&<p role="status">{notice}</p>}
    {isError&&<p role="alert" className="text-destructive">मरीजों की सूची refresh नहीं हुई: {(error as Error)?.message}। पुराना डेटा दिख सकता है। Refresh करें।</p>}
    {isLoading?<p>मरीज लोड हो रहे हैं…</p>:<>
      <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-left text-sm"><thead><tr className="border-b bg-muted/50"><th className="p-3">क्रम</th><th className="p-3">मरीज का नाम</th><th className="p-3">मोबाइल नंबर</th><th className="p-3">गाँव / पता</th><th className="p-3">उम्र / लिंग</th><th className="p-3">रिकॉर्ड</th></tr></thead><tbody>{filtered.slice(currentPage*50,currentPage*50+50).map((p,i)=><tr key={p.id} className="border-b"><td className="p-3">{currentPage*50+i+1}</td><td className="p-3 font-medium">{p.name||"नाम दर्ज नहीं"}{p._pendingSync&&<span className="block text-xs text-muted-foreground">Sync बाकी</span>}</td><td className="p-3 whitespace-nowrap">{p.mobile||"—"}</td><td className="p-3">{p.address||"दर्ज नहीं"}</td><td className="p-3">{p.age??"—"} / {p.gender||"—"}</td><td className="p-3"><Button size="sm" variant="outline" onClick={()=>navigate("/patient-profile/"+encodeURIComponent(p.id))}>Profile खोलें</Button></td></tr>)}</tbody></table>{!filtered.length&&<p className="p-5">इन filters में कोई मरीज नहीं मिला।</p>}</div>
      <div className="flex items-center gap-3"><Button variant="outline" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>पिछला</Button><span>पेज {currentPage+1} / {lastPage+1} · प्रति पेज 50 मरीज</span><Button variant="outline" disabled={currentPage===lastPage} onClick={()=>setPage(currentPage+1)}>अगला</Button></div>
      <details className="rounded border p-3"><summary className="cursor-pointer">SMS के लिए सभी {numbers.length} अलग नंबर देखें</summary><p className="my-2 text-xs">पूरी filtered सूची के नंबर हैं, केवल इस पेज के नहीं। एक family number एक बार है। यहाँ से कोई SMS अपने आप नहीं जाता।</p><textarea aria-label="Filtered SMS numbers" readOnly value={numbers.join("\n")} className="h-40 w-full rounded border bg-background p-2"/></details>
    </>}
  </div></DashboardLayout>;
}
