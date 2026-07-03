import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cacheGetAll } from "@/lib/offlineDb";
import { offlineUpdate } from "@/lib/offlineQuery";
import { cLog } from "@/lib/clientLogger";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft, User, Phone, Calendar, FileText,
  Pencil, Save, X, Pill, MapPin, Activity,
  Image, Receipt, ClipboardList,
} from "lucide-react";

type Tab = "bills" | "physio" | "xray" | "medicine";

export default function PatientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [patient,  setPatient]  = useState<any>(null);
  const [bills,    setBills]    = useState<any[]>([]);
  const [physio,   setPhysio]   = useState<any[]>([]);
  const [xrays,    setXrays]    = useState<any[]>([]);
  const [medicines,setMedicines]= useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [activeTab,setActiveTab]= useState<Tab>("bills");
  const [editing,  setEditing]  = useState(false);
  const [saving,   setSaving]   = useState(false);

  const [editName,    setEditName]    = useState("");
  const [editMobile,  setEditMobile]  = useState("");
  const [editAge,     setEditAge]     = useState("");
  const [editGender,  setEditGender]  = useState("");
  const [editAddress, setEditAddress] = useState("");

  // ── Data fetch — online + offline safe ─────────────────────────────────
  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const online = navigator.onLine;
      // 🚨 FIX: Agar patient abhi tak Supabase pe sync nahi hua (id "local_"
      // se shuru hoti hai), to online query karne ka koi fayda nahi — "local_"
      // ek valid UUID nahi hai, Supabase error dega aur patient details
      // khaali dikhengi. Aise records ke liye seedha cache se hi dhoondo.
      const isLocalOnly = id.startsWith("local_");

      if (online && !isLocalOnly) {
        try {
          const [pRes, bRes, physioRes, xrayRes, medRes] = await Promise.all([
            supabase.from("patients").select("*").eq("id", id).single(),
            supabase.from("billing").select("*").eq("patient_id", id).order("created_at", { ascending: false }),
            supabase.from("physiotherapy_sessions").select("*").eq("patient_id", id).order("created_at", { ascending: false }),
            supabase.from("xray_reports").select("*").eq("patient_id", id).order("created_at", { ascending: false }),
            supabase.from("patient_medicines").select("*, medicines(name, unit)").eq("patient_id", id).order("created_at", { ascending: false }),
          ]);
          setPatient(pRes.data);
          setBills(bRes.data    || []);
          setPhysio(physioRes.data  || []);
          setXrays(xrayRes.data     || []);
          setMedicines(medRes.data  || []);
          setLoading(false);
          return;
        } catch (err) {
          cLog.warn("PatientProfile", "Online fetch fail — cache try karega", err);
        }
      }

      // Offline fallback — cache se lo
      const [cachedPatients, cachedBills, cachedPhysio, cachedXrays, cachedMed] = await Promise.all([
        cacheGetAll("patients"),
        cacheGetAll("billing"),
        cacheGetAll("physiotherapy_sessions"),
        cacheGetAll("xray_reports"),
        cacheGetAll("patient_medicines"),
      ]);

      const pat = cachedPatients.find((p: any) => p.id === id) || null;
      setPatient(pat);
      setBills(cachedBills.filter((b: any) => b.patient_id === id).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setPhysio(cachedPhysio.filter((s: any) => s.patient_id === id).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setXrays(cachedXrays.filter((r: any) => r.patient_id === id));
      setMedicines(cachedMed.filter((m: any) => m.patient_id === id));
      cLog.info("PatientProfile", `Offline cache se data liya — patient: ${id}`);
    } catch (err) {
      cLog.error("PatientProfile", "Data fetch poora fail", err);
      toast({ title: "Error", description: "Data load nahi hua", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const startEdit = () => {
    setEditName(patient?.name    || "");
    setEditMobile(patient?.mobile || "");
    setEditAge(patient?.age ? String(patient.age) : "");
    setEditGender(patient?.gender  || "");
    setEditAddress(patient?.address || "");
    setEditing(true);
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      toast({ title: "Name required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      await offlineUpdate("patients", id!, {
        name:    editName.trim(),
        mobile:  editMobile.trim()  || null,
        age:     editAge ? parseInt(editAge) : null,
        gender:  editGender  || null,
        address: editAddress.trim() || null,
      });
      toast({ title: "✅ Patient update ho gaya!" });
      setEditing(false);
      fetchData();
    } catch (err) {
      cLog.error("PatientProfile", "Patient update fail", err);
      toast({ title: "Error", description: "Update fail hua", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const totalBilled = bills.reduce((s, b) => s + Number(b.amount       || 0), 0);
  const totalPaid   = bills.reduce((s, b) => s + Number(b.amount_paid  || 0), 0);
  const totalDue    = totalBilled - totalPaid;

  if (loading) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Loading...</div></DashboardLayout>;
  if (!patient) return <DashboardLayout><div className="p-8 text-center">Patient not found</div></DashboardLayout>;

  const tabs: { key: Tab; label: string; icon: any; count: number }[] = [
    { key: "bills",    label: "Bills",        icon: Receipt,      count: bills.length },
    { key: "physio",   label: "Physiotherapy",icon: Activity,     count: physio.length },
    { key: "xray",     label: "X-Ray",        icon: Image,        count: xrays.length },
    { key: "medicine", label: "Medicines",    icon: ClipboardList,count: medicines.length },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6 p-4">

        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        {/* ── Patient Info Card ── */}
        <div className="border rounded-xl p-5 bg-card shadow-sm">
          {!editing ? (
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold">{patient.name}</h1>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                  {patient.mobile   && <span className="flex items-center gap-1"><Phone   className="h-3.5 w-3.5" />{patient.mobile}</span>}
                  {patient.age      && <span className="flex items-center gap-1"><User    className="h-3.5 w-3.5" />{patient.age} yrs</span>}
                  {patient.gender   && <span className="capitalize">{patient.gender}</span>}
                  {patient.address  && <span className="flex items-center gap-1"><MapPin  className="h-3.5 w-3.5" />{patient.address}</span>}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Since {new Date(patient.created_at).toLocaleDateString("en-IN")}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                <Button size="sm" variant="outline" onClick={startEdit} className="gap-1">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" onClick={() => navigate(`/patient-medicine?patientId=${id}`)} className="gap-1">
                  <Pill className="h-3.5 w-3.5" /> Medicine
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg flex items-center gap-2">
                  <Pencil className="h-4 w-4 text-primary" /> Patient Edit Karo
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Patient Name <span className="text-destructive">*</span></Label>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Full name" />
                </div>
                <div className="space-y-1">
                  <Label>Mobile Number</Label>
                  <Input value={editMobile} onChange={e => setEditMobile(e.target.value)} placeholder="10 digit mobile" maxLength={10} />
                </div>
                <div className="space-y-1">
                  <Label>Age</Label>
                  <Input type="number" value={editAge} onChange={e => setEditAge(e.target.value)} placeholder="Age in years" min={0} max={120} />
                </div>
                <div className="space-y-1">
                  <Label>Gender</Label>
                  <select value={editGender} onChange={e => setEditGender(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Address</Label>
                  <Input value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="Full address" />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />{saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border rounded-xl p-4 text-center bg-card">
            <p className="text-xs text-muted-foreground mb-1">Total Bills</p>
            <p className="text-2xl font-bold">{bills.length}</p>
          </div>
          <div className="border rounded-xl p-4 text-center bg-card">
            <p className="text-xs text-muted-foreground mb-1">Total Billed</p>
            <p className="text-xl font-bold">₹{totalBilled.toLocaleString("en-IN")}</p>
          </div>
          <div className="border rounded-xl p-4 text-center bg-card">
            <p className="text-xs text-muted-foreground mb-1">Total Paid</p>
            <p className="text-xl font-bold text-green-600">₹{totalPaid.toLocaleString("en-IN")}</p>
          </div>
          <div className="border rounded-xl p-4 text-center bg-card">
            <p className="text-xs text-muted-foreground mb-1">Due Amount</p>
            <p className={`text-xl font-bold ${totalDue > 0 ? "text-destructive" : "text-green-600"}`}>
              ₹{totalDue.toLocaleString("en-IN")}
            </p>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="border rounded-xl overflow-hidden bg-card">
          <div className="flex border-b overflow-x-auto">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === t.key
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
                <Badge variant="secondary" className="text-xs ml-1">{t.count}</Badge>
              </button>
            ))}
          </div>

          {/* ── Bills Tab ── */}
          {activeTab === "bills" && (
            bills.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Koi bill nahi hai</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="p-3 text-left">Invoice</th>
                      <th className="p-3 text-left">Services</th>
                      <th className="p-3 text-left">Date</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-right">Paid</th>
                      <th className="p-3 text-right">Due</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {bills.map(b => {
                      const paid = Number(b.amount_paid || 0);
                      const amt  = Number(b.amount || 0);
                      const due  = Math.max(amt - paid, 0);
                      const services = String(b.service || "").split("|").map((s: string) => s.split(":")[0].trim()).filter(Boolean).join(", ");
                      return (
                        <tr key={b.id} className="hover:bg-muted/20">
                          <td className="p-3 font-mono text-xs">INV-{b.id.slice(0,8).toUpperCase()}</td>
                          <td className="p-3 max-w-[160px] truncate text-xs text-muted-foreground">{services}</td>
                          <td className="p-3 text-xs">{new Date(b.created_at).toLocaleDateString("en-IN")}</td>
                          <td className="p-3 text-right font-medium">₹{amt.toLocaleString("en-IN")}</td>
                          <td className="p-3 text-right text-green-600">₹{paid.toLocaleString("en-IN")}</td>
                          <td className="p-3 text-right text-destructive">₹{due.toLocaleString("en-IN")}</td>
                          <td className="p-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              b.status === "Paid"    ? "bg-green-100 text-green-700" :
                              b.status === "Partial" ? "bg-yellow-100 text-yellow-700" :
                                                       "bg-red-100 text-red-700"
                            }`}>{b.status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/20 font-semibold border-t text-sm">
                    <tr>
                      <td colSpan={3} className="p-3">Total</td>
                      <td className="p-3 text-right">₹{totalBilled.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-right text-green-600">₹{totalPaid.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-right text-destructive">₹{totalDue.toLocaleString("en-IN")}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          )}

          {/* ── Physiotherapy Tab ── */}
          {activeTab === "physio" && (
            physio.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Koi physiotherapy session nahi hai</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="p-3 text-left">Date</th>
                      <th className="p-3 text-left">Treatment</th>
                      <th className="p-3 text-left">Notes</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {physio.map(s => (
                      <tr key={s.id} className="hover:bg-muted/20">
                        <td className="p-3 text-xs">{new Date(s.created_at).toLocaleDateString("en-IN")}</td>
                        <td className="p-3 text-sm">{s.treatment_type || s.exercises || "—"}</td>
                        <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">{s.notes || "—"}</td>
                        <td className="p-3 text-center">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                            {s.status || "Done"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── X-Ray Tab ── */}
          {activeTab === "xray" && (
            xrays.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                Koi X-Ray report nahi hai
                <div className="mt-3">
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate("/reports")}>
                    <Image className="h-4 w-4" /> X-Ray Upload Karo
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
                {xrays.map(r => (
                  <div key={r.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Image className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">{r.report_type || "X-Ray"}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(r.created_at || r.uploaded_at).toLocaleDateString("en-IN")}
                      </span>
                    </div>
                    {r.file_url && (
                      <div className="flex flex-wrap gap-3">
                        <a href={r.file_url} target="_blank" rel="noreferrer"
                          className="text-xs text-primary underline">
                          View Report
                        </a>
                        <button
                          type="button"
                          onClick={() => navigate("/reports", {
                            state: {
                              openXrayViewer: true,
                              xrayImage: r.file_url,
                              xrayName: r.report_type || "X-Ray",
                              patientName: patient.name,
                            },
                          })}
                          className="text-xs text-cyan-600 underline"
                        >
                          🩻 X-Ray Viewer me kholo
                        </button>
                      </div>
                    )}
                    {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
                  </div>
                ))}
              </div>
            )
          )}

          {/* ── Medicine Tab ── */}
          {activeTab === "medicine" && (
            medicines.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Koi medicine record nahi hai</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="p-3 text-left">Medicine</th>
                      <th className="p-3 text-left">Dosage</th>
                      <th className="p-3 text-left">Duration</th>
                      <th className="p-3 text-left">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {medicines.map(m => (
                      <tr key={m.id} className="hover:bg-muted/20">
                        <td className="p-3 font-medium">{m.medicines?.name || m.medicine_name || "—"}</td>
                        <td className="p-3 text-sm">{m.dosage || "—"}</td>
                        <td className="p-3 text-sm">{m.duration || "—"}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {new Date(m.created_at).toLocaleDateString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
