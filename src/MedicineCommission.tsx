// Hindi WhatsApp message builder for ortho clinic.
// Uses WhatsApp Web URL — no paid API.

const PRECAUTIONS: Record<string, string> = {
  Arm: "हाथ को सीधा रखें, ज्यादा वजन ना उठाएं, plaster गीला ना करें।",
  Leg: "पैर पर वजन ना डालें, support के साथ चलें, plaster को सूखा रखें।",
  Default: "आराम करें, plaster को सूखा रखें, दर्द बढ़ने पर तुरंत clinic आएं।",
};

export type WaPatient = { name: string; mobile?: string | null };
export type WaBill = {
  amount?: number | null;
  amount_paid?: number | null;
  service?: string | null;
  created_at?: string | null;
};
export type WaFracture = {
  body_part?: string | null;
  side?: string | null;
  fracture_type?: string | null;
  plaster_type?: string | null;
  next_followup_date?: string | null;
};

export const CLINIC_NAME = "Balaji Ortho Care Center";

function fmtDate(d?: string | null) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("hi-IN");
  } catch {
    return d;
  }
}

export function buildNormalMessage(patient: WaPatient, bill: WaBill) {
  const total = Number(bill.amount || 0);
  const paid = Number(bill.amount_paid || 0);
  const due = Math.max(total - paid, 0);
  return [
    `नमस्ते ${patient.name},`,
    ``,
    `${CLINIC_NAME} में आपका स्वागत है।`,
    ``,
    `🧾 Invoice विवरण:`,
    `सेवा: ${bill.service || "-"}`,
    `कुल राशि: ₹${total.toLocaleString("hi-IN")}`,
    `भुगतान: ₹${paid.toLocaleString("hi-IN")}`,
    `बकाया: ₹${due.toLocaleString("hi-IN")}`,
    `दिनांक: ${fmtDate(bill.created_at)}`,
    ``,
    `धन्यवाद 🙏`,
  ].join("\n");
}

export function buildFractureMessage(
  patient: WaPatient,
  bill: WaBill | null,
  fx: WaFracture,
) {
  const part = fx.body_part || "-";
  const precaution = PRECAUTIONS[part] || PRECAUTIONS.Default;
  const lines = [
    `नमस्ते ${patient.name},`,
    ``,
    `${CLINIC_NAME} में आपका इलाज हुआ है।`,
    ``,
    `🦴 Fracture विवरण:`,
    `अंग: ${fx.side || ""} ${part}`.trim(),
    `Fracture Type: ${fx.fracture_type || "-"}`,
    `Plaster: ${fx.plaster_type || "-"}`,
    `अगली Follow-up: ${fmtDate(fx.next_followup_date)}`,
    ``,
    `⚠️ सावधानियां: ${precaution}`,
  ];
  if (bill) {
    const total = Number(bill.amount || 0);
    const paid = Number(bill.amount_paid || 0);
    lines.push(
      ``,
      `🧾 Bill: ₹${total.toLocaleString("hi-IN")} (Paid: ₹${paid.toLocaleString("hi-IN")})`,
    );
  }
  lines.push(``, `धन्यवाद 🙏`);
  return lines.join("\n");
}

export function openWhatsApp(mobile: string | null | undefined, message: string) {
  const clean = (mobile || "").replace(/\D/g, "");
  const number = clean.length === 10 ? `91${clean}` : clean;
  const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
