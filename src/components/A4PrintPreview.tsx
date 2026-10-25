import { useEffect, useRef, useState } from "react";

const PAGE_WIDTH = 210 * 96 / 25.4;
const PAGE_HEIGHT = 297 * 96 / 25.4;

/** Scale only the on-screen sheet; the print document keeps its exact mm geometry. */
export default function A4PrintPreview({ html, title = "Patient information print preview" }: { html: string; title?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const fit = () => setScale(Math.max(0.1, Math.min(1, (element.clientWidth - 24) / PAGE_WIDTH, Math.max(160, window.innerHeight - 280) / PAGE_HEIGHT)));
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    window.addEventListener("resize", fit);
    fit();
    return () => { observer.disconnect(); window.removeEventListener("resize", fit); };
  }, []);
  return <div ref={container} className="w-full overflow-auto rounded-lg bg-slate-200 p-3" data-a4-preview>
    <div className="relative mx-auto overflow-hidden bg-white shadow-md" style={{ width: PAGE_WIDTH * scale, height: PAGE_HEIGHT * scale }}>
      <iframe title={title} sandbox="" srcDoc={html} style={{ display: "block", width: PAGE_WIDTH, height: PAGE_HEIGHT, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", background: "white" }} />
    </div>
  </div>;
}
