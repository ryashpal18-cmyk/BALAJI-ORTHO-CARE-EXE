import { useState, useRef, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Annotation {
  id: string;
  type: "draw" | "arrow" | "text";
  color: string;
  points?: { x: number; y: number }[];
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  text?: string;
  position?: { x: number; y: number };
}

interface XRayImage {
  id: string;
  name: string;
  src: string; // base64 or blob URL
  date?: string;
  patientName?: string;
}

interface OrthancStudy {
  ID: string;
  PatientMainDicomTags?: { PatientName?: string; PatientID?: string };
  MainDicomTags?: { StudyDate?: string; StudyDescription?: string };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ORTHANC_URL = "http://localhost:8042";

// ─── Helper ───────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);

interface XRayViewerProps {
  initialImage?: { src: string; name: string; patientName?: string } | null;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function XRayViewer({ initialImage }: XRayViewerProps = {}) {
  // Images
  const [images, setImages] = useState<XRayImage[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIndex, setCompareIndex] = useState<number | null>(null);

  // Transform state (per image slot)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotate, setRotate] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [invert, setInvert] = useState(false);

  // Compare slot transforms
  const [zoom2, setZoom2] = useState(1);
  const [pan2, setPan2] = useState({ x: 0, y: 0 });
  const [brightness2, setBrightness2] = useState(100);
  const [contrast2, setContrast2] = useState(100);

  // Annotation
  const [tool, setTool] = useState<"none" | "draw" | "arrow" | "text">("none");
  const [annotColor, setAnnotColor] = useState("#ff4444");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [arrowStart, setArrowStart] = useState<{ x: number; y: number } | null>(null);

  // Orthanc
  const [orthancTab, setOrthancTab] = useState(false);
  const [orthancStudies, setOrthancStudies] = useState<OrthancStudy[]>([]);
  const [orthancLoading, setOrthancLoading] = useState(false);
  const [orthancError, setOrthancError] = useState("");

  // Report
  const [reportOpen, setReportOpen] = useState(false);
  const [doctorName, setDoctorName] = useState("Dr. S. S. Rathore");
  const [reportNotes, setReportNotes] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");

  // UI
  const [activePanel, setActivePanel] = useState<"tools" | "orthanc" | "report" | null>("tools");
  const [notification, setNotification] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvas2Ref = useRef<HTMLCanvasElement>(null);
  const annotRef = useRef<HTMLCanvasElement>(null);
  const isPanning = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Notify helper
  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(""), 3000);
  };

  // ── Incoming image from Patient Profile (e.g. "X-Ray Viewer me kholo")
  useEffect(() => {
    if (!initialImage?.src) return;
    const newImg: XRayImage = {
      id: uid(),
      name: initialImage.name || "X-Ray",
      src: initialImage.src,
      date: new Date().toLocaleDateString("en-IN"),
      patientName: initialImage.patientName,
    };
    setImages((prev) => [newImg, ...prev]);
    setActiveIndex(0);
    if (initialImage.patientName) setPatientName(initialImage.patientName);
    notify(`📁 ${initialImage.name} load ho gaya`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImage?.src]);

  // ── Draw image on canvas
  const drawCanvas = useCallback(
    (
      canvas: HTMLCanvasElement | null,
      imgSrc: string,
      z: number,
      p: { x: number; y: number },
      r: number,
      b: number,
      c: number,
      inv: boolean
    ) => {
      if (!canvas || !imgSrc) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.filter = `brightness(${b}%) contrast(${c}%)${inv ? " invert(100%)" : ""}`;
        ctx.translate(canvas.width / 2 + p.x, canvas.height / 2 + p.y);
        ctx.rotate((r * Math.PI) / 180);
        ctx.scale(z, z);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();
      };
      img.src = imgSrc;
    },
    []
  );

  // ── Redraw main canvas
  useEffect(() => {
    if (images[activeIndex]) {
      drawCanvas(canvasRef.current, images[activeIndex].src, zoom, pan, rotate, brightness, contrast, invert);
    }
  }, [images, activeIndex, zoom, pan, rotate, brightness, contrast, invert, drawCanvas]);

  // ── Redraw compare canvas
  useEffect(() => {
    if (compareMode && compareIndex !== null && images[compareIndex]) {
      drawCanvas(canvas2Ref.current, images[compareIndex].src, zoom2, pan2, 0, brightness2, contrast2, invert);
    }
  }, [compareMode, compareIndex, images, zoom2, pan2, brightness2, contrast2, invert, drawCanvas]);

  // ── Redraw annotation overlay
  useEffect(() => {
    const canvas = annotRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    annotations.forEach((a) => {
      ctx.strokeStyle = a.color;
      ctx.fillStyle = a.color;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (a.type === "draw" && a.points && a.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(a.points[0].x, a.points[0].y);
        a.points.forEach((pt) => ctx.lineTo(pt.x, pt.y));
        ctx.stroke();
      } else if (a.type === "arrow" && a.from && a.to) {
        const { from, to } = a;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        // Arrowhead
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - 12 * Math.cos(angle - 0.4), to.y - 12 * Math.sin(angle - 0.4));
        ctx.lineTo(to.x - 12 * Math.cos(angle + 0.4), to.y - 12 * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();
      } else if (a.type === "text" && a.text && a.position) {
        ctx.font = "bold 16px monospace";
        ctx.fillText(a.text, a.position.x, a.position.y);
      }
    });

    // Live draw preview
    if (drawing && tool === "draw" && currentPoints.length > 1) {
      ctx.strokeStyle = annotColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      currentPoints.forEach((pt) => ctx.lineTo(pt.x, pt.y));
      ctx.stroke();
    }
    if (tool === "arrow" && arrowStart && currentPoints.length > 0) {
      const last = currentPoints[currentPoints.length - 1];
      ctx.strokeStyle = annotColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(arrowStart.x, arrowStart.y);
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
  }, [annotations, drawing, currentPoints, arrowStart, tool, annotColor]);

  // ── Mouse/touch helpers for annotation
  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const handleAnnotMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === "none") return;
    const pos = getPos(e);
    if (tool === "draw") {
      setDrawing(true);
      setCurrentPoints([pos]);
    } else if (tool === "arrow") {
      setArrowStart(pos);
      setCurrentPoints([pos]);
    } else if (tool === "text") {
      const txt = window.prompt("Text likhein:");
      if (txt) {
        setAnnotations((prev) => [...prev, { id: uid(), type: "text", color: annotColor, text: txt, position: pos }]);
      }
    }
  };

  const handleAnnotMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);
    if (tool === "draw" && drawing) {
      setCurrentPoints((prev) => [...prev, pos]);
    } else if (tool === "arrow" && arrowStart) {
      setCurrentPoints([pos]);
    }
  };

  const handleAnnotMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);
    if (tool === "draw" && drawing) {
      setAnnotations((prev) => [...prev, { id: uid(), type: "draw", color: annotColor, points: [...currentPoints, pos] }]);
      setDrawing(false);
      setCurrentPoints([]);
    } else if (tool === "arrow" && arrowStart) {
      setAnnotations((prev) => [...prev, { id: uid(), type: "arrow", color: annotColor, from: arrowStart, to: pos }]);
      setArrowStart(null);
      setCurrentPoints([]);
    }
  };

  // ── Pan on main canvas
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== "none") return;
    isPanning.current = true;
    lastPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPanning.current) return;
    setPan({ x: e.clientX - lastPan.current.x, y: e.clientY - lastPan.current.y });
  };
  const handleCanvasMouseUp = () => { isPanning.current = false; };

  // ── Scroll zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setZoom((z) => Math.min(8, Math.max(0.2, z + (e.deltaY < 0 ? 0.1 : -0.1))));
  };

  // ── Load local file
  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        setImages((prev) => [
          ...prev,
          { id: uid(), name: file.name, src, date: new Date().toLocaleDateString("hi-IN"), patientName: "" },
        ]);
        notify(`✅ ${file.name} load ho gaya`);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  // ── Orthanc: fetch studies
  const fetchOrthancStudies = async () => {
    setOrthancLoading(true);
    setOrthancError("");
    try {
      const res = await fetch(`${ORTHANC_URL}/studies?expand`);
      if (!res.ok) throw new Error("Orthanc server se connect nahi ho paya");
      const data = await res.json();
      setOrthancStudies(data);
    } catch (err: any) {
      setOrthancError(err.message || "Connection failed");
    } finally {
      setOrthancLoading(false);
    }
  };

  // ── Orthanc: load X-ray instance preview
  const loadOrthancXray = async (studyId: string, patientNameStr: string, dateStr: string) => {
    try {
      notify("⏳ Orthanc se load ho raha hai...");
      const seriesRes = await fetch(`${ORTHANC_URL}/studies/${studyId}/series`);
      const series = await seriesRes.json();
      if (!series.length) { notify("❌ Koi series nahi mili"); return; }

      const instancesRes = await fetch(`${ORTHANC_URL}/series/${series[0].ID}/instances`);
      const instances = await instancesRes.json();
      if (!instances.length) { notify("❌ Koi instance nahi"); return; }

      const imgRes = await fetch(`${ORTHANC_URL}/instances/${instances[0].ID}/preview`);
      const blob = await imgRes.blob();
      const src = URL.createObjectURL(blob);

      setImages((prev) => [
        ...prev,
        { id: uid(), name: `Orthanc: ${patientNameStr || studyId}`, src, date: dateStr, patientName: patientNameStr },
      ]);
      setActiveIndex((prev) => prev); // keep current or switch
      notify(`✅ X-ray load ho gayi`);
    } catch (err) {
      notify("❌ Orthanc se image load nahi hui");
    }
  };

  // ── Reset transforms
  const resetTransform = () => {
    setZoom(1); setPan({ x: 0, y: 0 }); setRotate(0);
    setBrightness(100); setContrast(100); setInvert(false);
  };

  // ── Flip horizontal
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  // ── Generate PDF Report
  const generateReport = async () => {
    if (!images[activeIndex]) { notify("❌ Pehle X-ray load karo"); return; }
    try {
      // ✅ FIX: pehle jsPDF CDN se load hota tha (internet chahiye hota tha,
      // offline mein PDF banna hi fail ho jaata tha). Ab local npm package
      // use ho raha hai — poora offline chalega.
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      // Header
      doc.setFillColor(26, 58, 107);
      doc.rect(0, 0, 210, 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("BALAJI ORTHO CARE CENTER", 105, 12, { align: "center" });
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Dr. S. S. Rathore | Khinwara, Rajasthan", 105, 20, { align: "center" });

      // Patient Info
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("X-RAY REPORT", 14, 38);
      doc.setLineWidth(0.5);
      doc.setDrawColor(26, 58, 107);
      doc.line(14, 40, 196, 40);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Patient Name: ${patientName || images[activeIndex].patientName || "—"}`, 14, 50);
      doc.text(`Age: ${patientAge || "—"}`, 120, 50);
      doc.text(`Date: ${images[activeIndex].date || new Date().toLocaleDateString("hi-IN")}`, 14, 57);
      doc.text(`Doctor: ${doctorName}`, 120, 57);
      doc.text(`Image: ${images[activeIndex].name}`, 14, 64);

      // X-ray image
      const canvas = canvasRef.current;
      if (canvas) {
        const imgData = canvas.toDataURL("image/jpeg", 0.85);
        doc.addImage(imgData, "JPEG", 14, 72, 182, 120);
      }

      // Findings
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Findings / Observations:", 14, 200);
      doc.setLineWidth(0.3);
      doc.line(14, 202, 196, 202);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(reportNotes || "Normal study. No significant abnormality detected.", 180);
      doc.text(lines, 14, 210);

      // Signature
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(doctorName, 140, 270);
      doc.line(130, 272, 196, 272);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("Consulting Orthopedic Surgeon", 140, 277);

      // Footer
      doc.setFillColor(240, 240, 240);
      doc.rect(0, 284, 210, 13, "F");
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.text("Balaji Ortho Care Center | Khinwara | This report is generated digitally", 105, 291, { align: "center" });

      doc.save(`XRay_Report_${patientName || "Patient"}_${Date.now()}.pdf`);
      notify("✅ Report PDF download ho gayi!");
    } catch (err) {
      notify("❌ PDF generate nahi hui. jsPDF load error.");
    }
  };

  // ── WhatsApp Share
  const shareWhatsApp = () => {
    if (!images[activeIndex]) { notify("❌ Pehle X-ray load karo"); return; }
    const text = encodeURIComponent(
      `🏥 *Balaji Ortho Care Center*\nPatient: ${patientName || "—"}\nDate: ${images[activeIndex].date || "—"}\nDoctor: ${doctorName}\n\n${reportNotes ? "Findings: " + reportNotes : ""}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
    notify("📲 WhatsApp khul raha hai...");
  };

  // ── Toolbar icon button style
  const toolBtn = (active: boolean) =>
    `flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer select-none ${
      active
        ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/30"
        : "bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white"
    }`;

  const hasImage = images.length > 0 && !!images[activeIndex];

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden font-mono">
      {/* ── Left Sidebar ── */}
      <div className="w-14 bg-gray-900 border-r border-gray-800 flex flex-col items-center py-3 gap-1 z-20">
        {/* Logo */}
        <div className="w-9 h-9 rounded-lg bg-blue-700 flex items-center justify-center mb-2 text-base">🦴</div>

        {[
          { icon: "🔧", label: "Tools", key: "tools" },
          { icon: "🏥", label: "PACS", key: "orthanc" },
          { icon: "📋", label: "Report", key: "report" },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setActivePanel(activePanel === item.key ? null : (item.key as any))}
            className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center text-sm transition-all ${
              activePanel === item.key ? "bg-cyan-500 text-black" : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
            title={item.label}
          >
            <span>{item.icon}</span>
          </button>
        ))}

        <div className="flex-1" />

        {/* File upload */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-10 h-10 rounded-lg bg-blue-700 hover:bg-blue-600 flex items-center justify-center text-lg"
          title="Local file upload"
        >
          📁
        </button>
        <input ref={fileInputRef} type="file" accept="image/*,.dcm" multiple className="hidden" onChange={handleFileLoad} />
      </div>

      {/* ── Side Panel ── */}
      {activePanel && (
        <div className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto">
          {/* Tools Panel */}
          {activePanel === "tools" && (
            <div className="p-3 flex flex-col gap-3">
              <p className="text-cyan-400 text-xs font-bold uppercase tracking-widest">View Tools</p>

              {/* Zoom */}
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Zoom</span><span className="text-cyan-400">{zoom.toFixed(1)}x</span>
                </div>
                <input type="range" min={0.2} max={8} step={0.1} value={zoom}
                  onChange={(e) => setZoom(+e.target.value)}
                  className="w-full accent-cyan-500" />
                <div className="flex gap-1 mt-1">
                  <button onClick={() => setZoom(1)} className="flex-1 text-xs py-1 bg-white/10 rounded hover:bg-white/20">1x</button>
                  <button onClick={() => setZoom(2)} className="flex-1 text-xs py-1 bg-white/10 rounded hover:bg-white/20">2x</button>
                  <button onClick={() => setZoom(4)} className="flex-1 text-xs py-1 bg-white/10 rounded hover:bg-white/20">4x</button>
                </div>
              </div>

              {/* Rotate */}
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Rotate</span><span className="text-cyan-400">{rotate}°</span>
                </div>
                <input type="range" min={-180} max={180} step={1} value={rotate}
                  onChange={(e) => setRotate(+e.target.value)}
                  className="w-full accent-cyan-500" />
                <div className="flex gap-1 mt-1">
                  {[-90, 0, 90, 180].map((r) => (
                    <button key={r} onClick={() => setRotate(r)}
                      className={`flex-1 text-xs py-1 rounded ${rotate === r ? "bg-cyan-500 text-black" : "bg-white/10 hover:bg-white/20"}`}>
                      {r}°
                    </button>
                  ))}
                </div>
              </div>

              {/* Brightness */}
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>☀️ Brightness</span><span className="text-cyan-400">{brightness}%</span>
                </div>
                <input type="range" min={0} max={300} step={5} value={brightness}
                  onChange={(e) => setBrightness(+e.target.value)}
                  className="w-full accent-yellow-400" />
              </div>

              {/* Contrast */}
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>◑ Contrast</span><span className="text-cyan-400">{contrast}%</span>
                </div>
                <input type="range" min={0} max={300} step={5} value={contrast}
                  onChange={(e) => setContrast(+e.target.value)}
                  className="w-full accent-purple-400" />
              </div>

              {/* Toggles */}
              <div className="flex gap-2">
                <button onClick={() => setInvert(!invert)}
                  className={`flex-1 text-xs py-1.5 rounded-lg ${invert ? "bg-cyan-500 text-black" : "bg-white/10 hover:bg-white/20"}`}>
                  ⬜ Invert
                </button>
                <button onClick={() => setFlipH(!flipH)}
                  className={`flex-1 text-xs py-1.5 rounded-lg ${flipH ? "bg-cyan-500 text-black" : "bg-white/10 hover:bg-white/20"}`}>
                  ↔ Flip H
                </button>
              </div>
              <button onClick={resetTransform}
                className="w-full text-xs py-1.5 bg-red-900/50 hover:bg-red-800/60 rounded-lg text-red-300">
                🔄 Reset All
              </button>

              {/* Separator */}
              <div className="border-t border-gray-700 pt-3">
                <p className="text-cyan-400 text-xs font-bold uppercase tracking-widest mb-2">Annotate</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { t: "none" as const, icon: "🖱️", label: "Pan" },
                    { t: "draw" as const, icon: "✏️", label: "Draw" },
                    { t: "arrow" as const, icon: "➡️", label: "Arrow" },
                    { t: "text" as const, icon: "T", label: "Text" },
                  ].map(({ t, icon, label }) => (
                    <button key={t} onClick={() => setTool(t)}
                      className={toolBtn(tool === t)}>
                      <span className="text-base">{icon}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>

                {/* Color */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-400">Color:</span>
                  {["#ff4444", "#44ff88", "#ffff44", "#44aaff", "#ff88ff"].map((c) => (
                    <button key={c} onClick={() => setAnnotColor(c)}
                      className={`w-5 h-5 rounded-full border-2 ${annotColor === c ? "border-white" : "border-transparent"}`}
                      style={{ background: c }} />
                  ))}
                  <input type="color" value={annotColor} onChange={(e) => setAnnotColor(e.target.value)}
                    className="w-6 h-6 cursor-pointer rounded" />
                </div>

                <button onClick={() => setAnnotations([])}
                  className="w-full text-xs py-1 mt-2 bg-red-900/40 hover:bg-red-800/50 rounded text-red-300">
                  🗑️ Annotations saaf karo
                </button>
              </div>

              {/* Compare */}
              <div className="border-t border-gray-700 pt-3">
                <p className="text-cyan-400 text-xs font-bold uppercase tracking-widest mb-2">Compare</p>
                <button onClick={() => setCompareMode(!compareMode)}
                  className={`w-full text-xs py-2 rounded-lg ${compareMode ? "bg-cyan-500 text-black" : "bg-white/10 hover:bg-white/20"}`}>
                  {compareMode ? "✅ Compare Mode ON" : "⚖️ Compare Mode"}
                </button>
                {compareMode && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-400 mb-1">Doosri image select karo:</p>
                    {images.map((img, i) => (
                      <button key={img.id} onClick={() => setCompareIndex(i)}
                        className={`w-full text-xs py-1 px-2 rounded mb-1 text-left truncate ${
                          compareIndex === i ? "bg-cyan-600" : "bg-white/10 hover:bg-white/20"
                        }`}>
                        {i + 1}. {img.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Orthanc Panel */}
          {activePanel === "orthanc" && (
            <div className="p-3 flex flex-col gap-3">
              <p className="text-cyan-400 text-xs font-bold uppercase tracking-widest">PACS / Orthanc</p>
              <p className="text-xs text-gray-400">Server: <span className="text-green-400">localhost:8042</span></p>

              <button onClick={fetchOrthancStudies}
                className="w-full py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-medium">
                {orthancLoading ? "⏳ Loading..." : "🔗 Studies Load Karo"}
              </button>

              {orthancError && (
                <div className="text-xs text-red-400 bg-red-900/30 p-2 rounded">
                  ❌ {orthancError}
                </div>
              )}

              <div className="flex flex-col gap-1 max-h-96 overflow-y-auto">
                {orthancStudies.map((s) => (
                  <button
                    key={s.ID}
                    onClick={() => loadOrthancXray(
                      s.ID,
                      s.PatientMainDicomTags?.PatientName || "Unknown",
                      s.MainDicomTags?.StudyDate || ""
                    )}
                    className="text-left text-xs p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-gray-700"
                  >
                    <div className="text-white font-medium truncate">
                      👤 {s.PatientMainDicomTags?.PatientName || s.ID.slice(0, 8)}
                    </div>
                    <div className="text-gray-400 mt-0.5">
                      📅 {s.MainDicomTags?.StudyDate || "—"} · {s.MainDicomTags?.StudyDescription || "X-Ray"}
                    </div>
                  </button>
                ))}
                {orthancStudies.length === 0 && !orthancLoading && !orthancError && (
                  <p className="text-xs text-gray-500 text-center mt-4">
                    Orthanc se studies load karo ☝️
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Report Panel */}
          {activePanel === "report" && (
            <div className="p-3 flex flex-col gap-3">
              <p className="text-cyan-400 text-xs font-bold uppercase tracking-widest">Report Generate</p>

              <div>
                <label className="text-xs text-gray-400">Patient Name</label>
                <input value={patientName} onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Patient ka naam"
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Age</label>
                <input value={patientAge} onChange={(e) => setPatientAge(e.target.value)}
                  placeholder="Umra"
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Doctor</label>
                <input value={doctorName} onChange={(e) => setDoctorName(e.target.value)}
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Findings / Notes</label>
                <textarea value={reportNotes} onChange={(e) => setReportNotes(e.target.value)}
                  rows={5} placeholder="Observations, diagnosis, recommendations..."
                  className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 resize-none" />
              </div>

              <button onClick={generateReport}
                className="w-full py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-medium">
                📄 PDF Report Download
              </button>

              <button onClick={shareWhatsApp}
                className="w-full py-2 bg-green-700 hover:bg-green-600 rounded-lg text-sm font-medium">
                📲 WhatsApp Pe Share
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Main Viewer Area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="h-10 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-3">
          <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">X-Ray Viewer</span>
          {hasImage && (
            <>
              <span className="text-xs text-cyan-400">📁 {images[activeIndex].name}</span>
              {images[activeIndex].date && <span className="text-xs text-gray-500">📅 {images[activeIndex].date}</span>}
            </>
          )}
          <div className="flex-1" />
          {/* Image thumbnails */}
          <div className="flex gap-1 overflow-x-auto max-w-xs">
            {images.map((img, i) => (
              <button key={img.id}
                onClick={() => { setActiveIndex(i); resetTransform(); }}
                className={`w-7 h-7 rounded text-xs font-bold border-2 ${
                  i === activeIndex ? "border-cyan-500 bg-cyan-900" : "border-gray-700 bg-gray-800 hover:border-gray-500"
                }`}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Canvas area */}
        <div className={`flex-1 flex ${compareMode ? "gap-1" : ""} bg-black relative overflow-hidden`}>
          {/* Main canvas */}
          <div className={`relative ${compareMode ? "flex-1" : "w-full h-full"} flex items-center justify-center`}>
            {!hasImage ? (
              <div className="flex flex-col items-center gap-4 text-gray-600">
                <div className="text-7xl opacity-30">🩻</div>
                <p className="text-lg">X-Ray image load karo</p>
                <p className="text-sm">📁 Local file (neeche left) ya 🏥 Orthanc PACS se</p>
                <button onClick={() => fileInputRef.current?.click()}
                  className="mt-2 px-6 py-2.5 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-medium">
                  📁 Image Select Karo
                </button>
              </div>
            ) : (
              <>
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={700}
                  style={{
                    transform: `scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                    cursor: tool === "none" ? "grab" : "crosshair",
                    position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                    objectFit: "contain",
                  }}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                  onWheel={handleWheel}
                />
                <canvas
                  ref={annotRef}
                  width={800}
                  height={700}
                  style={{
                    position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                    cursor: tool === "none" ? "grab" : "crosshair",
                    background: "transparent",
                  }}
                  onMouseDown={handleAnnotMouseDown}
                  onMouseMove={handleAnnotMouseMove}
                  onMouseUp={handleAnnotMouseUp}
                />
              </>
            )}
          </div>

          {/* Compare canvas */}
          {compareMode && (
            <div className="flex-1 relative flex items-center justify-center border-l border-gray-700">
              {compareIndex !== null && images[compareIndex] ? (
                <>
                  <div className="absolute top-2 left-2 z-10 flex gap-1">
                    {[
                      { label: "B", val: brightness2, set: setBrightness2, min: 0, max: 300, color: "accent-yellow-400" },
                      { label: "C", val: contrast2, set: setContrast2, min: 0, max: 300, color: "accent-purple-400" },
                    ].map(({ label, val, set }) => (
                      <div key={label} className="flex items-center gap-1 bg-black/60 rounded px-2 py-1">
                        <span className="text-xs text-gray-300">{label}</span>
                        <input type="range" min={0} max={300} step={5} value={val}
                          onChange={(e) => set(+e.target.value)}
                          className="w-16 accent-cyan-400" />
                      </div>
                    ))}
                  </div>
                  <canvas
                    ref={canvas2Ref}
                    width={800}
                    height={700}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
                    onWheel={(e) => {
                      e.preventDefault();
                      setZoom2((z) => Math.min(8, Math.max(0.2, z + (e.deltaY < 0 ? 0.1 : -0.1))));
                    }}
                  />
                  <div className="absolute top-2 right-2 text-xs bg-black/60 px-2 py-1 rounded text-cyan-300">
                    Compare: {images[compareIndex].name}
                  </div>
                </>
              ) : (
                <div className="text-gray-600 flex flex-col items-center gap-2">
                  <div className="text-4xl">⚖️</div>
                  <p className="text-sm">Left panel se doosri image select karo</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom status bar */}
        <div className="h-7 bg-gray-900 border-t border-gray-800 flex items-center px-3 gap-4 text-xs text-gray-500">
          <span>🔍 {zoom.toFixed(1)}x</span>
          <span>🔄 {rotate}°</span>
          <span>☀️ {brightness}%</span>
          <span>◑ {contrast}%</span>
          <span>✏️ {annotations.length} annotations</span>
          <span className="flex-1" />
          {tool !== "none" && <span className="text-cyan-400">Tool: {tool}</span>}
          <span>Scroll: Zoom | Drag: Pan</span>
        </div>
      </div>

      {/* ── Notification Toast ── */}
      {notification && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-gray-800 border border-cyan-500/40 text-white px-4 py-2 rounded-lg text-sm shadow-xl z-50 animate-pulse">
          {notification}
        </div>
      )}
    </div>
  );
}
