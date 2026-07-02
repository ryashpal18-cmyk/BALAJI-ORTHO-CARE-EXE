import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useFractureXrays, uploadFractureXray, useFractureCases } from "@/hooks/useOrtho";
import { useAddPhysioSession } from "@/hooks/useDatabase";
import { cacheGetAll } from "@/lib/offlineDb";
import { isOnline } from "@/lib/offlineSync";
import {
  ArrowLeft, Activity, Camera, Upload, TrendingDown, Bone, Calendar,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface FractureCase {
  id: string;
  patient_id: string;
  body_part: string | null;
  side: string | null;
  fracture_type: string | null;
  plaster_status: string;
  plaster_date: string | null;
  next_followup_date: string | null;
  patients?: { name: string; mobile: string | null } | null;
}

interface PhysioSession {
  id: string;
  pain_scale: number | null;
  exercise_plan: string | null;
  progress_notes: string | null;
  session_number: number;
  total_sessions: number;
  created_at: string;
}

export default function RecoveryTracker() {
  const { caseId } = useParams();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<PhysioSession[]>([]);
  const [loading, setLoading] = useState(true);

  const [painScale, setPainScale] = useState("5");
  const [exercisePlan, setExercisePlan] = useState("");
  const [notes, setNotes] = useState("");
  const [logging, setLogging] = useState(false);

  const [uploading, setUploading] = useState(false);
  const { data: xrays, refetch: refetchXrays } = useFractureXrays(caseId);
  const addPhysioSession = useAddPhysioSession();

  const { data: allCases = [], isLoading: casesLoading } = useFractureCases();
  const [directCase, setDirectCase] = useState<FractureCase | null>(null);
  const [directTried, setDirectTried] = useState(false);

  const cachedCase = allCases.find((c: any) => c.id === caseId) as FractureCase | undefined;
  const fxCase = cachedCase || directCase;

  const fetchData = async () => {
    if (!caseId) return;
    setLoading(true);

    // Pehle offline-safe cached list me dhoondo (Ortho list isi se data leti hai,
    // isliye yahan bhi wahi cache use karne se "Case not found" galti se nahi aayega)
    if (!cachedCase && !directTried) {
      // Cache me nahi mila — direct Supabase se try karo (e.g. bilkul naya case
      // jo abhi cache me sync nahi hua, ya internet slow tha)
      try {
        const { data: c, error } = await supabase
          .from("fracture_cases" as any)
          .select("*, patients(name, mobile)")
          .eq("id", caseId)
          .maybeSingle();
        if (!error && c) setDirectCase(c as any);
      } catch {
        /* offline ya network error — neeche cache/loading state se handle hoga */
      } finally {
        setDirectTried(true);
      }
    }


    const patientId = cachedCase?.patient_id || directCase?.patient_id;
    if (patientId) {
      // Offline-safe: pehle online try karo, fail/offline ho to cache se fallback lo
      const online = await isOnline();
      if (online) {
        try {
          const { data: s, error } = await supabase
            .from("physiotherapy_sessions")
            .select("*")
            .eq("fracture_case_id", caseId)
            .order("created_at", { ascending: true });
          if (error) throw error;
          setSessions((s as any) || []);
          setLoading(false);
          return;
        } catch {
          /* offline ya network error — neeche cache se fallback */
        }
      }
      const cachedSessions = await cacheGetAll("physiotherapy_sessions");
      const filtered = (cachedSessions as any[])
        .filter((sess) => sess.fracture_case_id === caseId)
        .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
      setSessions(filtered as any);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [caseId, cachedCase?.id]);

  const handleLogProgress = async () => {
    if (!fxCase) return;
    setLogging(true);
    const nextSessionNo = sessions.length + 1;
    try {
      // ✅ offline-safe insert — net na ho to IndexedDB queue me save hoga
      // aur internet wapas aate hi apne aap sync ho jayega
      await addPhysioSession.mutateAsync({
        patient_id: fxCase.patient_id,
        fracture_case_id: fxCase.id,
        pain_scale: parseInt(painScale) || 0,
        exercise_plan: exercisePlan.trim() || "Recovery exercises",
        progress_notes: notes.trim() || null,
        session_number: nextSessionNo,
        total_sessions: Math.max(nextSessionNo, 10),
      });
      const online = await isOnline();
      toast({ title: online ? "✅ Progress log ho gaya!" : "📥 Offline save ho gaya — net aane par sync hoga" });
      setExercisePlan(""); setNotes(""); setPainScale("5");
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Progress log fail ho gaya", variant: "destructive" });
    }
    setLogging(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fxCase) return;
    setUploading(true);
    const result = await uploadFractureXray(fxCase.id, fxCase.patient_id, file);
    setUploading(false);
    e.target.value = "";
    if (result.ok) {
      toast({
        title: result.queued ? "📥 Queued — internet aane par upload hoga" : "✅ Photo upload ho gayi",
      });
      refetchXrays();
    }
  };

  const chartData = sessions.map((s, i) => ({
    session: `S${i + 1}`,
    pain: s.pain_scale ?? 0,
    date: new Date(s.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
  }));

  const latestPain = sessions.length ? sessions[sessions.length - 1].pain_scale ?? 0 : null;
  const firstPain = sessions.length ? sessions[0].pain_scale ?? 0 : null;
  const improvement = latestPain !== null && firstPain !== null ? firstPain - latestPain : null;

  if (loading || casesLoading || (!fxCase && !directTried)) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Loading...</div></DashboardLayout>;
  if (!fxCase) return <DashboardLayout><div className="p-8 text-center">Case not found</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6 p-4">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        {/* Case header */}
        <div className="border rounded-xl p-5 bg-card shadow-sm flex items-start gap-4">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Bone className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">{fxCase.patients?.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {fxCase.side} {fxCase.body_part} · {fxCase.fracture_type || "Fracture"}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="outline">{fxCase.plaster_status}</Badge>
              {fxCase.next_followup_date && (
                <Badge variant="outline" className="gap-1">
                  <Calendar className="h-3 w-3" /> Next: {new Date(fxCase.next_followup_date).toLocaleDateString("en-IN")}
                </Badge>
              )}
            </div>
          </div>
          {improvement !== null && (
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground">Pain Improvement</p>
              <p className={`text-lg font-bold flex items-center gap-1 justify-end ${improvement > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                <TrendingDown className="h-4 w-4" /> {improvement > 0 ? `-${improvement}` : improvement}
              </p>
            </div>
          )}
        </div>

        {/* Pain trend chart */}
        <div className="border rounded-xl bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Recovery Progress — Pain Trend</h2>
          </div>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Abhi koi session log nahi hua — neeche se pehla progress log karein
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 88%)" />
                <XAxis dataKey="session" fontSize={12} />
                <YAxis fontSize={12} domain={[0, 10]} />
                <Tooltip
                  formatter={(v: number) => [`${v}/10`, "Pain"]}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.date || label}
                />
                <Line type="monotone" dataKey="pain" stroke="hsl(0, 72%, 51%)" strokeWidth={2} dot={{ fill: "hsl(0, 72%, 51%)" }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Quick log progress */}
        <div className="border rounded-xl bg-card p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" /> Aaj ka Progress Log Karein
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Pain Scale (0-10)</Label>
              <Input type="number" min={0} max={10} value={painScale} onChange={(e) => setPainScale(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Exercise / Activity</Label>
              <Input
                placeholder="e.g. Wrist ROM exercises"
                value={exercisePlan}
                onChange={(e) => setExercisePlan(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Recovery observation..." />
          </div>
          <Button onClick={handleLogProgress} disabled={logging} className="w-full">
            {logging ? "Saving..." : "Log Progress"}
          </Button>
        </div>

        {/* Photo timeline */}
        <div className="border rounded-xl bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" /> Photo Timeline
            </h2>
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
              <span className="text-xs px-3 py-1.5 rounded-lg border bg-muted/40 hover:bg-muted flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading..." : "Add Photo"}
              </span>
            </label>
          </div>
          {!xrays || xrays.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Koi photo nahi — recovery ki progress dikhane ke liye photo add karein
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {xrays.map((x: any) => (
                <div key={x.id} className="rounded-lg overflow-hidden border">
                  <img src={x.file_url} alt="Recovery" className="w-full h-32 object-cover" />
                  <p className="text-[10px] text-center py-1 bg-muted/40 text-muted-foreground">
                    {new Date(x.image_date).toLocaleDateString("en-IN")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
