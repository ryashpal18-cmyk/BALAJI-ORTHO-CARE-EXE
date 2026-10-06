export function normalizeIndianMobile(value: string): string {
  let digits = (value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  throw new Error("Valid 10-digit Indian mobile number required");
}
