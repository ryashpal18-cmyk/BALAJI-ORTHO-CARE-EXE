import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bone, Save, Send, MessageCircle, CalendarDays, Plane, Search, Pencil, CheckCircle2, PowerOff, BellRing, Shield, Plus, AlertTriangle, Check, Loader2, Clock, FileText, BarChart3, Activity, TrendingUp, Printer, Calendar, Phone, ChevronRight, Stethoscope, User } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAddFractureCase, useFractureCases, useFollowupsAround, useUpdateFractureCase, uploadFractureXray, useFractureXrays } from "@/hooks/useOrtho";
import { useAddPatient, useSearchPatients } from "@/hooks/useDatabase";
import { sendSMS } from "@/services/smsService";
import { BodyDiagram, type BodySelection } from "@/components/ortho/BodyDiagram";
import { supabase } from "@/integrations/supabase/client";
import { Upload, ZoomIn, X as XIcon } from "lucide-react";

// ─── Constants ────────────────────────────────
const FRACTURE_TYPES = ["Simple","Compound","Hairline","Dislocation","Comminuted","Greenstick","Stress","Spiral"];
const PLASTER_TYPES  = ["POP Cast","Fiber Cast","Slab","Back Slab","None"];
const BODY_PARTS     = ["Hand","Wrist","Forearm","Elbow","Humerus","Shoulder","Clavicle","Finger","Thumb","Femur","Tibia","Fibula","Ankle","Foot","Toe","Knee","Hip","Spine","Rib","Other"];
const CAUSES         = ["Fall","Road Accident","Sports Injury","Direct Blow","Twist","Pathological","Other"];
const SIDES          = ["Right","Left","Both"];
const LEAVE_KEY      = "ortho_leave_dates";

const DIET_BY_PART: Record<string, string> = {
  default: "🥛 दूध, दही, पनीर खाएं\n🥦 हरी सब्जियां खाएं\n☀️ रोज धूप लें (Vitamin D)\n🐟 मछली या अंडे खाएं\n🚫 धूम्रपान से बचें\n💧 पर्याप्त पानी पिएं",
  "Femur": "🥩 Protein ज्यादा लें\n🥛 दूध-दही जरूरी\n🚶 बिस्तर पर exercises करें\n🚫 वजन जल्दी न डालें",
  "Spine": "🥛 Calcium supplements\n🧘 Physiotherapy करें\n🛏️ सही posture रखें\n🚫 झुकने से बचें",
};
const EXERCISE_BY_PART: Record<string, string> = {
  default: "✅ उँगलियाँ हिलाते रहें (यदि नीचे हों)\n✅ हल्की breathing exercises\n✅ Physiotherapy doctor से मिलें\n🚫 fracture वाली जगह पर दबाव न डालें",
  "Wrist": "✅ उँगलियाँ ऊपर-नीचे करें\n✅ Elbow मोड़ते रहें\n🚫 हाथ पर वजन न डालें",
  "Ankle": "✅ पैर के पंजे ऊपर-नीचे करें\n✅ घुटना मोड़ते रहें\n🚫 पैर जमीन पर न रखें",
};

