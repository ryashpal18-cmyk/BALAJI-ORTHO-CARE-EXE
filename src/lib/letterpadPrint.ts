import { escapeHtml } from "./safeReportHtml";

export const LETTERPAD_SETTINGS_KEY = "balaji-letterpad-print-v1";
export const letterpadFields = ["name", "age", "gender", "date", "registration"] as const;
export type LetterpadField = typeof letterpadFields[number];
export type LetterpadLayout = { offsetX: number; offsetY: number; labels: boolean; positions: Record<LetterpadField, { x: number; y: number }> };
export const defaultLetterpadLayout: LetterpadLayout = {
  offsetX: 0, offsetY: 0, labels: false,
  positions: { name: { x: 35, y: 57 }, age: { x: 118, y: 57 }, gender: { x: 149, y: 57 }, date: { x: 176, y: 57 }, registration: { x: 27, y: 65 } },
};
export const letterpadFieldInfo = {
  name: { label: "Name", width: 60, size: 14, labelWidth: 18 },
  age: { label: "Age", width: 20, size: 12, labelWidth: 10 },
  gender: { label: "Sex", width: 25, size: 12, labelWidth: 10 },
  date: { label: "Date", width: 30, size: 12, labelWidth: 12 },
  registration: { label: "Reg. No.", width: 60, size: 12, labelWidth: 21 },
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
export function buildLetterpadHtml(values: Record<LetterpadField, string>, input: LetterpadLayout): string {
  const layout = normalizeLetterpadLayout(input);
  const fields = letterpadFields.map(field => {
    const info = letterpadFieldInfo[field], pos = layout.positions[field];
    const x = Math.min(210 - info.width, Math.max(layout.labels ? info.labelWidth : 0, pos.x + layout.offsetX));
    const y = Math.min(285, Math.max(0, pos.y + layout.offsetY));
    const label = layout.labels ? `<span class="label" style="left:${x - info.labelWidth}mm;top:${y}mm;width:${info.labelWidth}mm">${info.label}:</span>` : "";
    return `${label}<span class="value" data-field="${field}" style="left:${x}mm;top:${y}mm;width:${info.width}mm;font-size:${info.size}pt">${escapeHtml(values[field])}</span>`;
  }).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title></title><style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html,body { margin:0; padding:0; width:210mm; height:297mm; background:white; color:black; font-family:Arial,"Nirmala UI",sans-serif; }
    .value,.label { position:absolute; height:12mm; display:flex; align-items:center; line-height:1.15; overflow-wrap:anywhere; overflow:hidden; }
    .value { font-weight:700; } .label { font-size:10pt; font-weight:400; }
  </style></head><body>${fields}</body></html>`;
}
