import { businessDate } from "@/lib/businessDate";

/** Plaster date se itne din tak case Active gina jayega. Uske baad apne aap Inactive. */
export const PLASTER_ACTIVE_DAYS = 48;

/** Case ki shuru hone ki date (IST): plaster_date, warna case ban-ne ki date. */
export function plasterStartDate(c: any): string {
  return businessDate(c?.plaster_date || c?.created_at || "") || "";
}

/** Plaster date se aaj tak kitne din hue. Date na ho to null. */
export function plasterAgeDays(c: any, today: string = businessDate()): number | null {
  const start = plasterStartDate(c);
  if (!start) return null;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}

/**
 * Active = status "Active" aur plaster date se 48 din se zyada nahi hue.
 * Date na ho to status hi maana jayega.
 */
export function isPlasterActive(c: any, today?: string): boolean {
  if (c?.plaster_status !== "Active") return false;
  const age = plasterAgeDays(c, today);
  return age === null || age <= PLASTER_ACTIVE_DAYS;
}

/** Status "Active" hai lekin 48 din poore ho gaye, isliye Inactive maana gaya. */
export function isPlasterExpired(c: any, today?: string): boolean {
  return c?.plaster_status === "Active" && !isPlasterActive(c, today);
}
