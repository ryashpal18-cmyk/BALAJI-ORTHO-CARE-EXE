import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AiReport = {
  studyType?: string;
  bodyPartDetected?: string;
  urgency?: string;
  technique?: string;
  clinicalIndication?: string;
  findings?: {
    overall?: string;
    bones?: string;
    softTissues?: string;
    specificFindings?: string;
    extraFindings?: string;
  };
  impression?: string;
  differentialDiagnosis?: string;
  recommendations?: string;
  urgentFindings?: string;
};

const bodyParts = [
  "Chest/Lungs",
  "Shoulder",
  "Elbow",
  "Wrist/Hand",
  "Hip/Pelvis",
  "Knee",
  "Ankle/Foot",
  "Cervical Spine",
  "Dorsal Spine",
  "Lumbar Spine",
];

const projections = ["AP", "PA", "Lateral", "Oblique", "AP/Lateral", "Other"];

export default function AIXrayReport() {
  const [file, setFile] = useState<File | null>(null);
  const [b64, setB64] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("Male");
  const [body, setBody] = useState("Chest/Lungs");
  const [view, setView] = useState("AP");
  const [clinical, setClinical] = useState("");
  const [report, setReport] = useState<AiReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = (nextFile: File | null) => {
    setFile(nextFile);
    setReport(null);
    setError(null);
    if (!nextFile) {
      setB64(null);
      setMime(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      setB64(result.split(",")[1] || null);
      setMime(nextFile.type || "image/jpeg");
    };
    reader.onerror = () => setError("Image read nahi ho payi");
    reader.readAsDataURL(nextFile);
  };

  const analyze = async () => {
    if (!b64 || !mime) return;

    setLoading(true);

    setError(null);

    setReport(null);

    const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    if (!GEMINI_KEY) {
      setError("Gemini API key configured nahi hai. VITE_GEMINI_API_KEY env variable set karein.");
      setLoading(false);
      return;
    }

    const prompt = `You are a senior expert radiologist at Balaji Ortho Care Center. Analyze this X-ray image carefully.

Patient: ${name || "Not provided"}, Age: ${age || "?"} years, Gender: ${gender}

Body Region: ${body}, Projection: ${view}

Clinical History: ${clinical || "Not provided"}

Respond ONLY with valid JSON no markdown no extra text:

{"studyType":"Normal or Abnormal","bodyPartDetected":"string","urgency":"Routine or Urgent or Critical","technique":"string","clinicalIndication":"string","findings":{"overall":"string","bones":"string","softTissues":"string","specificFindings":"string","extraFindings":"string"},"impression":"string","differentialDiagnosis":"string or None","recommendations":"string","urgentFindings":"string or None"}`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,

        {
          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({
            contents: [
              { parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: prompt }] },
            ],

            generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error?.message || "Gemini API Error");

      let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      text = text.replace(/```json|```/g, "").trim();

      const s = text.indexOf("{"),
        e = text.lastIndexOf("}");

      if (s === -1 || e === -1) throw new Error("Invalid AI response");

      const reportData = JSON.parse(text.slice(s, e + 1));

      setReport(reportData);

      try {
        await supabase.from("xray_reports").insert({
          patient_name: name || "Unknown",

          patient_age: age || null,

          patient_gender: gender,

          body_part: body,

          view_projection: view,

          clinical_history: clinical || null,

          report_data: JSON.stringify(reportData),

          clinic_name: "Balaji Ortho Care Center",
        });
      } catch (e) {
        console.log("Save error:", e);
      }
    } catch (e) {
      setError("Error: " + (e instanceof Error ? e.message : "Report generate nahi hui"));
    } finally {
      setLoading(false);
    }
  };

  const printReport = () => {
    if (!report) return;
    window.print();
  };

  return (
    <section className="rounded-lg border border-primary/20 bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-bold text-foreground">
            🩻 AI X-Ray Report Generator
          </h2>
          <p className="text-sm text-muted-foreground">
            Balaji Ortho Care Center · Patient fee ₹50 · Doctor free
          </p>
        </div>
        <div className="rounded-md bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
          Gemini AI
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-sm font-medium">
          Patient Name
          <input
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Patient name"
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Age
          <input
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="Age"
            inputMode="numeric"
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Gender
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
          >
            <option>Male</option>
            <option>Female</option>
            <option>Other</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          Body Region
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          >
            {bodyParts.map((part) => (
              <option key={part}>{part}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          Projection
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={view}
            onChange={(e) => setView(e.target.value)}
          >
            {projections.map((projection) => (
              <option key={projection}>{projection}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          X-Ray Image
          <input
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            type="file"
            accept="image/*"
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
          />
        </label>
      </div>

      <label className="mt-3 block space-y-1 text-sm font-medium">
        Clinical History
        <textarea
          className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={clinical}
          onChange={(e) => setClinical(e.target.value)}
          placeholder="Pain, trauma history, swelling, follow-up etc."
        />
      </label>

      {file && <p className="mt-2 text-xs text-muted-foreground">Selected: {file.name}</p>}
      {error && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          onClick={analyze}
          disabled={!b64 || loading}
        >
          {loading ? "Analyzing..." : "Generate AI Report"}
        </button>
        {report && (
          <button
            className="rounded-md border px-4 py-2 text-sm font-semibold"
            onClick={printReport}
          >
            Print Report
          </button>
        )}
      </div>

      {report && (
        <article className="mt-5 space-y-4 rounded-lg border bg-background p-4 print:border-0 print:p-0">
          <header className="border-b pb-3">
            <h3 className="font-heading text-lg font-bold">Balaji Ortho Care Center</h3>
            <p className="text-xs text-muted-foreground">
              AI X-Ray Report · {new Date().toLocaleDateString("en-IN")}
            </p>
          </header>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <p>
              <b>Patient:</b> {name || "Unknown"}
            </p>
            <p>
              <b>Age/Gender:</b> {age || "—"} / {gender}
            </p>
            <p>
              <b>Study:</b> {report.studyType || "—"}
            </p>
            <p>
              <b>Urgency:</b> {report.urgency || "Routine"}
            </p>
            <p>
              <b>Body Part:</b> {report.bodyPartDetected || body}
            </p>
            <p>
              <b>Projection:</b> {view}
            </p>
          </div>
          <section>
            <h4 className="font-semibold text-primary">Technique</h4>
            <p className="text-sm text-muted-foreground">{report.technique || "—"}</p>
          </section>
          <section>
            <h4 className="font-semibold text-primary">Findings</h4>
            <div className="space-y-1 text-sm">
              <p>{report.findings?.overall || "—"}</p>
              {report.findings?.bones && (
                <p>
                  <b>Bones:</b> {report.findings.bones}
                </p>
              )}
              {report.findings?.softTissues && (
                <p>
                  <b>Soft Tissues:</b> {report.findings.softTissues}
                </p>
              )}
              {report.findings?.specificFindings && (
                <p>
                  <b>Specific Findings:</b> {report.findings.specificFindings}
                </p>
              )}
              {report.findings?.extraFindings && (
                <p>
                  <b>Extra Findings:</b> {report.findings.extraFindings}
                </p>
              )}
            </div>
          </section>
          <section className="rounded-md border-l-4 border-primary bg-primary/10 p-3">
            <h4 className="font-semibold text-primary">Impression</h4>
            <p className="text-sm font-medium">{report.impression || "—"}</p>
          </section>
          <section className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <h4 className="font-semibold text-primary">Differential Diagnosis</h4>
              <p>{report.differentialDiagnosis || "None"}</p>
            </div>
            <div>
              <h4 className="font-semibold text-primary">Recommendations</h4>
              <p>{report.recommendations || "—"}</p>
            </div>
          </section>
          {report.urgentFindings && report.urgentFindings !== "None" && (
            <section className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <b>Urgent Findings:</b> {report.urgentFindings}
            </section>
          )}
        </article>
      )}
    </section>
  );
}
