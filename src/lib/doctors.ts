// ─────────────────────────────────────────────────────────────────────────
// Doctor registration + X-ray commission helpers
// ─────────────────────────────────────────────────────────────────────────
// Default doctor (Dr. S. S. Rathore) database mein row nahi hai — woh hamesha
// dropdown mein sabse upar rehta hai. Bill par doctor_id sirf tab save hota hai
// jab koi DUSRA registered doctor chuna jaye. Isliye normal bills ka koi data
// ya sync badalta nahi.
//
// Commission bill mein save nahi hota — report ke time bill ki "service" line
// se nikalta hai (X-ray wali services ka total × doctor ka %). Isliye bill edit
// karne par commission apne-aap sahi rehta hai.

export const DEFAULT_DOCTOR_VALUE = "default";
export const DEFAULT_DOCTOR_NAME = "Dr. S. S. Rathore";
export const DEFAULT_COMMISSION_PERCENT = 20;

export type Doctor = {
  id: string;
  name: string;
  mobile?: string | null;
  speciality?: string | null;
  commission_percent: number;
  is_active: boolean;
  created_at?: string;
  _pendingSync?: boolean;
};

/** "local_<uuid>" aur "<uuid>" ko ek hi maana jaye (sync ke baad id se prefix hat jaata hai). */
export const normId = (id: unknown) => String(id ?? "").replace(/^local_/, "");

const XRAY_RE = /x[\s._-]*ray|एक्स[\s._-]*रे|एक्सरे/i;
export const isXrayService = (name: string) => XRAY_RE.test(name || "");

export type ParsedService = { name: string; amount: number };

/** Billing ka "naam:amount|naam:amount" format (Billing.tsx jaisa hi parsing). */
export function parseServices(bill: { service?: string | null; amount?: number | string | null }): ParsedService[] {
  return String(bill.service || "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const parts = s.split(":");
      const name = parts[0]?.trim() || s;
      const amount = parts[1] ? Number(parts[1].trim()) : Number(bill.amount ?? 0);
      return { name, amount: Number.isFinite(amount) ? amount : 0 };
    });
}

export function xrayLines(bill: { service?: string | null; amount?: number | string | null }): ParsedService[] {
  return parseServices(bill).filter((s) => isXrayService(s.name));
}

export const xrayAmount = (bill: any) => xrayLines(bill).reduce((sum, s) => sum + s.amount, 0);

/** Sirf tab commission banta hai jab bill par koi registered (non-default) doctor ho. */
export function billCommission(bill: any): number {
  if (!bill?.doctor_id) return 0;
  const pct = Number(bill.doctor_commission_percent ?? DEFAULT_COMMISSION_PERCENT);
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.round(xrayAmount(bill) * pct) / 100;
}

export const rupees = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
