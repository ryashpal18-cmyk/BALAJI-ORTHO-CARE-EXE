import { escapeHtml } from "./safeReportHtml";

export const LETTERPAD_SETTINGS_KEY = "balaji-letterpad-print-final-v2";
export const letterpadFields = ["name", "registration", "age", "gender", "date"] as const;
export type LetterpadField = typeof letterpadFields[number];
export type LetterpadLayout = { offsetX: number; offsetY: number; labels: boolean; positions: Record<LetterpadField, { x: number; y: number }> };
// Coordinates refer to the supplied final A4 design, measured from its top-left.
export const defaultLetterpadLayout: LetterpadLayout = {
  offsetX: 0, offsetY: 0, labels: false,
  positions: { name: { x: 35.5, y: 58.3 }, registration: { x: 86.5, y: 58.3 }, age: { x: 119.5, y: 58.3 }, gender: { x: 150.5, y: 58.3 }, date: { x: 185.5, y: 58.3 } },
};
export const letterpadFieldInfo = {
  name: { label: "Name", width: 32, size: 14, labelWidth: 18 },
  registration: { label: "Reg. No.", width: 20, size: 12, labelWidth: 17 },
  age: { label: "Age", width: 17, size: 12, labelWidth: 10 },
  gender: { label: "Sex", width: 21, size: 12, labelWidth: 10 },
  date: { label: "Date", width: 18.5, size: 12, labelWidth: 12 },
};
const number = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  return value !== null && value !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
export function normalizeLetterpadLayout(value: any): LetterpadLayout {
  const positions = {} as LetterpadLayout["positions"];
  for (const field of letterpadFields) {
    const info = letterpadFieldInfo[field], fallback = defaultLetterpadLayout.positions[field];
    positions[field] = { x: number(value?.positions?.[field]?.x, fallback.x, info.labelWidth, 210 - info.width), y: number(value?.positions?.[field]?.y, fallback.y, 0, 285) };
  }
  return { positions, labels: value?.labels === true, offsetX: number(value?.offsetX, 0, -20, 20), offsetY: number(value?.offsetY, 0, -20, 20) };
}
export function buildLetterpadHtml(values: Record<LetterpadField, string>, input: LetterpadLayout, options: { background?: string } = {}): string {
  const layout = normalizeLetterpadLayout(input);
  // Only bundled raster data is accepted, never a remote URL or arbitrary HTML.
  const background = options.background && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(options.background)
    ? `<img class="letterpad-design" alt="" src="${escapeHtml(options.background)}">` : "";
  const fields = letterpadFields.map(field => {
    const info = letterpadFieldInfo[field], pos = layout.positions[field];
    const x = Math.min(210 - info.width, Math.max(layout.labels ? info.labelWidth : 0, pos.x + layout.offsetX));
    const y = Math.min(285, Math.max(0, pos.y + layout.offsetY));
    const label = layout.labels && !background ? `<span class="label" style="left:${x - info.labelWidth}mm;top:${y}mm;width:${info.labelWidth}mm">${info.label}:</span>` : "";
    const text = String(values[field] ?? "");
    // Long names may wrap inside their own box, never into Reg/Age/Sex fields.
    let measuredWidth = Math.max(text.length, 1) * info.size * 0.72 * 96 / 72;
    if (typeof document !== "undefined") {
      const context = document.createElement("canvas").getContext("2d");
      if (context) {
        context.font = `700 ${info.size}pt Arial,"Nirmala UI",sans-serif`;
        measuredWidth = context.measureText(text).width || 1;
      }
    }
    const fitSize = info.size * ((info.width - 0.7) * 96 / 25.4) / measuredWidth;
    const fontSize = Math.max(field === "name" ? 8 : 5, Math.min(info.size, fitSize));
    return `${label}<span class="value ${field}" data-field="${field}" style="left:${x}mm;top:${y}mm;width:${info.width}mm;font-size:${fontSize.toFixed(2)}pt">${escapeHtml(text)}</span>`;
  }).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title></title><style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html,body { margin:0; padding:0; width:210mm; height:297mm; background:white; color:black; font-family:Arial,"Nirmala UI",sans-serif; }
    .letterpad-design { position:absolute; left:0; top:0; width:210mm; height:297mm; }
    .value,.label { position:absolute; height:12mm; display:flex; align-items:center; line-height:1.1; overflow:hidden; }
    .value { font-weight:700; white-space:nowrap; } .name { white-space:normal; overflow-wrap:anywhere; } .label { font-size:10pt; font-weight:400; }
  </style></head><body>${background}${fields}</body></html>`;
}
