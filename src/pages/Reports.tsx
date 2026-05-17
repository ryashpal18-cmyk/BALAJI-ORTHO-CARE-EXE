import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, FileText, Image, Download } from "lucide-react";
import { useXrayReports, useAddXrayReport, usePatients } from "@/hooks/useDatabase";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import AIXrayReport from "@/components/AIXrayReport";

const typeIcon: Record<string, string> = {
  "X-Ray": "bg-primary/10 text-primary",
  "MRI": "bg-secondary/10 text-secondary",
  "Lab Report": "bg-success/10 text-success",
  "Prescription": "bg-warning/10 text-warning",
};

function printSavedAiReport(savedReport: any) {
  const data = JSON.parse(savedReport.report_data || "{}");
  const date = new Date(savedReport.created_at || savedReport.uploaded_at).toLocaleDateString("en-IN");
  const win = window.open("", "_blank", "width=800,height=1000");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>AI X-Ray Report</title><style>body{font-family:Arial,sans-serif;color:#0f172a;padding:24px}.header{border-bottom:3px solid #0891b2;padding-bottom:12px;margin-bottom:18px}.clinic{font-size:24px;font-weight:800;color:#1e3a5f}.muted{color:#64748b;font-size:13px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:16px 0}.box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px}.section{margin:16px 0}.section h3{color:#0891b2;margin-bottom:6px}.impression{border-left:5px solid #0891b2;background:#f0f9ff;padding:12px;border-radius:8px}pre{white-space:pre-wrap;font-family:inherit}@media print{button{display:none}}</style></head><body><div class="header"><div class="clinic">Balaji Ortho Care Center</div><div class="muted">Dr. S. S. Rathore (DMRT | BPT) · Opp Govt Hospital, Bay Pass Road, Khinwara, Raj. – 306502</div><div class="muted">Phone: +91 8005707783</div></div><h2>🩻 AI X-Ray Report</h2><div class="grid"><div class="box"><span class="muted">Patient</span><br/><b>${savedReport.patient_name || "Unknown"}</b></div><div class="box"><span class="muted">Date</span><br/><b>${date}</b></div><div class="box"><span class="muted">Body Part</span><br/><b>${savedReport.body_part || data.bodyPartDetected || "—"}</b></div><div class="box"><span class="muted">View</span><br/><b>${savedReport.view_projection || "—"}</b></div><div class="box"><span class="muted">Study Type</span><br/><b>${data.studyType || "—"}</b></div><div class="box"><span class="muted">Urgency</span><br/><b>${data.urgency || "Routine"}</b></div></div><div class="section"><h3>Findings</h3><pre>${data.findings?.overall || "—"}</pre>${data.findings?.bones ? `<p><b>Bones:</b> ${data.findings.bones}</p>` : ""}${data.findings?.softTissues ? `<p><b>Soft Tissues:</b> ${data.findings.softTissues}</p>` : ""}${data.findings?.specificFindings ? `<p><b>Specific:</b> ${data.findings.specificFindings}</p>` : ""}</div><div class="section impression"><h3>Impression</h3><pre>${data.impression || "—"}</pre></div>${data.recommendations ? `<div class="section"><h3>Recommendations</h3><p>${data.recommendations}</p></div>` : ""}<p class="muted">AI report sirf reference ke liye hai.</p><button onclick="window.print()">Print</button><script>window.onload=function(){window.print()}</script></body></html>`);
  win.document.close();
}

export default function Reports() {
  const { data: reports, isLoading } = useXrayReports();
  const { data: patients } = usePatients();
  const addReport = useAddXrayReport();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ patient_id: "", report_type: "X-Ray" });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedSavedReport, setSelectedSavedReport] = useState<any>(null);
  const savedAiReports = reports?.filter((r: any) => r.report_data) || [];

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_id || !file) {
      toast({ title: "Error", description: "Select patient and file", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const filePath = `${form.patient_id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("xray-files").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("xray-files").getPublicUrl(filePath);

      await addReport.mutateAsync({
        patient_id: form.patient_id,
        file_url: urlData.publicUrl,
        report_type: form.report_type,
      });
      toast({ title: "Success", description: "Report uploaded!" });
      setForm({ patient_id: "", report_type: "X-Ray" });
      setFile(null);
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <AIXrayReport />

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">📂 Saved Reports</CardTitle>
          </CardHeader>
          <CardContent>
            {!savedAiReports.length ? (
              <p className="text-muted-foreground text-sm text-center py-6">No AI reports saved yet</p>
            ) : (
              <div className="space-y-3">
                {savedAiReports.map((r: any) => (
                  <div key={r.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1.5fr_1fr_1fr_auto] gap-3 items-center p-3 rounded-lg border hover:bg-muted/30">
                    <div><p className="text-sm font-medium">{r.patient_name || (r.patients as any)?.name || "Unknown"}</p><p className="text-xs text-muted-foreground sm:hidden">{r.body_part || "—"}</p></div>
                    <div className="hidden sm:block text-xs text-muted-foreground">{new Date(r.created_at || r.uploaded_at).toLocaleDateString("en-IN")}</div>
                    <div className="hidden sm:block text-xs">{r.body_part || "—"} · {r.view_projection || "—"}</div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedSavedReport(r)}>View</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!selectedSavedReport} onOpenChange={(v) => !v && setSelectedSavedReport(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
            <DialogHeader><DialogTitle className="font-heading">Saved AI Report</DialogTitle></DialogHeader>
            {selectedSavedReport && (() => { const data = JSON.parse(selectedSavedReport.report_data || "{}"); return <div className="space-y-4 text-sm"><div className="rounded-lg border-b-4 border-primary p-3 bg-muted/20"><h2 className="font-heading font-bold text-lg">Balaji Ortho Care Center</h2><p className="text-xs text-muted-foreground">Dr. S. S. Rathore (DMRT | BPT) · Opp Govt Hospital, Bay Pass Road, Khinwara</p></div><div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3"><div><span className="text-muted-foreground">Name</span><b className="block">{selectedSavedReport.patient_name || "Unknown"}</b></div><div><span className="text-muted-foreground">Body Part</span><b className="block">{selectedSavedReport.body_part || data.bodyPartDetected || "—"}</b></div><div><span className="text-muted-foreground">View</span><b className="block">{selectedSavedReport.view_projection || "—"}</b></div><div><span className="text-muted-foreground">Date</span><b className="block">{new Date(selectedSavedReport.created_at || selectedSavedReport.uploaded_at).toLocaleDateString("en-IN")}</b></div></div><section><h3 className="font-bold text-primary">Findings</h3><p className="whitespace-pre-line">{data.findings?.overall}</p>{[["Bones", data.findings?.bones], ["Soft Tissues", data.findings?.softTissues], ["Specific", data.findings?.specificFindings], ["Extra", data.findings?.extraFindings]].filter(([, v]) => v).map(([k, v]) => <p key={k}><b>{k}:</b> {v}</p>)}</section><section className="rounded-lg bg-primary/10 border-l-4 border-primary p-3"><h3 className="font-bold text-primary">Impression</h3><p className="whitespace-pre-line font-medium">{data.impression}</p></section>{data.recommendations && <section><h3 className="font-bold text-primary">Recommendations</h3><p>{data.recommendations}</p></section>}<Button className="w-full" onClick={() => printSavedAiReport(selectedSavedReport)}>🖨️ Print Report</Button></div>; })()}
          </DialogContent>
        </Dialog>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="module-header">Reports & X-Ray</h1>
            <p className="text-sm text-muted-foreground">Upload and manage medical reports</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Upload className="h-4 w-4" />Upload Report</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-heading">Upload Report</DialogTitle></DialogHeader>
              <form onSubmit={handleUpload} className="space-y-4">
                <div className="space-y-2">
                  <Label>Patient</Label>
                  <Select value={form.patient_id} onValueChange={v => setForm(p => ({ ...p, patient_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                    <SelectContent>
                      {patients?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Report Type</Label>
                  <Select value={form.report_type} onValueChange={v => setForm(p => ({ ...p, report_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="X-Ray">X-Ray</SelectItem>
                      <SelectItem value="MRI">MRI</SelectItem>
                      <SelectItem value="Lab Report">Lab Report</SelectItem>
                      <SelectItem value="Prescription">Prescription</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>File</Label>
                  <Input type="file" accept="image/*,.pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
                </div>
                <Button type="submit" className="w-full" disabled={uploading}>
                  {uploading ? "Uploading..." : "Upload"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">Uploaded Reports</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : !reports?.length ? (
              <p className="text-muted-foreground text-sm text-center py-8">No reports uploaded yet</p>
            ) : (
              <div className="space-y-3">
                {reports.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${typeIcon[r.report_type || ""] || "bg-muted"}`}>
                        {r.report_type === "X-Ray" ? <Image className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{(r.patients as any)?.name}</p>
                        <p className="text-xs text-muted-foreground">{new Date(r.uploaded_at).toLocaleDateString("en-IN")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">{r.report_type}</Badge>
                      {r.file_url && (
                        <a href={r.file_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-8 w-8"><Download className="h-4 w-4" /></Button>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