// ─── Helpers ──────────────────────────────────
const todayIso  = () => new Date().toISOString().slice(0,10);
const addDays   = (base: string, n: number) => { const d = new Date(base); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const diffDays  = (a: string, b: string)    => Math.round((new Date(b).getTime()-new Date(a).getTime())/86400000);
const fmtDate   = (iso?: string|null)       => { if(!iso) return "—"; try { return new Date(iso).toLocaleDateString("hi-IN",{day:"2-digit",month:"short",year:"numeric"}); } catch { return iso; }};
const fmtShort  = (iso?: string|null)       => { if(!iso) return "—"; try { return new Date(iso).toLocaleDateString("hi-IN",{day:"2-digit",month:"short",weekday:"short"}); } catch { return iso; }};
const healPct   = (pDate?: string|null, fDays?: number) => { if(!pDate||!fDays) return 0; return Math.min(100,Math.max(0,Math.round((diffDays(pDate,todayIso())/fDays)*100))); };
const getLeaves = (): string[] => { try { return JSON.parse(localStorage.getItem(LEAVE_KEY)||"[]"); } catch { return []; }};
const setLeaveStore = (l: string[]) => localStorage.setItem(LEAVE_KEY, JSON.stringify(l));

// ─── SMS Templates ───────────────────────────
const tplReminder    = (name: string, date: string) => `नमस्ते ${name} जी 🙏\n\nआपका Follow-up ${fmtDate(date)} को है।\nकृपया समय पर पहुँचें।\n\nBalaji Ortho Care Center 🏥`;
const tplToday       = (name: string)               => `नमस्ते ${name} जी 🙏\n\nआज आपका Follow-up है।\nकृपया सुबह 11:30 बजे तक पहुँचें।\n\nBalaji Ortho Care Center 🏥`;
const tplPrecaution  = (name: string, bp: string, next: string) => `नमस्ते ${name} जी 🙏\n\nPlaster (${bp}) की सावधानियां:\n✅ गीला न होने दें\n✅ भारी वजन न उठाएं\n✅ सूजन पर तुरंत आएं\n✅ Follow-up जरूर करवाएं\n\nNext Visit: ${next?fmtDate(next):"—"}\n\nDr. Rathore\nBalaji Ortho Care Center 🏥`;
const tplRemoved     = (name: string, bp: string)   => `नमस्ते ${name} जी 🙏\n\nबधाई हो! 🎉\nआपका प्लास्टर (${bp}) हटा दिया गया है।\n\n✅ धीरे-धीरे चलें\n✅ भारी काम से बचें\n\nस्वस्थ रहें 💪\nDr. Rathore\nBalaji Ortho Care Center 🏥`;
const tplLeave       = (name: string, date: string) => `नमस्ते ${name} जी 🙏\n\nDr. Rathore आज ${fmtDate(date)} को उपलब्ध नहीं हैं।\nनई Appointment के लिए संपर्क करें।\n\nअसुविधा के लिए खेद है 🙏\nBalaji Ortho Care Center 🏥`;
const tplLongLeave   = (name: string, from: string, to: string) => `नमस्ते ${name} जी 🙏\n\nDr. Rathore ${fmtDate(from)} से ${fmtDate(to)} तक उपलब्ध नहीं रहेंगे।\n\nआपकी सेवा में सदैव तत्पर हैं 🙏\nBalaji Ortho Care Center 🏥`;
const tplDiet        = (name: string, bp: string)   => `नमस्ते ${name} जी 🙏\n\n${bp} Fracture Diet Tips:\n${DIET_BY_PART[bp]||DIET_BY_PART.default}\n\nजल्दी ठीक हों! 💪\nDr. Rathore\nBalaji Ortho Care Center 🏥`;
const tplExercise    = (name: string, bp: string)   => `नमस्ते ${name} जी 🙏\n\n${bp} Recovery Exercises:\n${EXERCISE_BY_PART[bp]||EXERCISE_BY_PART.default}\n\nDr. Rathore\nBalaji Ortho Care Center 🏥`;
const tplCare        = (name: string, bp: string, next: string) => `नमस्ते ${name} जी 🙏\n\n${bp} Plaster Care:\n✅ गीला न होने दें\n✅ खुजली में अंदर कुछ न डालें\n✅ उँगलियाँ नीली पड़ें तो आएं\n✅ सूजन बढ़े तो आएं\n\nNext Visit: ${next?fmtDate(next):"—"}\n\nDr. Rathore\nBalaji Ortho Care Center 🏥`;

// ─── Print Functions ──────────────────────────
function printRemovalSlip(c: any) {
  const win = window.open("","_blank"); if(!win) return;
  const name = c.patients?.name||"—"; const mob = c.patients?.mobile||"";
  const bp = `${c.side||""} ${c.body_part||""}`.trim();
  const totalDays = c.plaster_date && c.next_followup_date ? diffDays(c.plaster_date, todayIso()) : "—";
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Plaster Removal Slip</title>
  <style>
    @page{size:A5;margin:12mm} body{font-family:Arial,sans-serif;color:#1e293b}
    .logo{font-size:20px;font-weight:800;color:#1e3a5f} .sub{font-size:11px;color:#64748b}
    .title{background:#1e3a5f;color:#fff;padding:8px 14px;border-radius:8px;font-size:16px;font-weight:700;margin:14px 0}
    .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #e2e8f0;font-size:13px}
    .label{color:#64748b} .val{font-weight:600}
    .badge{display:inline-block;background:#dcfce7;color:#16a34a;border-radius:99px;padding:4px 14px;font-size:14px;font-weight:800;margin:14px 0}
    .sign{margin-top:20px;border-top:1px solid #cbd5e1;padding-top:10px;font-size:11px;color:#64748b}
    .footer{font-size:10px;color:#94a3b8;text-align:center;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:8px}
    @media print{button{display:none}}
  </style></head><body>
  <div class="logo">Balaji Ortho Care Center</div>
  <div class="sub">Dr. S. S. Rathore (DMRT | BPT) · Khinwara, Raj. · 📞 8005707783</div>
  <div class="title">🎉 Plaster Removal Certificate</div>
  <div class="row"><span class="label">Patient नाम</span><span class="val">${name}</span></div>
  <div class="row"><span class="label">Mobile</span><span class="val">${mob||"—"}</span></div>
  <div class="row"><span class="label">Fracture Part</span><span class="val">${bp}</span></div>
  <div class="row"><span class="label">Fracture Type</span><span class="val">${c.fracture_type||"—"}</span></div>
  <div class="row"><span class="label">Plaster Type</span><span class="val">${c.plaster_type||"—"}</span></div>
  <div class="row"><span class="label">Plaster लगाई</span><span class="val">${fmtDate(c.plaster_date)}</span></div>
  <div class="row"><span class="label">हटाई गई</span><span class="val">${fmtDate(todayIso())}</span></div>
  <div class="row"><span class="label">Total Treatment</span><span class="val">${totalDays} दिन</span></div>
  <div class="badge">✅ Plaster Successfully Removed</div>
  <div><b style="font-size:12px">सावधानियां:</b><ul style="font-size:12px;color:#374151;padding-left:16px;margin:6px 0">
    <li>धीरे-धीरे चलें, जल्दी न करें</li><li>भारी वजन न उठाएं अगले 2 हफ्ते</li>
    <li>Physiotherapy करें</li><li>जरूरत पड़े तो तुरंत आएं</li>
  </ul></div>
  <div class="sign">Dr. S. S. Rathore<br/>DMRT | BPT<br/>Balaji Ortho Care Center, Khinwara</div>
  <div class="footer">दिनांक: ${fmtDate(todayIso())} · यह certificate hospital record के लिए है।</div>
  <button onclick="window.print()" style="margin-top:12px;padding:8px 18px;background:#1e3a5f;color:#fff;border:none;border-radius:8px;cursor:pointer">🖨 Print</button>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`);
  win.document.close();
}

function printCareInstructions(c: any) {
  const win = window.open("","_blank"); if(!win) return;
  const name = c.patients?.name||"—";
  const bp   = `${c.side||""} ${c.body_part||""}`.trim();
  const diet = DIET_BY_PART[c.body_part||""]||DIET_BY_PART.default;
  const exer = EXERCISE_BY_PART[c.body_part||""]||EXERCISE_BY_PART.default;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Care Instructions</title>
  <style>
    @page{size:A5;margin:12mm} body{font-family:Arial,sans-serif;color:#1e293b;font-size:13px}
    .logo{font-size:18px;font-weight:800;color:#1e3a5f} .sub{font-size:10px;color:#64748b;margin-bottom:10px}
    .section{background:#f8fafc;border-left:4px solid #6366f1;padding:8px 12px;border-radius:0 8px 8px 0;margin-bottom:10px}
    .sh{font-size:13px;font-weight:700;color:#6366f1;margin-bottom:4px}
    pre{white-space:pre-wrap;font-family:Arial,sans-serif;font-size:12px;margin:0;color:#374151}
    .badge{background:#6366f1;color:#fff;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:700;display:inline-block;margin-bottom:10px}
    .footer{font-size:10px;color:#94a3b8;text-align:center;margin-top:14px;border-top:1px solid #e2e8f0;padding-top:8px}
    @media print{button{display:none}}
  </style></head><body>
  <div class="logo">Balaji Ortho Care Center</div>
  <div class="sub">Dr. S. S. Rathore (DMRT | BPT) · 📞 8005707783</div>
  <div class="badge">🦴 ${name} — ${bp} Care Guide</div>
  <div class="section"><div class="sh">⚠️ Plaster Precautions</div>
    <pre>✅ प्लास्टर गीला न होने दें\n✅ खुजली में अंदर कुछ न डालें\n✅ उँगलियाँ नीली हों तो तुरंत आएं\n✅ सूजन बढ़े तो तुरंत आएं\n✅ Follow-up miss न करें\nNext Visit: ${fmtDate(c.next_followup_date)}</pre>
  </div>
  <div class="section"><div class="sh">🥛 Diet Tips</div><pre>${diet}</pre></div>
  <div class="section"><div class="sh">🏃 Exercises</div><pre>${exer}</pre></div>
  <div class="footer">Dr. S. S. Rathore · Balaji Ortho Care Center, Khinwara · दिनांक: ${fmtDate(todayIso())}</div>
  <button onclick="window.print()" style="margin-top:12px;padding:8px 18px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer">🖨 Print</button>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`);
  win.document.close();
}

function printMonthlyReport(cases: any[], followups: any[]) {
  const win = window.open("","_blank"); if(!win) return;
  const today = todayIso();
  const monthStart = today.slice(0,7)+"-01";
  const thisMo = cases.filter(c => (c.plaster_date||"").startsWith(today.slice(0,7)));
  const active = cases.filter(c => c.plaster_status==="Active");
  const completed = cases.filter(c => c.plaster_status!=="Active");
  const missed = followups.filter(f => f.next_followup_date && f.next_followup_date < today && f.plaster_status==="Active");
  const bodyCount: Record<string,number> = {};
  cases.forEach(c => { if(c.body_part) bodyCount[c.body_part]=(bodyCount[c.body_part]||0)+1; });
  const topParts = Object.entries(bodyCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const rows = thisMo.map(c => `<tr><td>${c.patients?.name||"—"}</td><td>${(c.side||"")+" "+(c.body_part||"")}</td><td>${c.fracture_type||"—"}</td><td>${fmtDate(c.plaster_date)}</td><td>${c.plaster_status==="Active"?"Active ✅":"Removed"}</td></tr>`).join("");
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Monthly Ortho Report</title>
  <style>
    @page{size:A4;margin:14mm} body{font-family:Arial,sans-serif;color:#1e293b}
    .logo{font-size:22px;font-weight:800;color:#1e3a5f} .sub{font-size:11px;color:#64748b;margin-bottom:12px}
    h2{color:#6366f1;border-bottom:2px solid #6366f1;padding-bottom:4px;margin:16px 0 8px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
    .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center}
    .box .v{font-size:24px;font-weight:800;color:#6366f1} .box .l{font-size:11px;color:#64748b}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px}
    th{background:#6366f1;color:#fff;padding:7px;text-align:left}
    td{padding:6px;border-bottom:1px solid #e2e8f0}
    .bar-row{display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:12px}
    .bar{height:14px;background:#6366f1;border-radius:99px}
    @media print{button{display:none}}
  </style></head><body>
  <div class="logo">Balaji Ortho Care Center</div>
  <div class="sub">Dr. S. S. Rathore (DMRT | BPT) · Khinwara, Raj. · Monthly Ortho Report — ${new Date().toLocaleDateString("hi-IN",{month:"long",year:"numeric"})}</div>
  <div class="stats">
    <div class="box"><div class="v">${cases.length}</div><div class="l">Total Cases</div></div>
    <div class="box"><div class="v" style="color:#f59e0b">${active.length}</div><div class="l">Active</div></div>
    <div class="box"><div class="v" style="color:#10b981">${completed.length}</div><div class="l">Completed</div></div>
    <div class="box"><div class="v" style="color:#ef4444">${missed.length}</div><div class="l">Missed FU</div></div>
  </div>
  <h2>इस महीने के नए Cases (${thisMo.length})</h2>
  <table><thead><tr><th>Patient</th><th>Fracture</th><th>Type</th><th>Date</th><th>Status</th></tr></thead>
  <tbody>${rows||"<tr><td colspan='5' style='text-align:center;color:#94a3b8'>कोई नया case नहीं</td></tr>"}</tbody></table>
  <h2>Common Fractures</h2>
  ${topParts.map(([p,n])=>`<div class="bar-row"><span style="width:80px">${p}</span><div class="bar" style="width:${Math.round((n/cases.length)*200)}px"></div><span>${n}</span></div>`).join("")}
  <button onclick="window.print()" style="margin-top:16px;padding:8px 18px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer">🖨 Print</button>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`);
  win.document.close();
}

// ─── Heal Progress Bar ────────────────────────
function HealBar({ pct }: { pct: number }) {
  const color = pct>=80?"#10b981":pct>=50?"#3b82f6":pct>=25?"#f59e0b":"#ef4444";
  const label = pct>=80?"Almost healed! 🎉":pct>=50?"Good progress 💪":pct>=25?"Healing... ⏳":"Early stage 🌱";
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}>
        <span style={{color:"#6b7280"}}>{label}</span>
        <span style={{color,fontWeight:700}}>{pct}%</span>
      </div>
      <div style={{height:7,borderRadius:99,background:"#e5e7eb",overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${color}80,${color})`,borderRadius:99,transition:"width 0.6s"}}/>
      </div>
    </div>
  );
}

// ─── Recovery Timeline ────────────────────────
function RecoveryTimeline({ c }: { c: any }) {
  if (!c.plaster_date) return null;
  const today = todayIso();
  const totalDays = c.followup_days || 21;
  const elapsed = diffDays(c.plaster_date, today);
  const expectedEnd = addDays(c.plaster_date, totalDays);
  const pct = healPct(c.plaster_date, totalDays);
  const milestones = [
    { day: 0, label: "Plaster लगी", done: true, icon: "🦴" },
    { day: Math.round(totalDays * 0.25), label: "25% Healed", done: elapsed >= totalDays * 0.25, icon: "💊" },
    { day: Math.round(totalDays * 0.5), label: "Follow-up", done: elapsed >= totalDays * 0.5, icon: "🏥" },
    { day: Math.round(totalDays * 0.75), label: "75% Healed", done: elapsed >= totalDays * 0.75, icon: "💪" },
    { day: totalDays, label: "Removal", done: elapsed >= totalDays, icon: "✅" },
  ];
  return (
    <div style={{padding:"14px 16px",background:"linear-gradient(135deg,#f8fafc,#f0f9ff)",borderRadius:14,border:"1.5px solid #e0f2fe",marginBottom:12}}>
      <p style={{fontSize:11,fontWeight:700,color:"#0369a1",marginBottom:10}}>📅 Recovery Timeline — Day {Math.max(0,elapsed)} / {totalDays}</p>
      <div style={{position:"relative",marginBottom:10}}>
        <div style={{height:4,background:"#e2e8f0",borderRadius:99}}/>
        <div style={{position:"absolute",top:0,left:0,height:4,width:`${pct}%`,background:"linear-gradient(90deg,#6366f1,#10b981)",borderRadius:99,transition:"width 0.6s"}}/>
        {milestones.map((m,i) => (
          <div key={i} style={{position:"absolute",top:-8,left:`${(m.day/totalDays)*100}%`,transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <div style={{width:20,height:20,borderRadius:"50%",background:m.done?"#6366f1":"#e2e8f0",border:"2px solid #fff",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.1)"}}>{m.done?"✓":""}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
        {milestones.map((m,i) => (
          <div key={i} style={{textAlign:"center",fontSize:9,color:m.done?"#6366f1":"#9ca3af",fontWeight:m.done?700:400,flex:1}}>
            <div>{m.icon}</div><div style={{marginTop:1}}>{m.label}</div>
          </div>
        ))}
      </div>
      <div style={{marginTop:8,fontSize:11,color:"#0369a1",textAlign:"center"}}>
        Expected Removal: <strong>{fmtDate(expectedEnd)}</strong>
        {elapsed > totalDays && <span style={{color:"#ef4444",marginLeft:6}}>({elapsed-totalDays} din overdue)</span>}
      </div>
    </div>
  );
}

// ─── Visit Notes (stored in localStorage) ────
const VISIT_KEY = (caseId: string) => `ortho_visits_${caseId}`;
type Visit = { date: string; notes: string; nextDate: string };
const getVisits = (caseId: string): Visit[] => { try { return JSON.parse(localStorage.getItem(VISIT_KEY(caseId))||"[]"); } catch { return []; }};
const addVisit = (caseId: string, v: Visit) => { const prev = getVisits(caseId); localStorage.setItem(VISIT_KEY(caseId), JSON.stringify([v,...prev])); };

// ─── Edit Dialog ──────────────────────────────
function EditDialog({ open, onClose, caseData }: { open: boolean; onClose: () => void; caseData: any }) {
  const updateCase = useUpdateFractureCase();
  const [form, setForm] = useState<any>({});
  useEffect(() => { if(open && caseData) setForm({...caseData}); }, [open, caseData]);
  const set = (k: string, v: any) => setForm((p: any) => ({...p,[k]:v}));
  const [bodySelection, setBodySelection] = useState<BodySelection|null>(null);
  useEffect(() => { if(caseData) setBodySelection({body_part: caseData.body_part||"", side: caseData.side||"Right"}); }, [caseData]);
  const save = async () => {
    const updates = { ...form, body_part: bodySelection?.body_part||form.body_part, side: bodySelection?.side||form.side };
    try {
      await updateCase.mutateAsync({ id: updates.id, body_part: updates.body_part, side: updates.side, fracture_type: updates.fracture_type, cause: updates.cause, plaster_type: updates.plaster_type, plaster_date: updates.plaster_date, followup_days: Number(updates.followup_days)||7, next_followup_date: updates.next_followup_date, doctor_notes: updates.doctor_notes });
      toast.success("✅ Details update ho gayi!"); onClose();
    } catch(e: any) { toast.error(e?.message||"Update fail"); }
  };
  if(!caseData) return null;
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle style={{display:"flex",alignItems:"center",gap:8}}><Pencil style={{width:16,height:16,color:"#6366f1"}}/> Edit — {caseData?.patients?.name}</DialogTitle></DialogHeader>
        <ScrollArea className="max-h-[calc(100vh-16rem)] pr-2">
          <div style={{display:"grid",gridTemplateColumns:"1fr 200px",gap:16,padding:"4px 2px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {([["Fracture Type","fracture_type",FRACTURE_TYPES],["Cause","cause",CAUSES],["Plaster Type","plaster_type",PLASTER_TYPES]] as any[]).map(([l,k,opts]) => (
                <div key={k}><Label className="text-xs">{l}</Label>
                  <Select value={form[k]||""} onValueChange={v=>set(k,v)}>
                    <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue/></SelectTrigger>
                    <SelectContent>{opts.map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
              <div><Label className="text-xs">Plaster Date</Label><Input type="date" className="h-9 mt-1 text-sm" value={form.plaster_date||""} onChange={e=>set("plaster_date",e.target.value)}/></div>
              <div><Label className="text-xs">Followup Days</Label><Input type="number" className="h-9 mt-1 text-sm" value={form.followup_days||""} onChange={e=>set("followup_days",e.target.value)} min={1}/></div>
              <div><Label className="text-xs">Next Followup Date</Label><Input type="date" className="h-9 mt-1 text-sm" value={form.next_followup_date||""} onChange={e=>set("next_followup_date",e.target.value)}/></div>
              <div className="col-span-2"><Label className="text-xs">Doctor Notes</Label><Textarea className="text-sm min-h-[60px] mt-1" value={form.doctor_notes||""} onChange={e=>set("doctor_notes",e.target.value)}/></div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
              <Label className="text-xs">Body Map पर click करें</Label>
              <BodyDiagram value={bodySelection} onSelect={setBodySelection}/>
              {bodySelection && <div style={{fontSize:12,fontWeight:700,color:"#6366f1",background:"#eef2ff",padding:"4px 12px",borderRadius:99}}>{bodySelection.side} {bodySelection.body_part}</div>}
            </div>
          </div>
        </ScrollArea>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={updateCase.isPending} style={{background:"linear-gradient(135deg,#6366f1,#8b5cf6)"}}>
            {updateCase.isPending?<Loader2 className="h-4 w-4 animate-spin"/>:<><Check className="h-4 w-4 mr-1"/>Save</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Fracture Profile Dialog (X-Ray + Details) ───────────────────────────────
type FractureXray = {
  id: string;
  file_url: string;
  notes?: string;
  created_at: string;
  visit_label?: string;   // e.g. "Week 1", "Week 2"
};

function FractureProfileDialog({ open, onClose, caseData }: { open: boolean; onClose: () => void; caseData: any }) {
  const [uploadBusy, setUploadBusy] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [visitLabel, setVisitLabel] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const patientId = caseData?.patient_id;
  const caseId    = caseData?.id;

  // ✅ Sahi table: fracture_xrays (xray_reports nahi)
  const { data: xraysData, isLoading: loadingXrays, refetch: fetchXrays } = useFractureXrays(open ? caseId : undefined);
  const xrays: FractureXray[] = (xraysData || []).map((x: any) => ({
    id:         x.id,
    file_url:   x.file_url,
    notes:      x.notes || "",
    created_at: x.image_date || x.created_at || new Date().toISOString(),
    visit_label: x.label || x.report_type || "",
  })).reverse(); // ascending order mein dikhao

  useEffect(() => { if (open && caseData) { fetchXrays(); setNoteText(""); setVisitLabel(""); setCompareMode(false); } }, [open, caseData]);

  const handleUpload = async (file: File) => {
    if (!file || !patientId || !caseId) return;
    setUploadBusy(true);
    try {
      // ✅ uploadFractureXray: fracture_xrays table + xray-files bucket (sahi jagah)
      const result = await uploadFractureXray(caseId, patientId, file);
      if (result.queued) {
        toast.success("📶 Offline saved — internet aane par upload ho jayega");
      } else {
        toast.success("✅ X-Ray upload ho gaya!");
      }
      setNoteText(""); setVisitLabel("");
      fetchXrays();
    } catch (e: any) {
      toast.error(e?.message || "Upload fail hua");
    } finally {
      setUploadBusy(false);
    }
  };

  if (!caseData) return null;
  const name  = caseData.patients?.name || "Patient";
  const mob   = caseData.patients?.mobile || "—";
  const bp    = `${caseData.side || ""} ${caseData.body_part || ""}`.trim();
  const pct   = healPct(caseData.plaster_date, caseData.followup_days);

  const latest  = xrays[xrays.length - 1];
  const previous = xrays[xrays.length - 2];

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="sm:max-w-2xl" style={{padding:0,overflow:"hidden",borderRadius:20,maxHeight:"calc(100vh - 2rem)",display:"flex",flexDirection:"column"}}>
          {/* ✅ Zoom overlay — Dialog ke ANDAR hai, isliye Dialog ke upar dikhega */}
          {zoomImg && (
            <div onClick={() => setZoomImg(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
              <img src={zoomImg} alt="X-Ray Zoom" style={{maxWidth:"92vw",maxHeight:"calc(100vh - 4rem)",borderRadius:12,boxShadow:"0 0 60px #000"}} onClick={e=>e.stopPropagation()}/>
              <button onClick={() => setZoomImg(null)} style={{position:"fixed",top:18,right:18,background:"#fff",border:"none",borderRadius:"50%",width:40,height:40,cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",zIndex:100000,boxShadow:"0 2px 12px rgba(0,0,0,0.4)"}}>✕</button>
            </div>
          )}

          {/* ── Colorful Header ── */}
          <div style={{background:"linear-gradient(135deg,#1e3a5f,#6366f1,#8b5cf6)",padding:"20px 24px 16px",position:"relative",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:56,height:56,borderRadius:16,background:"rgba(255,255,255,0.18)",display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid rgba(255,255,255,0.3)"}}>
                <Bone style={{width:28,height:28,color:"#fff"}}/>
              </div>
              <div style={{flex:1}}>
                <p style={{fontWeight:900,fontSize:18,margin:0,color:"#fff"}}>{name}</p>
                <p style={{fontSize:12,color:"rgba(255,255,255,0.75)",margin:"2px 0 0"}}>{bp} · {caseData.fracture_type || "—"} · {caseData.plaster_type || "—"}</p>
                <p style={{fontSize:11,color:"rgba(255,255,255,0.6)",margin:"1px 0 0"}}>📞 {mob}</p>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{background:"rgba(255,255,255,0.15)",borderRadius:12,padding:"8px 14px"}}>
                  <p style={{fontSize:10,color:"rgba(255,255,255,0.7)",margin:0}}>Healing</p>
                  <p style={{fontSize:22,fontWeight:900,color:"#fff",margin:0}}>{pct}%</p>
                </div>
              </div>
            </div>
            {/* heal bar */}
            <div style={{marginTop:12,height:6,borderRadius:99,background:"rgba(255,255,255,0.2)"}}>
              <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#34d399,#86efac)",borderRadius:99,transition:"width 0.8s"}}/>
            </div>
          </div>

          <ScrollArea style={{flex:1,minHeight:0}}>
            <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:16}}>

              {/* ── Key Info Grid ── */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {[
                  ["🦴 Fracture","#6366f1","#eef2ff", caseData.fracture_type||"—"],
                  ["📅 Plaster Date","#0ea5e9","#e0f2fe", fmtDate(caseData.plaster_date)],
                  ["🗓 Next Follow-up","#f59e0b","#fffbeb", fmtDate(caseData.next_followup_date)],
                  ["⚡ Cause","#8b5cf6","#f5f3ff", caseData.cause||"—"],
                  ["🏥 Plaster Type","#10b981","#f0fdf4", caseData.plaster_type||"—"],
                  ["⏱ Follow-up Days","#ec4899","#fdf2f8", `${caseData.followup_days||"—"} din`],
                ].map(([label,clr,bg,val]:any) => (
                  <div key={label} style={{background:bg,borderRadius:12,padding:"10px 12px",border:`1.5px solid ${clr}25`}}>
                    <p style={{fontSize:9,fontWeight:700,color:clr,margin:"0 0 3px",textTransform:"uppercase",letterSpacing:0.5}}>{label}</p>
                    <p style={{fontSize:12,fontWeight:700,margin:0,color:"#1e293b"}}>{val}</p>
                  </div>
                ))}
              </div>

              {/* Doctor Notes */}
              {caseData.doctor_notes && (
                <div style={{background:"#fffbeb",borderRadius:12,padding:"10px 14px",border:"1.5px solid #fde68a"}}>
                  <p style={{fontSize:10,fontWeight:700,color:"#92400e",margin:"0 0 4px"}}>📝 Doctor Notes</p>
                  <p style={{fontSize:12,color:"#374151",margin:0}}>{caseData.doctor_notes}</p>
                </div>
              )}

              {/* ── X-Ray Section ── */}
              <div style={{borderRadius:16,border:"2px solid #e0e7ff",overflow:"hidden"}}>
                {/* X-Ray header */}
                <div style={{background:"linear-gradient(135deg,#eef2ff,#f5f3ff)",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:20}}>🩻</span>
                    <div>
                      <p style={{fontWeight:800,fontSize:13,margin:0,color:"#4338ca"}}>Fracture X-Ray History</p>
                      <p style={{fontSize:10,color:"#6366f1",margin:0}}>{xrays.length} X-Ray{xrays.length!==1?"s":""} uploaded</p>
                    </div>
                  </div>
                  {xrays.length >= 2 && (
                    <button onClick={() => setCompareMode(p=>!p)} style={{padding:"6px 14px",borderRadius:99,border:"1.5px solid #6366f1",background:compareMode?"#6366f1":"#fff",color:compareMode?"#fff":"#6366f1",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                      {compareMode?"✕ Close Compare":"⚖ Compare X-Rays"}
                    </button>
                  )}
                </div>

                {/* Compare Mode — side by side */}
                {compareMode && previous && latest && (
                  <div style={{padding:14,background:"#f8fafc"}}>
                    <p style={{fontSize:11,fontWeight:700,color:"#6366f1",margin:"0 0 10px",textAlign:"center"}}>📊 Previous vs Latest X-Ray</p>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                      {[{label:"⬅ Previous",x:previous},{label:"Latest ➡",x:latest}].map(({label,x}) => (
                        <div key={x.id} style={{textAlign:"center"}}>
                          <div style={{fontSize:10,fontWeight:700,color:"#374151",marginBottom:6,padding:"4px 8px",borderRadius:99,background:label.includes("Latest")?"#dcfce7":"#e0e7ff",display:"inline-block"}}>
                            {label} — {x.report_type?.replace("Ortho X-Ray — ","") || "X-Ray"}
                          </div>
                          <div style={{position:"relative",cursor:"zoom-in"}} onClick={() => setZoomImg(x.file_url)}>
                            <img src={x.file_url} alt="X-Ray" style={{width:"100%",borderRadius:10,border:"2px solid #e2e8f0",background:"#000",minHeight:120,objectFit:"contain"}} onError={e=>(e.currentTarget.style.display="none")}/>
                            <div style={{position:"absolute",inset:0,background:"transparent",display:"flex",alignItems:"center",justifyContent:"center",opacity:0}} className="hover-zoom">
                              <ZoomIn style={{width:32,height:32,color:"#fff"}}/>
                            </div>
                          </div>
                          <p style={{fontSize:10,color:"#6b7280",marginTop:4}}>{fmtDate(x.created_at)}</p>
                          {x.notes && <p style={{fontSize:10,color:"#374151",marginTop:2}}>{(() => { try { return JSON.parse(x.report_data || "{}").note || ""; } catch { return ""; } })()}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All X-Rays list */}
                {!compareMode && (
                  <div style={{padding:14,display:"flex",flexDirection:"column",gap:10}}>
                    {loadingXrays && <p style={{fontSize:12,color:"#9ca3af",textAlign:"center",padding:16}}>Loading X-Rays...</p>}
                    {!loadingXrays && xrays.length === 0 && (
                      <div style={{textAlign:"center",padding:"20px 10px",color:"#9ca3af"}}>
                        <p style={{fontSize:32,marginBottom:6}}>🩻</p>
                        <p style={{fontSize:12}}>Abhi koi X-Ray upload nahi hua</p>
                        <p style={{fontSize:11}}>Neeche se pehla X-Ray upload karo</p>
                      </div>
                    )}
                    {!loadingXrays && xrays.map((x, i) => (
                      <div key={x.id} style={{borderRadius:12,border:"1.5px solid #e2e8f0",overflow:"hidden",background:"#fff"}}>
                        {/* X-Ray header */}
                        <div style={{padding:"8px 12px",background:"linear-gradient(90deg,#f8fafc,#f0f9ff)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontSize:10,background:i===xrays.length-1?"#dcfce7":"#e0e7ff",borderRadius:99,padding:"2px 8px",fontWeight:700,color:i===xrays.length-1?"#16a34a":"#4338ca"}}>
                              {i===xrays.length-1?"🆕 Latest":x.report_type?.replace("Ortho X-Ray — ","") || `Visit ${i+1}`}
                            </span>
                            <span style={{fontSize:10,color:"#6b7280"}}>{fmtDate(x.created_at)}</span>
                          </div>
                          <button onClick={() => setZoomImg(x.file_url)} style={{background:"none",border:"none",cursor:"pointer",color:"#6366f1",fontSize:11,display:"flex",alignItems:"center",gap:3}}>
                            <ZoomIn style={{width:13,height:13}}/> Zoom
                          </button>
                        </div>
                        {/* Image */}
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
                          <div style={{cursor:"zoom-in"}} onClick={() => setZoomImg(x.file_url)}>
                            <img src={x.file_url} alt="X-Ray" style={{width:"100%",maxHeight:160,objectFit:"contain",background:"#111",borderRadius:0}} onError={e=>(e.currentTarget.parentElement!.innerHTML='<div style="height:80px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:11px">Image load nahi hua</div>')}/>
                          </div>
                          <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",justifyContent:"center",gap:6}}>
                            <p style={{fontSize:10,fontWeight:700,color:"#374151",margin:0}}>Notes:</p>
                            <p style={{fontSize:11,color:"#6b7280",margin:0}}>{(() => { try { return JSON.parse(x.report_data || "{}").note || "—"; } catch { return "—"; } })()}</p>
                            {i > 0 && (
                              <div style={{background:"#f0fdf4",borderRadius:8,padding:"5px 8px",marginTop:4}}>
                                <p style={{fontSize:9,color:"#16a34a",fontWeight:700,margin:0}}>📈 Day {Math.round(diffDays(xrays[0].created_at, x.created_at))} of treatment</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Upload New X-Ray ── */}
                <div style={{padding:"14px 16px",background:"linear-gradient(135deg,#f0fdf4,#f8fafc)",borderTop:"2px dashed #bbf7d0"}}>
                  <p style={{fontSize:12,fontWeight:700,color:"#16a34a",margin:"0 0 10px",display:"flex",alignItems:"center",gap:6}}>
                    <Upload style={{width:14,height:14}}/>
                    Naya X-Ray Upload Karo
                  </p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                    <div>
                      <Label className="text-xs">Visit Label</Label>
                      <Input value={visitLabel} onChange={e=>setVisitLabel(e.target.value)} placeholder="e.g. Week 1, Day 7..." className="h-8 mt-1 text-xs"/>
                    </div>
                    <div>
                      <Label className="text-xs">Notes (optional)</Label>
                      <Input value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Observation..." className="h-8 mt-1 text-xs"/>
                    </div>
                  </div>
                  <input ref={fileRef} type="file" accept="image/*,.pdf" style={{display:"none"}} onChange={e=>{ const f=e.target.files?.[0]; if(f) handleUpload(f); e.target.value=""; }}/>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadBusy}
                    style={{width:"100%",padding:"10px",borderRadius:12,border:"2px dashed #10b981",background:"#fff",cursor:"pointer",fontSize:12,fontWeight:700,color:"#16a34a",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    {uploadBusy ? <><Loader2 style={{width:14,height:14,animation:"spin 1s linear infinite"}}/>Uploading...</> : <><Upload style={{width:14,height:14}}/>📁 File Choose Karo (Image / PDF)</>}
                  </button>
                </div>
              </div>

              {/* Recovery Timeline */}
              <RecoveryTimeline c={caseData}/>

            </div>
          </ScrollArea>

          <div style={{padding:"12px 20px",borderTop:"1.5px solid #e2e8f0",display:"flex",justifyContent:"flex-end"}}>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Patient Detail + Full SMS Dialog ─────────
function DetailDialog({ open, onClose, caseData }: { open: boolean; onClose: () => void; caseData: any }) {
  const [customMsg, setCustomMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [visitNotes, setVisitNotes] = useState<Visit[]>([]);
  const [tab, setTab] = useState<"sms"|"timeline"|"visits">("sms");
  useEffect(() => { if(open && caseData) setVisitNotes(getVisits(caseData.id)); }, [open, caseData]);

  const send = async (kind: string, msg: string) => {
    const mob = caseData?.patients?.mobile||""; if(!mob) return toast.error("Mobile number nahi hai");
    setBusy(true);
    const r = await sendSMS(mob, msg, caseData?.patients?.name||"", kind);
    setBusy(false);
    toast[r.ok?"success":"error"](r.ok?(r.queued?"⏳ Queue mein — internet aane par jayega":"✅ SMS bheja gaya"):"❌ SMS fail");
  };

  if(!caseData) return null;
  const name = caseData.patients?.name||"Patient";
  const mob  = caseData.patients?.mobile||"—";
  const bp   = `${caseData.side||""} ${caseData.body_part||""}`.trim();
  const pct  = healPct(caseData.plaster_date, caseData.followup_days);
  const dLeft = caseData.next_followup_date ? diffDays(todayIso(), caseData.next_followup_date) : null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <Bone style={{width:20,height:20,color:"#fff"}}/>
              </div>
              <div>
                <p style={{fontWeight:800,fontSize:15,margin:0}}>{name}</p>
                <p style={{fontSize:11,color:"#6b7280",margin:0}}>{bp} · {caseData.plaster_type}</p>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Mini tabs */}
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          {(["sms","timeline","visits"] as const).map(t => (
            <button key={t} onClick={()=>setTab(t)} style={{padding:"6px 14px",borderRadius:99,border:"1.5px solid",borderColor:tab===t?"#6366f1":"#e2e8f0",background:tab===t?"#6366f1":"#f8fafc",color:tab===t?"#fff":"#374151",fontSize:12,fontWeight:600,cursor:"pointer"}}>
              {t==="sms"?"📱 SMS":t==="timeline"?"📅 Timeline":"📋 Visits"}
            </button>
          ))}
        </div>

        <ScrollArea className="max-h-[calc(100vh-18rem)]">
          {tab === "sms" && (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* Info */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[["Plaster",caseData.plaster_type||"—"],["Fracture",caseData.fracture_type||"—"],["Plaster Date",fmtDate(caseData.plaster_date)],["Next FU",fmtDate(caseData.next_followup_date)]].map(([l,v])=>(
                  <div key={l} style={{background:"#f8fafc",borderRadius:10,padding:"8px 12px"}}>
                    <p style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",marginBottom:2}}>{l}</p>
                    <p style={{fontSize:12,fontWeight:600,margin:0}}>{v}</p>
                  </div>
                ))}
              </div>
              {/* Status */}
              {dLeft !== null && (
                <div style={{padding:"8px 12px",borderRadius:10,background:dLeft<0?"#fef2f2":dLeft===0?"#fffbeb":"#f0fdf4",border:`1px solid ${dLeft<0?"#fecaca":dLeft===0?"#fde68a":"#bbf7d0"}`}}>
                  <p style={{fontSize:12,fontWeight:700,margin:0,color:dLeft<0?"#dc2626":dLeft===0?"#d97706":"#16a34a"}}>
                    {dLeft<0?`⚠ ${Math.abs(dLeft)} din late!`:dLeft===0?"🔔 Aaj FU hai!":` ✅ ${dLeft} din baaki`}
                  </p>
                </div>
              )}
              {/* Heal bar */}
              <HealBar pct={pct}/>
              {/* Phone */}
              <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#6b7280"}}>
                <Phone style={{width:13,height:13}}/>{mob}
              </div>
              {/* SMS Buttons */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[
                  ["🔔 FU Reminder", ()=>send("followup_reminder", tplReminder(name, caseData.next_followup_date||""))],
                  ["🛡 Precaution",   ()=>send("precaution", tplPrecaution(name, bp, caseData.next_followup_date||""))],
                  ["🥛 Diet Tips",    ()=>send("diet_tips", tplDiet(name, caseData.body_part||""))],
                  ["🏃 Exercises",    ()=>send("exercise", tplExercise(name, caseData.body_part||""))],
                  ["📋 Care Guide",   ()=>send("care", tplCare(name, bp, caseData.next_followup_date||""))],
                  ["🎉 Removed SMS",  ()=>send("removed", tplRemoved(name, bp))],
                ].map(([label, fn]: any) => (
                  <button key={label} disabled={busy} onClick={fn} style={{padding:"9px 6px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                    {label}
                  </button>
                ))}
              </div>
              {/* Custom SMS */}
              <div style={{display:"flex",gap:8}}>
                <Textarea value={customMsg} onChange={e=>setCustomMsg(e.target.value)} placeholder="Custom SMS..." rows={2} className="text-sm flex-1"/>
                <Button disabled={busy||!customMsg.trim()} onClick={()=>send("custom",customMsg)} style={{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",alignSelf:"flex-end"}}>
                  <Send className="h-4 w-4"/>
                </Button>
              </div>
              {/* Print buttons */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,paddingTop:4,borderTop:"1px solid #e2e8f0"}}>
                <button onClick={()=>printCareInstructions(caseData)} style={{padding:"8px 6px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f0fdf4",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4,color:"#16a34a"}}>
                  <Printer style={{width:13,height:13}}/>Care Guide PDF
                </button>
                <button onClick={()=>printRemovalSlip(caseData)} style={{padding:"8px 6px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f0fdf4",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4,color:"#16a34a"}}>
                  <Printer style={{width:13,height:13}}/>Removal Slip
                </button>
              </div>
            </div>
          )}

          {tab === "timeline" && (
            <div>
              <RecoveryTimeline c={caseData}/>
              {caseData.doctor_notes && (
                <div style={{background:"#fffbeb",borderRadius:10,padding:"10px 12px",border:"1px solid #fde68a"}}>
                  <p style={{fontSize:10,fontWeight:700,color:"#92400e",marginBottom:4}}>📝 Doctor Notes</p>
                  <p style={{fontSize:12,color:"#374151",margin:0}}>{caseData.doctor_notes}</p>
                </div>
              )}
            </div>
          )}

          {tab === "visits" && (
            <VisitNotesTab caseId={caseData.id} visits={visitNotes} onAdd={v=>{ addVisit(caseData.id,v); setVisitNotes(getVisits(caseData.id)); }}/>
          )}
        </ScrollArea>
        <DialogFooter className="pt-2"><Button variant="ghost" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Visit Notes Tab ──────────────────────────
function VisitNotesTab({ caseId, visits, onAdd }: { caseId: string; visits: Visit[]; onAdd: (v: Visit) => void }) {
  const [notes, setNotes] = useState("");
  const [nextDate, setNextDate] = useState(addDays(todayIso(), 7));
  const save = () => {
    if(!notes.trim()) return toast.error("Notes likho");
    onAdd({ date: todayIso(), notes: notes.trim(), nextDate });
    setNotes(""); toast.success("✅ Visit note save ho gaya");
  };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{background:"#f8fafc",borderRadius:12,padding:12}}>
        <p style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:8}}>➕ New Visit Note</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <div><Label className="text-xs">Today's Date</Label><Input value={fmtDate(todayIso())} readOnly className="h-8 mt-1 text-xs bg-muted"/></div>
          <div><Label className="text-xs">Next Followup</Label><Input type="date" value={nextDate} onChange={e=>setNextDate(e.target.value)} className="h-8 mt-1 text-xs"/></div>
        </div>
        <Textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Is visit ke observations, patient condition..." rows={3} className="text-sm mb-2"/>
        <Button onClick={save} size="sm" style={{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",width:"100%"}}>
          <Save className="h-3.5 w-3.5 mr-1"/> Save Visit Note
        </Button>
      </div>
      {visits.length === 0 ? <p style={{fontSize:12,color:"#9ca3af",textAlign:"center",padding:20}}>Koi visit notes nahi abhi</p>
        : visits.map((v,i) => (
          <div key={i} style={{borderRadius:10,border:"1px solid #e2e8f0",padding:"10px 12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:11,fontWeight:700,color:"#6366f1"}}>📅 {fmtDate(v.date)}</span>
              <span style={{fontSize:10,color:"#6b7280"}}>Next: {fmtDate(v.nextDate)}</span>
            </div>
            <p style={{fontSize:12,color:"#374151",margin:0}}>{v.notes}</p>
          </div>
        ))
      }
    </div>
  );
}

// ─── FU Done Dialog ───────────────────────────
function FuDoneDialog({ open, onClose, caseData, onDone }: { open: boolean; onClose: () => void; caseData: any; onDone: (newDate: string, notes: string) => void }) {
  const [nextDays, setNextDays] = useState("7");
  const [notes, setNotes] = useState("");
  if(!caseData) return null;
  const newDate = addDays(todayIso(), Number(nextDays)||7);
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:32,height:32,borderRadius:10,background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <CheckCircle2 style={{width:16,height:16,color:"#fff"}}/>
            </div>
            Followup Complete ✅
          </DialogTitle>
        </DialogHeader>
        <div style={{background:"#f0fdf4",borderRadius:12,padding:"10px 14px",marginBottom:10}}>
          <p style={{fontWeight:700,fontSize:14,margin:0}}>{caseData.patients?.name}</p>
          <p style={{fontSize:12,color:"#6b7280",margin:0}}>{caseData.side} {caseData.body_part}</p>
          <p style={{fontSize:11,color:"#16a34a",margin:"4px 0 0",fontWeight:600}}>Heal: {healPct(caseData.plaster_date, caseData.followup_days)}% 🎉</p>
        </div>
        <div style={{marginBottom:10}}>
          <Label className="text-xs">अगला Followup — कितने दिन बाद?</Label>
          <Input type="number" value={nextDays} onChange={e=>setNextDays(e.target.value)} min={1} className="h-9 mt-1"/>
          <p style={{fontSize:11,color:"#6b7280",marginTop:4}}>📅 Next: <strong>{fmtDate(newDate)}</strong></p>
        </div>
        <div><Label className="text-xs">Visit Notes (optional)</Label>
          <Textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Is visit ke observations..." className="text-sm mt-1"/>
        </div>
        <DialogFooter className="pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={()=>onDone(newDate, notes)} style={{background:"linear-gradient(135deg,#10b981,#059669)"}}>
            <Check className="h-4 w-4 mr-1"/> Complete & Next FU
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reschedule Dialog ────────────────────────
function RescheduleDialog({ open, onClose, caseData }: { open: boolean; onClose: () => void; caseData: any }) {
  const updateCase = useUpdateFractureCase();
  const [newDate, setNewDate] = useState(caseData?.next_followup_date || todayIso());
  const [reason, setReason] = useState("");
  useEffect(()=>{ if(caseData) setNewDate(caseData.next_followup_date||todayIso()); }, [caseData]);
  const save = async () => {
    try {
      await updateCase.mutateAsync({ id: caseData.id, next_followup_date: newDate, doctor_notes: reason ? `[Rescheduled: ${reason}] ${caseData.doctor_notes||""}` : caseData.doctor_notes } as any);
      const name = caseData.patients?.name||""; const mob = caseData.patients?.mobile||"";
      if(mob) { const r = await sendSMS(mob, tplReminder(name, newDate), name, "reschedule"); if(r.ok) toast.success(r.queued?"⏳ SMS queue":"✅ New date ka SMS bheja"); }
      toast.success(`✅ FU reschedule ho gaya — ${fmtDate(newDate)}`); onClose();
    } catch(e: any) { toast.error(e?.message||"Fail"); }
  };
  if(!caseData) return null;
  return (
    <Dialog open={open} onOpenChange={v=>!v&&onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle style={{display:"flex",alignItems:"center",gap:8}}><Calendar style={{width:16,height:16,color:"#f59e0b"}}/>Reschedule Follow-up</DialogTitle></DialogHeader>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:"#fffbeb",borderRadius:10,padding:"8px 12px"}}>
            <p style={{fontWeight:700,margin:0}}>{caseData.patients?.name}</p>
            <p style={{fontSize:12,color:"#6b7280",margin:0}}>Current FU: {fmtDate(caseData.next_followup_date)}</p>
          </div>
          <div><Label className="text-xs">New Followup Date</Label><Input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} className="h-9 mt-1"/></div>
          <div><Label className="text-xs">Reason (optional)</Label><Input value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Patient bahar gaya tha..." className="h-9 mt-1 text-sm"/></div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={updateCase.isPending} style={{background:"linear-gradient(135deg,#f59e0b,#d97706)"}}>
            <Calendar className="h-4 w-4 mr-1"/> Reschedule & SMS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Analytics ────────────────────────────────
function AnalyticsSection({ cases, followups }: { cases: any[]; followups: any[] }) {
  const today = todayIso();
  const active    = cases.filter(c=>c.plaster_status==="Active");
  const done      = cases.filter(c=>c.plaster_status!=="Active");
  const missed    = followups.filter(f=>f.next_followup_date && f.next_followup_date<today && f.plaster_status==="Active");
  const bodyCount: Record<string,number> = {};
  const typeCount: Record<string,number> = {};
  const causeCount: Record<string,number> = {};
  cases.forEach(c=>{
    if(c.body_part) bodyCount[c.body_part]=(bodyCount[c.body_part]||0)+1;
    if(c.fracture_type) typeCount[c.fracture_type]=(typeCount[c.fracture_type]||0)+1;
    if(c.cause) causeCount[c.cause]=(causeCount[c.cause]||0)+1;
  });
  const topBody  = Object.entries(bodyCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const topType  = Object.entries(typeCount).sort((a,b)=>b[1]-a[1]).slice(0,4);
  const topCause = Object.entries(causeCount).sort((a,b)=>b[1]-a[1]).slice(0,4);
  const avgHeal  = done.filter(c=>c.plaster_date&&c.next_followup_date).map(c=>diffDays(c.plaster_date,c.next_followup_date)).reduce((a,b,_,arr)=>a+b/arr.length,0);
  const colors   = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981"];

  return (
    <div style={{display:"grid",gap:16}}>
      {/* Summary row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12}}>
        {[["📋","Total",cases.length,"#6366f1"],["🦴","Active",active.length,"#f59e0b"],["✅","Completed",done.length,"#10b981"],["⚠️","Missed FU",missed.length,"#ef4444"],["⏱","Avg Heal","~"+Math.round(avgHeal||0)+"d","#0ea5e9"]].map(([ic,l,v,c]: any)=>(
          <div key={l} style={{borderRadius:14,padding:"14px 12px",background:`${c}10`,border:`1.5px solid ${c}30`,textAlign:"center"}}>
            <div style={{fontSize:24,marginBottom:4}}>{ic}</div>
            <div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div>
            <div style={{fontSize:11,color:"#6b7280",fontWeight:500}}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14}}>
        {/* Top body parts */}
        <div style={{borderRadius:16,border:"1.5px solid #e2e8f0",padding:16,background:"#fff"}}>
          <p style={{fontWeight:700,fontSize:14,marginBottom:12,color:"#1e293b"}}>🦴 Common Fracture Sites</p>
          {topBody.length===0 ? <p style={{fontSize:12,color:"#9ca3af"}}>Data nahi hai</p>
            : topBody.map(([part,cnt],i)=>(
              <div key={part} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                  <span style={{fontWeight:600}}>{part}</span>
                  <span style={{color:colors[i],fontWeight:700}}>{cnt} cases</span>
                </div>
                <div style={{height:6,borderRadius:99,background:"#f1f5f9"}}>
                  <div style={{height:"100%",width:`${Math.round((cnt/cases.length)*100)}%`,background:colors[i],borderRadius:99}}/>
                </div>
              </div>
            ))}
        </div>

        {/* Fracture types */}
        <div style={{borderRadius:16,border:"1.5px solid #e2e8f0",padding:16,background:"#fff"}}>
          <p style={{fontWeight:700,fontSize:14,marginBottom:12,color:"#1e293b"}}>📊 Fracture Types</p>
          {topType.length===0 ? <p style={{fontSize:12,color:"#9ca3af"}}>Data nahi hai</p>
            : topType.map(([type,cnt],i)=>(
              <div key={type} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderRadius:10,background:`${colors[i]}10`,marginBottom:6}}>
                <span style={{fontSize:13,fontWeight:600}}>{type}</span>
                <span style={{fontSize:11,color:colors[i],fontWeight:700,background:`${colors[i]}20`,padding:"2px 10px",borderRadius:99}}>{cnt}</span>
              </div>
            ))}
        </div>

        {/* Causes */}
        <div style={{borderRadius:16,border:"1.5px solid #e2e8f0",padding:16,background:"#fff"}}>
          <p style={{fontWeight:700,fontSize:14,marginBottom:12,color:"#1e293b"}}>⚡ Fracture Causes</p>
          {topCause.length===0 ? <p style={{fontSize:12,color:"#9ca3af"}}>Data nahi hai</p>
            : topCause.map(([cause,cnt],i)=>(
              <div key={cause} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderRadius:10,background:`${colors[i]}10`,marginBottom:6}}>
                <span style={{fontSize:13,fontWeight:600}}>{cause}</span>
                <span style={{fontSize:11,color:colors[i],fontWeight:700,background:`${colors[i]}20`,padding:"2px 10px",borderRadius:99}}>{cnt}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Monthly report print */}
      <div style={{borderRadius:14,border:"1.5px dashed #6366f1",padding:"14px 18px",background:"#eef2ff",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
        <div>
          <p style={{fontWeight:700,fontSize:14,color:"#4338ca",margin:0}}>📄 Monthly Ortho Report</p>
          <p style={{fontSize:12,color:"#6366f1",margin:0}}>Is mahine ka complete report — cases, analytics, missed FU</p>
        </div>
        <button onClick={()=>printMonthlyReport(cases, followups)} style={{padding:"9px 20px",borderRadius:10,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:"#fff",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",gap:6}}>
          <Printer style={{width:15,height:15}}/> Print Report
        </button>
      </div>
    </div>
  );
}

// ─── Active Patient Card ──────────────────────
function ActiveCard({ c, onDetail, onEdit, onRemove, onFuDone, onReschedule, onFractureProfile }: any) {
  const navigate = useNavigate();
  const today = todayIso();
  const pct   = healPct(c.plaster_date, c.followup_days);
  const dLeft = c.next_followup_date ? diffDays(today, c.next_followup_date) : null;
  const isMissed = dLeft!==null && dLeft<0;
  const isToday  = dLeft===0;
  const isSoon   = dLeft!==null && dLeft>0 && dLeft<=2;
  const border = isMissed?"#ef4444":isToday?"#f59e0b":isSoon?"#6366f1":"#e2e8f0";
  const bg     = isMissed?"#fef2f2":isToday?"#fffbeb":isSoon?"#eef2ff":"#ffffff";

  return (
    <div style={{borderRadius:16,border:`2px solid ${border}`,background:bg,padding:14,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <div style={{flex:1,minWidth:0}}>
          <p
            onClick={()=>c.patient_id && navigate(`/patient-profile/${c.patient_id}`)}
            style={{fontWeight:800,fontSize:14,margin:"0 0 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:c.patient_id?"pointer":"default"}}
            title="Profile dekhne ke liye click karo">{c.patients?.name}</p>
          <p style={{fontSize:11,color:"#6b7280",margin:0}}>{c.side} {c.body_part} · {c.plaster_type||"—"} · {c.fracture_type||"—"}</p>
        </div>
        <div style={{display:"flex",gap:4,flexShrink:0,marginLeft:8}}>
          {isMissed && <span style={{fontSize:10,fontWeight:700,background:"#ef4444",color:"#fff",borderRadius:99,padding:"2px 7px"}}>⚠ Late</span>}
          {isToday  && <span style={{fontSize:10,fontWeight:700,background:"#f59e0b",color:"#fff",borderRadius:99,padding:"2px 7px"}}>Today</span>}
          {isSoon && !isMissed && !isToday && <span style={{fontSize:10,fontWeight:700,background:"#6366f1",color:"#fff",borderRadius:99,padding:"2px 7px"}}>{dLeft}d</span>}
        </div>
      </div>

      <div style={{marginBottom:8}}><HealBar pct={pct}/></div>

      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#6b7280",marginBottom:10}}>
        <span>📅 {fmtDate(c.plaster_date)}</span>
        <span style={{color:isMissed?"#ef4444":isToday?"#d97706":"#374151",fontWeight:isMissed||isToday?700:400}}>
          FU: {fmtDate(c.next_followup_date)}
        </span>
      </div>

      {/* Fracture Profile — main prominent button */}
      <button
        onClick={()=>onFractureProfile(c)}
        style={{width:"100%",marginBottom:6,padding:"9px 8px",borderRadius:12,border:"none",cursor:"pointer",fontSize:12,fontWeight:800,color:"#fff",background:"linear-gradient(135deg,#1e3a5f,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",gap:6,boxShadow:"0 2px 8px #6366f130"}}>
        🩻 Fracture Profile &amp; X-Ray
      </button>

      <div style={{display:"grid",gridTemplateColumns:"1fr auto auto auto auto auto",gap:5}}>
        <button onClick={()=>(isMissed||isToday)?onFuDone(c):onDetail(c)}
          style={{padding:"7px 4px",borderRadius:10,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff",background:isMissed||isToday?"linear-gradient(135deg,#10b981,#059669)":"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>
          {isMissed||isToday?<><CheckCircle2 style={{width:11,height:11}}/>FU Done</>:<><MessageCircle style={{width:11,height:11}}/>SMS</>}
        </button>
        <button onClick={()=>c.patient_id && navigate(`/patient-profile/${c.patient_id}`)} style={{padding:"7px 9px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer"}} title="General Profile">
          <User style={{width:12,height:12,color:"#0ea5e9"}}/>
        </button>
        {(isMissed||isToday) && (
          <button onClick={()=>onDetail(c)} style={{padding:"7px 9px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer"}} title="SMS / Detail">
            <MessageCircle style={{width:12,height:12,color:"#6366f1"}}/>
          </button>
        )}
        <button onClick={()=>onReschedule(c)} style={{padding:"7px 9px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer"}} title="Reschedule">
          <Calendar style={{width:12,height:12,color:"#f59e0b"}}/>
        </button>
        <button onClick={()=>onEdit(c)} style={{padding:"7px 9px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer"}} title="Edit">
          <Pencil style={{width:12,height:12,color:"#6366f1"}}/>
        </button>
        <button onClick={()=>onRemove(c)} style={{padding:"7px 9px",borderRadius:10,border:"1.5px solid #fecaca",background:"#fef2f2",cursor:"pointer"}} title="Remove Plaster">
          <PowerOff style={{width:12,height:12,color:"#ef4444"}}/>
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────
export default function Ortho() {
  const navigate = useNavigate();
  const today = todayIso();
  const { data: cases=[], refetch: refetchCases }       = useFractureCases();
  const { data: followups=[], refetch: refetchFollowups } = useFollowupsAround();
  const addCase    = useAddFractureCase();
  const updateCase = useUpdateFractureCase();
  const addPatient = useAddPatient();

  // ── Form ──
  const [mobile, setMobile] = useState(""); const [name, setName] = useState(""); const [age, setAge] = useState(""); const [selPt, setSelPt] = useState<any>(null);
  const { data: hits=[] } = useSearchPatients(mobile.length>=4?mobile:name.length>=2?name:"");
  const [bodySelection, setBodySelection] = useState<BodySelection|null>(null);
  const [fractureType, setFractureType] = useState(""); const [cause, setCause] = useState("");
  const [plasterType, setPlasterType]   = useState("POP Cast"); const [plasterDate, setPlasterDate] = useState(today); const [followupDays, setFollowupDays] = useState("21"); const [notes, setNotes] = useState("");
  const nextFU = useMemo(()=>addDays(plasterDate, Number(followupDays)||21), [plasterDate, followupDays]);

  const resetForm = () => { setMobile(""); setName(""); setAge(""); setSelPt(null); setBodySelection(null); setFractureType(""); setCause(""); setPlasterType("POP Cast"); setPlasterDate(today); setFollowupDays("21"); setNotes(""); };

  // ── Auto-delete ortho X-Rays older than 6 months ──
  useEffect(() => {
    const AUTO_DELETE_KEY = "ortho_xray_last_cleanup";
    const lastRun = localStorage.getItem(AUTO_DELETE_KEY);
    const now = Date.now();
    // Har 24 ghante mein ek baar chalao — bar bar nahi
    if (lastRun && now - Number(lastRun) < 86400000) return;

    const cleanup = async () => {
      try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const cutoff = sixMonthsAgo.toISOString();

        // 6 mahine se purane ortho X-Ray records fetch karo
        const { data: oldRecords } = await supabase
          .from("xray_reports")
          .select("id, file_url, report_type")
          .ilike("report_type", "%Ortho X-Ray%")
          .lt("created_at", cutoff);

        if (!oldRecords || oldRecords.length === 0) {
          localStorage.setItem(AUTO_DELETE_KEY, String(now));
          return;
        }

        // Storage se files delete karo
        const filePaths = oldRecords
          .map((r: any) => {
            try {
              // file_url se path nikalo: "xrays/patientId/filename.jpg"
              const url = new URL(r.file_url);
              const parts = url.pathname.split("/patient-files/");
              return parts[1] || null;
            } catch { return null; }
          })
          .filter(Boolean) as string[];

        if (filePaths.length > 0) {
          await supabase.storage.from("patient-files").remove(filePaths);
        }

        // Database records delete karo
        const ids = oldRecords.map((r: any) => r.id);
        await supabase.from("xray_reports").delete().in("id", ids);

        localStorage.setItem(AUTO_DELETE_KEY, String(now));
        console.log(`[Ortho Cleanup] ${ids.length} purane X-Ray delete kiye (6 mahine se zyada purane)`);
      } catch (e) {
        console.warn("[Ortho Cleanup] Error:", e);
      }
    };

    cleanup();
  }, []);

  const handleSave = async () => {
    if(!name||!mobile) return toast.error("Naam aur Mobile zaroori hai");
    if(!bodySelection?.body_part||!fractureType) return toast.error("Body Map pe click karo aur Fracture Type select karo");
    let patient = selPt;
    if(!patient) {
      // 🚨 FIX: agar list se explicitly patient select nahi kiya gaya (list
      // pe click nahi kiya), to bhi ek final safety check — isi mobile number
      // wala patient agar already search results (hits) mein maujood hai,
      // usi ko use karo, naya duplicate patient na banao.
      const cleanMobile = mobile.replace(/\D/g, "");
      const exactMatch = cleanMobile.length > 0 ? (hits as any[]).find((p: any) => (p.mobile || "").replace(/\D/g, "") === cleanMobile) : null;
      patient = exactMatch || await addPatient.mutateAsync({ name, mobile, age: age?Number(age):null } as any);
    }
    try {
      await addCase.mutateAsync({ patient_id: patient.id, patient_type: "fracture", body_part: bodySelection.body_part, side: bodySelection.side, fracture_type: fractureType, cause: cause||null, plaster_type: plasterType, plaster_date: plasterDate, followup_days: Number(followupDays)||21, next_followup_date: nextFU, plaster_status: "Active", doctor_notes: notes||null } as any);
      toast.success("✅ Case save ho gaya!");
      const r = await sendSMS(mobile, tplReminder(name, nextFU), name, "followup_reminder");
      if(r.ok) toast.success(r.queued?"⏳ SMS queue mein":"📱 SMS bheja gaya");
      resetForm(); refetchCases(); refetchFollowups();
    } catch(e: any) { toast.error(e?.message||"Save fail"); }
  };

  // ── Stats ──
  const { todayFuList, missedFuList } = useMemo(()=>({
    todayFuList:  (followups as any[]).filter(c=>c.next_followup_date===today),
    missedFuList: (followups as any[]).filter(c=>c.next_followup_date&&c.next_followup_date<today&&c.plaster_status==="Active"),
  }), [followups, today]);

  const activeCases    = useMemo(()=>(cases as any[]).filter(c=>c.plaster_status==="Active"), [cases]);
  const completedCases = useMemo(()=>(cases as any[]).filter(c=>c.plaster_status!=="Active"), [cases]);

  // ── Search ──
  const [activeSearch, setActiveSearch] = useState("");
  const [compSearch, setCompSearch]     = useState("");
  const filteredActive    = useMemo(()=>{ const q=activeSearch.toLowerCase(); const list = q?activeCases.filter((c: any)=>(c.patients?.name||"").toLowerCase().includes(q)||(c.body_part||"").toLowerCase().includes(q)):activeCases; return [...list].sort((a: any,b: any)=>(b.plaster_date||"").localeCompare(a.plaster_date||"")); }, [activeCases, activeSearch]);
  const filteredCompleted = useMemo(()=>{ const q=compSearch.toLowerCase(); const list = q?completedCases.filter((c: any)=>(c.patients?.name||"").toLowerCase().includes(q)):completedCases; return [...list].sort((a: any,b: any)=>(b.plaster_date||"").localeCompare(a.plaster_date||"")); }, [completedCases, compSearch]);

  // ── Dialogs ──
  const [editCase, setEditCase]         = useState<any>(null);
  const [detailCase, setDetailCase]     = useState<any>(null);
  const [removeTarget, setRemoveTarget] = useState<any>(null);
  const [removeBusy, setRemoveBusy]     = useState(false);
  const [fuDoneCase, setFuDoneCase]     = useState<any>(null);
  const [rescheduleCase, setRescheduleCase] = useState<any>(null);
  const [fractureProfileCase, setFractureProfileCase] = useState<any>(null);

  const handleRemove = async () => {
    if(!removeTarget) return; setRemoveBusy(true);
    try {
      await updateCase.mutateAsync({ id: removeTarget.id, plaster_status: "Removed" } as any);
      const n = removeTarget.patients?.name||""; const mob = removeTarget.patients?.mobile||"";
      if(mob) { const r = await sendSMS(mob, tplRemoved(n, removeTarget.body_part||""), n, "plaster_removed"); if(r.ok) toast.success(r.queued?"⏳ SMS queue":"✅ Plaster removed SMS bheja"); }
      else toast.success("✅ Plaster Removed");
      setRemoveTarget(null); refetchCases(); refetchFollowups();
    } catch(e: any) { toast.error(e?.message||"Update fail"); } finally { setRemoveBusy(false); }
  };

  const handleFuDone = async (newDate: string, fuNotes: string) => {
    if(!fuDoneCase) return;
    try {
      await updateCase.mutateAsync({ id: fuDoneCase.id, next_followup_date: newDate, doctor_notes: fuNotes||fuDoneCase.doctor_notes } as any);
      if(fuNotes) addVisit(fuDoneCase.id, { date: today, notes: fuNotes, nextDate: newDate });
      const n = fuDoneCase.patients?.name||""; const mob = fuDoneCase.patients?.mobile||"";
      if(mob) await sendSMS(mob, tplReminder(n, newDate), n, "followup_reminder");
      toast.success(`✅ FU complete! Next: ${fmtDate(newDate)}`);
      setFuDoneCase(null); refetchCases(); refetchFollowups();
    } catch(e: any) { toast.error(e?.message||"Update fail"); }
  };

  // ── Calendar ──
  const next7    = useMemo(()=>Array.from({length:7},(_,i)=>addDays(today,i)), [today]);
  const fuByDate = useMemo(()=>{ const m: Record<string,any[]>={}; (followups as any[]).forEach(f=>{ if(f.next_followup_date)(m[f.next_followup_date]||=[]).push(f); }); return m; }, [followups]);
  const [todayBusy, setTodayBusy] = useState(false);
  const sendTodayReminders = async () => {
    if(!todayFuList.length) return toast.error("Aaj koi FU nahi");
    setTodayBusy(true); let sent=0;
    for(const f of todayFuList) { const r = await sendSMS(f.patients?.mobile||"", tplToday(f.patients?.name||""), f.patients?.name||"", "followup_today"); if(r.ok) sent++; }
    setTodayBusy(false); toast.success(`✅ ${sent}/${todayFuList.length} SMS bheje`);
  };

  // ── Leave ──
  const [leaves, setLeavesState] = useState<string[]>(getLeaves());
  const [leaveDate, setLeaveDate] = useState(today);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const leaveAffected = useMemo(()=>(followups as any[]).filter(f=>f.next_followup_date===leaveDate), [followups, leaveDate]);
  const saveLeaves    = (l: string[]) => { setLeaveStore(l); setLeavesState(l); };
  const [longFrom, setLongFrom]   = useState(today); const [longTo, setLongTo] = useState(addDays(today,3)); const [longBusy, setLongBusy] = useState(false); const [longConfirm, setLongConfirm] = useState(false);

  const sendLongLeave = async () => {
    setLongConfirm(false); setLongBusy(true); let sent=0;
    for(const c of activeCases) { const r = await sendSMS(c.patients?.mobile||"", tplLongLeave(c.patients?.name||"", longFrom, longTo), c.patients?.name||"", "long_leave"); if(r.ok) sent++; }
    const d=new Set(leaves); for(let dt=longFrom;dt<=longTo;dt=addDays(dt,1)) d.add(dt);
    saveLeaves([...d]); setLongBusy(false); toast.success(`✅ ${sent} SMS bheje!`);
  };

  return (
    <DashboardLayout>
      <div style={{maxWidth:1200,margin:"0 auto"}}>

        {/* HEADER */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:52,height:52,borderRadius:16,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 16px #6366f140"}}>
              <Bone style={{width:26,height:26,color:"#fff"}}/>
            </div>
            <div>
              <h1 style={{fontSize:22,fontWeight:800,margin:0,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Ortho / Fracture Panel</h1>
              <p style={{fontSize:12,color:"#6b7280",margin:0}}>Dr. S. S. Rathore · Balaji Ortho Care Center, Khinwara</p>
            </div>
          </div>
          <span style={{fontSize:11,padding:"6px 14px",borderRadius:99,background:"#f0fdf4",color:"#16a34a",fontWeight:700,border:"1px solid #bbf7d0"}}>🟢 Offline Ready</span>
        </div>

        {/* STATS */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:16}}>
          {[["🦴","Active","linear-gradient(135deg,#6366f1,#8b5cf6)",activeCases.length],["📅","Today FU","linear-gradient(135deg,#f59e0b,#d97706)",todayFuList.length],["⚠️","Missed","linear-gradient(135deg,#ef4444,#dc2626)",missedFuList.length],["✅","Completed","linear-gradient(135deg,#10b981,#059669)",completedCases.length],["📋","Total","linear-gradient(135deg,#0ea5e9,#0284c7)",(cases as any[]).length]].map(([ic,l,bg,v]: any)=>(
            <div key={l} style={{borderRadius:14,padding:"14px 12px",background:bg,display:"flex",alignItems:"center",gap:10,boxShadow:"0 2px 10px rgba(0,0,0,0.10)"}}>
              <span style={{fontSize:24}}>{ic}</span>
              <div><p style={{fontSize:10,color:"rgba(255,255,255,0.75)",margin:0}}>{l}</p><p style={{fontSize:24,fontWeight:800,color:"#fff",margin:0,lineHeight:1}}>{v}</p></div>
            </div>
          ))}
        </div>

        {/* ALERT BANNER */}
        {(todayFuList.length>0||missedFuList.length>0) && (
          <div style={{borderRadius:14,padding:"12px 16px",marginBottom:16,background:missedFuList.length>0?"linear-gradient(135deg,#fef2f2,#fff7ed)":"linear-gradient(135deg,#fffbeb,#fef9c3)",border:`1.5px solid ${missedFuList.length>0?"#fca5a5":"#fde68a"}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <BellRing style={{width:20,height:20,color:missedFuList.length>0?"#ef4444":"#d97706",flexShrink:0}}/>
              <div>
                {todayFuList.length>0 && <p style={{fontSize:13,fontWeight:700,color:"#92400e",margin:0}}>🔔 आज के {todayFuList.length} Follow-up हैं</p>}
                {missedFuList.length>0 && <p style={{fontSize:12,color:"#dc2626",fontWeight:600,margin:0}}>⚠ {missedFuList.length} Missed — तुरंत ध्यान दें</p>}
              </div>
            </div>
            <button disabled={todayBusy||!todayFuList.length} onClick={sendTodayReminders}
              style={{padding:"8px 16px",borderRadius:10,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,color:"#fff",background:"linear-gradient(135deg,#f59e0b,#d97706)",display:"flex",alignItems:"center",gap:6}}>
              <Send style={{width:14,height:14}}/> Reminder SMS भेजें
            </button>
          </div>
        )}

        {/* TABS */}
        <Tabs defaultValue="patients">
          <TabsList style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",height:"auto",gap:4,padding:4,background:"#f1f5f9",borderRadius:14,marginBottom:16}}>
            {[["patients","👥","Patients"],["entry","➕","New Entry"],["calendar","📅","Calendar"],["leave","✈️","Leave"],["completed","✅","Completed"],["analytics","📊","Analytics"]].map(([val,ic,lb])=>(
              <TabsTrigger key={val} value={val} style={{borderRadius:10,fontSize:11,fontWeight:600,padding:"8px 4px",gap:3}}>
                <span>{ic}</span><span className="hidden sm:inline">{lb}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* PATIENTS TAB */}
          <TabsContent value="patients">
            <div style={{position:"relative",marginBottom:12}}>
              <Search style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",width:16,height:16,color:"#9ca3af"}}/>
              <Input style={{paddingLeft:38}} placeholder="Patient naam ya body part..." value={activeSearch} onChange={e=>setActiveSearch(e.target.value)}/>
            </div>
            {filteredActive.length===0 ? (
              <div style={{textAlign:"center",padding:"60px 20px",color:"#9ca3af"}}>
                <div style={{fontSize:48,marginBottom:12}}>🦴</div>
                <p style={{fontSize:14,fontWeight:600}}>{activeSearch?"Koi match nahi":"Koi active plaster patient nahi"}</p>
              </div>
            ) : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
                {filteredActive.map((c: any)=>(
                  <ActiveCard key={c.id} c={c} onDetail={setDetailCase} onEdit={setEditCase} onRemove={setRemoveTarget} onFuDone={setFuDoneCase} onReschedule={setRescheduleCase} onFractureProfile={setFractureProfileCase}/>
                ))}
              </div>
            )}
          </TabsContent>

          {/* NEW ENTRY TAB */}
          <TabsContent value="entry">
            <div style={{display:"grid",gap:14}}>
              {/* Patient */}
              <div style={{borderRadius:16,border:"1.5px solid #e2e8f0",padding:18,background:"#fff"}}>
                <p style={{fontWeight:700,fontSize:14,marginBottom:12,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>👤</span>Patient Details</p>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
                  <div><Label className="text-xs">Mobile *</Label><Input value={mobile} onChange={e=>{setMobile(e.target.value.replace(/\D/g,"").slice(0,10));setSelPt(null);}} placeholder="10 अंक" className="h-9 mt-1"/></div>
                  <div><Label className="text-xs">Patient नाम *</Label><Input value={name} onChange={e=>{setName(e.target.value);setSelPt(null);}} className="h-9 mt-1"/></div>
                  <div><Label className="text-xs">उम्र</Label><Input type="number" value={age} onChange={e=>setAge(e.target.value)} className="h-9 mt-1"/></div>
                </div>
                {!selPt && (hits as any[]).length>0 && (
                  <div style={{marginTop:8,border:"1px solid #e2e8f0",borderRadius:10,overflow:"hidden",maxHeight:150,overflowY:"auto"}}>
                    {(hits as any[]).slice(0,5).map((p: any)=>(
                      <button key={p.id} onClick={()=>{setSelPt(p);setName(p.name);setMobile(p.mobile||"");setAge(String(p.age??""));}}
                        style={{width:"100%",textAlign:"left",padding:"8px 14px",background:"none",border:"none",cursor:"pointer",display:"flex",justifyContent:"space-between",fontSize:13,borderBottom:"1px solid #f1f5f9"}}>
                        <span style={{fontWeight:600}}>{p.name}</span><span style={{color:"#6b7280"}}>{p.mobile}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selPt && <div style={{marginTop:8,padding:"7px 12px",borderRadius:10,background:"#f0fdf4",fontSize:12,color:"#16a34a",fontWeight:600}}>✓ Existing patient — {selPt.name}</div>}
              </div>

              {/* Fracture + Body Map */}
              <div style={{borderRadius:16,border:"1.5px solid #e2e8f0",padding:18,background:"#fff"}}>
                <p style={{fontWeight:700,fontSize:14,marginBottom:12,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>🦴</span>Fracture Details</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 200px",gap:20,alignItems:"start"}}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
                    <div><Label className="text-xs">Fracture Type *</Label>
                      <Select value={fractureType} onValueChange={setFractureType}>
                        <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue placeholder="Select"/></SelectTrigger>
                        <SelectContent>{FRACTURE_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label className="text-xs">Cause</Label>
                      <Select value={cause} onValueChange={setCause}>
                        <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue placeholder="Optional"/></SelectTrigger>
                        <SelectContent>{CAUSES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label className="text-xs">Plaster Type</Label>
                      <Select value={plasterType} onValueChange={setPlasterType}>
                        <SelectTrigger className="h-9 mt-1 text-sm"><SelectValue/></SelectTrigger>
                        <SelectContent>{PLASTER_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label className="text-xs">Plaster Date</Label><Input type="date" className="h-9 mt-1 text-sm" value={plasterDate} onChange={e=>setPlasterDate(e.target.value)}/></div>
                    <div><Label className="text-xs">Follow-up Days</Label><Input type="number" className="h-9 mt-1 text-sm" value={followupDays} onChange={e=>setFollowupDays(e.target.value)} min={1}/></div>
                    <div><Label className="text-xs">Next Follow-up</Label>
                      <div style={{marginTop:4,padding:"8px 12px",borderRadius:8,background:"#f0fdf4",border:"1px solid #bbf7d0",fontSize:13,fontWeight:700,color:"#16a34a"}}>📅 {fmtDate(nextFU)}</div>
                    </div>
                    <div style={{gridColumn:"1/-1"}}><Label className="text-xs">Doctor Notes</Label><Textarea rows={2} className="mt-1 text-sm" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional..."/></div>
                  </div>
                  {/* Body Map */}
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                    <Label className="text-xs">👆 Body Map पर click करें</Label>
                    <BodyDiagram value={bodySelection} onSelect={setBodySelection}/>
                    {bodySelection?.body_part && (
                      <div style={{fontSize:12,fontWeight:700,color:"#6366f1",background:"#eef2ff",padding:"4px 14px",borderRadius:99}}>{bodySelection.side} {bodySelection.body_part}</div>
                    )}
                    {!bodySelection?.body_part && <p style={{fontSize:11,color:"#ef4444"}}>* Select zaroori hai</p>}
                  </div>
                </div>
              </div>

              <div style={{display:"flex",gap:10}}>
                <button onClick={handleSave} disabled={addCase.isPending} style={{padding:"11px 24px",borderRadius:12,border:"none",cursor:"pointer",fontSize:14,fontWeight:700,color:"#fff",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",gap:8,boxShadow:"0 4px 12px #6366f130"}}>
                  {addCase.isPending?<Loader2 style={{width:16,height:16,animation:"spin 1s linear infinite"}}/>:<Save style={{width:16,height:16}}/>}Save & SMS
                </button>
                <button onClick={resetForm} style={{padding:"11px 20px",borderRadius:12,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",fontSize:14,fontWeight:600,color:"#374151"}}>Reset</button>
              </div>
            </div>
          </TabsContent>

          {/* CALENDAR TAB */}
          <TabsContent value="calendar">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <p style={{fontWeight:700,fontSize:15,margin:0}}>📅 Next 7 Days Follow-ups</p>
              <button disabled={todayBusy||!todayFuList.length} onClick={sendTodayReminders}
                style={{padding:"8px 16px",borderRadius:10,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,color:"#fff",background:"linear-gradient(135deg,#f59e0b,#d97706)",display:"flex",alignItems:"center",gap:6}}>
                <Send style={{width:13,height:13}}/> आज Reminders ({todayFuList.length})
              </button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:8,marginBottom:16}}>
              {next7.map(d=>{
                const list = fuByDate[d]||[];
                const isLeave = leaves.includes(d); const isT=d===today;
                return (
                  <div key={d} style={{borderRadius:12,border:`2px solid ${isLeave?"#fca5a5":isT?"#6366f1":"#e2e8f0"}`,padding:"10px 6px",minHeight:90,background:isLeave?"#fef2f2":isT?"#eef2ff":"#fff"}}>
                    <div style={{fontSize:10,fontWeight:700,color:isT?"#6366f1":"#374151",marginBottom:5}}>{fmtShort(d)}</div>
                    {isLeave && <span style={{fontSize:9,background:"#ef4444",color:"#fff",borderRadius:99,padding:"1px 5px",fontWeight:700}}>Leave</span>}
                    {!isLeave && list.length===0 && <p style={{fontSize:10,color:"#d1d5db"}}>—</p>}
                    {list.map((f: any)=>(
                      <div key={f.id} style={{fontSize:10,background:"#f1f5f9",borderRadius:6,padding:"3px 5px",marginBottom:3}}>
                        <p style={{fontWeight:700,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(f.patients?.name||"").split(" ")[0]}</p>
                        <p style={{color:"#6b7280",margin:0}}>{f.body_part}</p>
                      </div>
                    ))}
                    {list.length>0 && <div style={{marginTop:3,fontSize:9,fontWeight:700,color:"#6366f1"}}>{list.length} FU</div>}
                  </div>
                );
              })}
            </div>

            {/* Missed FU */}
            {missedFuList.length>0 && (
              <div style={{borderRadius:16,border:"2px solid #fca5a5",background:"#fef2f2",padding:16}}>
                <p style={{fontWeight:700,fontSize:14,color:"#dc2626",marginBottom:10,display:"flex",alignItems:"center",gap:6}}><AlertTriangle style={{width:16,height:16}}/>Missed Follow-ups ({missedFuList.length})</p>
                <div style={{display:"grid",gap:8}}>
                  {missedFuList.map((f: any)=>(
                    <div key={f.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:12,background:"#fff",border:"1px solid #fecaca",gap:12}}>
                      <div>
                        <p style={{fontWeight:700,fontSize:14,margin:0}}>{f.patients?.name}</p>
                        <p style={{fontSize:11,color:"#6b7280",margin:0}}>{f.side} {f.body_part} · था: {fmtDate(f.next_followup_date)}</p>
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>setFuDoneCase(f)} style={{padding:"6px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff",background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",gap:3}}>
                          <CheckCircle2 style={{width:11,height:11}}/>FU Done
                        </button>
                        <button onClick={()=>setRescheduleCase(f)} style={{padding:"6px 9px",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#fffbeb",cursor:"pointer"}}>
                          <Calendar style={{width:12,height:12,color:"#f59e0b"}}/>
                        </button>
                        <button onClick={()=>setDetailCase(f)} style={{padding:"6px 9px",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer"}}>
                          <MessageCircle style={{width:12,height:12,color:"#6366f1"}}/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* LEAVE TAB */}
          <TabsContent value="leave">
            <div style={{display:"grid",gap:14}}>
              <div style={{borderRadius:16,border:"1.5px solid #e2e8f0",padding:18,background:"#fff"}}>
                <p style={{fontWeight:700,fontSize:14,marginBottom:12}}>✈️ Single Day Leave</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"flex-end",marginBottom:12}}>
                  <div style={{flex:1,minWidth:150}}><Label className="text-xs">Leave Date</Label><Input type="date" className="h-9 mt-1" value={leaveDate} onChange={e=>setLeaveDate(e.target.value)}/></div>
                  <button onClick={()=>{saveLeaves([...new Set([...leaves,leaveDate])]);toast.success("Leave mark ho gayi");}} style={{padding:"8px 16px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",fontSize:13,fontWeight:600,height:36}}>Mark Leave</button>
                  <button disabled={leaveBusy||!leaveAffected.length} onClick={async()=>{ setLeaveBusy(true); let sent=0; for(const f of leaveAffected){const r=await sendSMS(f.patients?.mobile||"",tplLeave(f.patients?.name||"",leaveDate),f.patients?.name||"","leave");if(r.ok)sent++;} saveLeaves([...new Set([...leaves,leaveDate])]); setLeaveBusy(false); toast.success(`✅ ${sent}/${leaveAffected.length} SMS`); }}
                    style={{padding:"8px 16px",borderRadius:10,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:"#fff",background:"linear-gradient(135deg,#f59e0b,#d97706)",display:"flex",alignItems:"center",gap:6,height:36}}>
                    <Send style={{width:14,height:14}}/> SMS ({leaveAffected.length})
                  </button>
                </div>
                {leaveAffected.length>0 && (
                  <div style={{border:"1px solid #e2e8f0",borderRadius:10,overflow:"hidden",marginBottom:10}}>
                    {leaveAffected.map((f: any)=>(
                      <div key={f.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 14px",borderBottom:"1px solid #f1f5f9"}}>
                        <div><p style={{fontWeight:600,fontSize:13,margin:0}}>{f.patients?.name}</p><p style={{fontSize:11,color:"#6b7280",margin:0}}>{f.patients?.mobile} · {f.body_part}</p></div>
                        <button onClick={()=>sendSMS(f.patients?.mobile||"",tplLeave(f.patients?.name||"",leaveDate),f.patients?.name||"","leave").then(r=>toast[r.ok?"success":"error"](r.ok?`✅ ${f.patients?.name}`:"❌ fail"))}
                          style={{padding:"5px 10px",borderRadius:8,border:"1px solid #e2e8f0",background:"#f8fafc",cursor:"pointer",fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:3}}>
                          <Send style={{width:11,height:11}}/>SMS
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {leaves.length>0 && (
                  <div>
                    <p style={{fontSize:11,color:"#6b7280",marginBottom:6}}>Marked Leaves:</p>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {leaves.sort().map(d=>(
                        <span key={d} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:99,background:"#fef2f2",border:"1px solid #fecaca",fontSize:12,fontWeight:600}}>
                          {fmtDate(d)}
                          <button onClick={()=>saveLeaves(leaves.filter(x=>x!==d))} style={{background:"none",border:"none",cursor:"pointer",color:"#ef4444",lineHeight:1,fontSize:14}}>×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div style={{borderRadius:16,border:"1.5px solid #e2e8f0",padding:18,background:"#fff"}}>
                <p style={{fontWeight:700,fontSize:14,marginBottom:12}}>📤 Long Leave / Bulk SMS</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <div><Label className="text-xs">From</Label><Input type="date" className="h-9 mt-1" value={longFrom} onChange={e=>setLongFrom(e.target.value)}/></div>
                  <div><Label className="text-xs">To</Label><Input type="date" className="h-9 mt-1" value={longTo} onChange={e=>setLongTo(e.target.value)}/></div>
                </div>
                <p style={{fontSize:13,marginBottom:10}}>Active Patients: <strong>{activeCases.length}</strong></p>
                <button disabled={longBusy||!activeCases.length} onClick={()=>setLongConfirm(true)} style={{padding:"10px 20px",borderRadius:12,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:"#fff",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",gap:8}}>
                  <Send style={{width:15,height:15}}/>Bulk SMS — सभी Active
                </button>
              </div>
            </div>
          </TabsContent>

          {/* COMPLETED TAB */}
          <TabsContent value="completed">
            <div style={{position:"relative",marginBottom:12}}>
              <Search style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",width:16,height:16,color:"#9ca3af"}}/>
              <Input style={{paddingLeft:38}} placeholder="Search completed..." value={compSearch} onChange={e=>setCompSearch(e.target.value)}/>
            </div>
            {filteredCompleted.length===0 ? (
              <div style={{textAlign:"center",padding:"60px 20px",color:"#9ca3af"}}>
                <div style={{fontSize:48,marginBottom:12}}>✅</div>
                <p style={{fontSize:14}}>Koi completed case nahi</p>
              </div>
            ) : (
              <div style={{display:"grid",gap:8}}>
                {filteredCompleted.map((c: any)=>(
                  <div key={c.id} style={{borderRadius:14,border:"1.5px solid #bbf7d0",background:"linear-gradient(135deg,#f0fdf4,#fff)",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <CheckCircle2 style={{width:18,height:18,color:"#fff"}}/>
                      </div>
                      <div>
                        <p style={{fontWeight:700,fontSize:14,margin:0}}>{c.patients?.name}</p>
                        <p style={{fontSize:11,color:"#6b7280",margin:0}}>{c.side} {c.body_part} · {c.plaster_type} · {fmtDate(c.plaster_date)}</p>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      <button onClick={()=>c.patient_id && navigate(`/patient-profile/${c.patient_id}`)} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:3,fontSize:11,color:"#0ea5e9",fontWeight:600}}>
                        <User style={{width:12,height:12}}/>Profile
                      </button>
                      <button onClick={()=>printRemovalSlip(c)} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid #e2e8f0",background:"#f0fdf4",cursor:"pointer",display:"flex",alignItems:"center",gap:3,fontSize:11,color:"#16a34a",fontWeight:600}}>
                        <Printer style={{width:12,height:12}}/>Slip
                      </button>
                      <span style={{fontSize:11,padding:"4px 12px",borderRadius:99,background:"#dcfce7",color:"#16a34a",fontWeight:700,alignSelf:"center"}}>Removed ✓</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ANALYTICS TAB */}
          <TabsContent value="analytics">
            <AnalyticsSection cases={cases as any[]} followups={followups as any[]}/>
          </TabsContent>
        </Tabs>
      </div>

      {/* DIALOGS */}
      <EditDialog open={!!editCase} onClose={()=>setEditCase(null)} caseData={editCase}/>
      <DetailDialog open={!!detailCase} onClose={()=>setDetailCase(null)} caseData={detailCase}/>
      <FuDoneDialog open={!!fuDoneCase} onClose={()=>setFuDoneCase(null)} caseData={fuDoneCase} onDone={handleFuDone}/>
      <FractureProfileDialog open={!!fractureProfileCase} onClose={()=>setFractureProfileCase(null)} caseData={fractureProfileCase}/>
      <RescheduleDialog open={!!rescheduleCase} onClose={()=>setRescheduleCase(null)} caseData={rescheduleCase}/>

      <AlertDialog open={!!removeTarget} onOpenChange={v=>!v&&setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Plaster Remove करें? 🏥</AlertDialogTitle>
            <AlertDialogDescription><strong>{removeTarget?.patients?.name}</strong> का <strong>{removeTarget?.body_part}</strong> plaster Removed mark होगा और SMS भेजा जाएगा।</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={removeBusy} style={{background:"linear-gradient(135deg,#10b981,#059669)"}}>
              {removeBusy?"Processing...":"✅ Remove & SMS"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={longConfirm} onOpenChange={setLongConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk SMS Confirm?</AlertDialogTitle>
            <AlertDialogDescription>{activeCases.length} active patients ko SMS jayega — Dr. Rathore {fmtDate(longFrom)} se {fmtDate(longTo)} tak unavailable hain.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={sendLongLeave} disabled={longBusy}>Send SMS</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
