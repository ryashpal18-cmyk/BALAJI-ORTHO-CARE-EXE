/** Clinic business dates are always Asia/Kolkata, regardless of PC timezone. */
export function businessDate(value: string | Date | number = new Date()): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export const businessDayStart = (date: string) => `${date}T00:00:00+05:30`;
export const businessDayEnd = (date: string) => `${date}T23:59:59.999999+05:30`;
