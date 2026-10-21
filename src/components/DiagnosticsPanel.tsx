import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Loader2 } from "lucide-react";
type Check = {code:string; status:"pass"|"warn"|"error"|"skipped";title:string;evidence:unknown;action:string;verification:string};
type Report = {success:boolean;error?:string;runId:string;generatedAt:string;durationMs:number;mode:string;summary:{passed:number;warnings:number;errors:number;skipped:number};checks:Check[];text:string;reportName:string;jsonName:string;limits:string[]};
const bridge = () => (window as any).electron;
const labels = {pass:"PASS",warn:"WARNING",error:"ERROR",skipped:"NOT CHECKED"};
const colors = {pass:"#166534",warn:"#92400e",error:"#991b1b",skipped:"#475569"};
export function DiagnosticsPanel() {
  const [running,setRunning]=useState(false),[mode,setMode]=useState("quick"),[report,setReport]=useState<Report|null>(null),[error,setError]=useState("");
  const [history,setHistory]=useState<any[]>([]),[filter,setFilter]=useState("issues"),[copied,setCopied]=useState(false);
  const refresh=()=>Promise.resolve(bridge()?.diagnosticHistory?.()).then(r=>setHistory(Array.isArray(r)?r:[])).catch(()=>{});
  useEffect(()=>{void refresh();},[]);
  const run=async()=>{setRunning(true);setError("");setReport(null);setCopied(false);try{const r=await bridge()?.runDiagnostics?.({mode});if(!r?.success)throw Error(r?.error||"DIAG-001: Diagnostic service unavailable");setReport(r);await refresh();}catch(e:any){setError(e?.message||"DIAG-001: Report failed");}finally{setRunning(false);}};
  const open=async(name:string)=>{try{await bridge()?.diagnosticOpenReport?.(name);}catch(e:any){setError(e.message||"DIAG-002: Could not open report");}};
  const copy=async()=>{try{await navigator.clipboard.writeText(report?.text||"");setCopied(true);}catch{setError("Copy failed. Open the TXT report to copy it.");}};
  return <Card className="dash-card"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity size={18}/>Clinic Diagnostics &amp; Support Report</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">असली SQLite, queues, error history, cloud read access और खुले screen की जाँच। मरीज का data, bill या queue बदले बिना report बनेगी। कोई SMS/WhatsApp नहीं भेजा जाएगा।</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">Scan <select aria-label="Diagnostic scan mode" value={mode} disabled={running} onChange={e=>setMode(e.target.value)} className="ml-2 rounded border p-2 bg-background"><option value="quick">Quick check</option><option value="deep">Deep check + backup validation</option></select></label>
        <Button data-diagnostic-action="run-diagnostics" onClick={run} disabled={running}>{running?<><Loader2 className="mr-2 animate-spin" size={16}/>जाँच चल रही है…</>:"Run Diagnostics"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">Deep check में database integrity और backup JSON भी पढ़े जाते हैं; बड़ी database पर थोड़ा समय लग सकता है। किसी screen में समस्या आए तो वही काम दोहराकर report निकालें।</p>
      {error&&<p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>}
      {report&&<>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[["Pass",report.summary.passed],["Warnings",report.summary.warnings],["Errors",report.summary.errors],["Not checked",report.summary.skipped]].map(([label,value])=><div key={String(label)} className="rounded border p-3"><p className="text-xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}</div>
        <p className="text-sm font-medium">{report.summary.errors?"दर्ज errors और failed checks मिले—नीचे code और अगला कदम देखें।":report.summary.warnings?"जाँच पूरी हुई; कुछ warnings पर ध्यान चाहिए।":"जाँचे गए हिस्सों में error नहीं मिला। बाकी device tests नीचे दिए हैं।"}</p>
        <p className="text-xs text-muted-foreground break-all">Run {report.runId} · {new Date(report.generatedAt).toLocaleString("en-IN")} · {report.durationMs} ms</p>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>open(report.reportName)}>Open TXT</Button><Button size="sm" variant="outline" onClick={()=>open(report.jsonName)}>Open JSON</Button><Button size="sm" variant="outline" onClick={copy}>{copied?"Copied":"Copy support report"}</Button>
          <select aria-label="Diagnostic results filter" value={filter} onChange={e=>setFilter(e.target.value)} className="rounded border px-2 bg-background"><option value="issues">Errors &amp; warnings</option><option value="skipped">Not checked</option><option value="all">All checks</option></select></div>
        <div className="max-h-[540px] overflow-y-auto space-y-2" aria-live="polite">{report.checks.filter(c=>filter==="all"||filter==="skipped"&&c.status==="skipped"||filter==="issues"&&["warn","error"].includes(c.status)).map((c,i)=><article key={c.code+String(i)} className="rounded border p-3 space-y-2"><p className="text-sm font-semibold" style={{color:colors[c.status]}}>{labels[c.status]} · {c.code} · {c.title}</p><p className="text-xs text-muted-foreground">Evidence: {c.verification}</p><pre className="text-xs whitespace-pre-wrap break-words rounded bg-muted p-2">{typeof c.evidence==="string"?c.evidence:JSON.stringify(c.evidence,null,2)}</pre>{c.action&&<p className="text-sm">अगला कदम: {c.action}</p>}</article>)}</div>
        <p className="text-xs text-muted-foreground">हर hidden screen, print layout या अभी तक trigger नहीं हुआ bug अपने-आप verify नहीं होता। Recorded errors पुराने भी हो सकते हैं—समय और version देखकर तुलना करें। Report share करने से पहले preview देखें।</p>
      </>}
      {history.length>0&&<details><summary className="cursor-pointer text-sm">Saved reports ({history.length})</summary><div className="space-y-2 mt-2">{history.map(h=><div key={h.name} className="flex flex-wrap gap-2 items-center border-b py-2 text-xs"><span>{new Date(h.generatedAt).toLocaleString("en-IN")} · {h.mode} · Errors {h.summary?.errors} / Warnings {h.summary?.warnings}</span><Button size="sm" variant="outline" onClick={()=>open(h.name.replace(/\.json$/,".txt"))}>TXT</Button><Button size="sm" variant="outline" onClick={()=>open(h.name)}>JSON</Button></div>)}</div></details>}
    </CardContent></Card>;
}
