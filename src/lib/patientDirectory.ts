export type DirectoryPatient = { id: string; registration_number?: string; workflow_data?: any; name?: string; mobile?: string; address?: string; age?: number; gender?: string; branch_id?: string; _pendingSync?: boolean };
export function searchText(value: unknown): string {
  return String(value ?? "").normalize("NFKC").replace(/[०-९]/g, c => String(c.charCodeAt(0) - 0x966)).trim().replace(/\s+/g, " ").toLocaleLowerCase("hi-IN");
}
export function smsMobile(value: unknown): string {
  let n = searchText(value).replace(/\D/g, "");
  if (n.length === 12 && n.startsWith("91")) n = n.slice(2);
  if (n.length === 11 && n.startsWith("0")) n = n.slice(1);
  return /^[6-9]\d{9}$/.test(n) && !/^(\d)\1{9}$/.test(n) ? n : "";
}
export function villageOptions(rows: DirectoryPatient[]) {
  const map = new Map<string, { key: string; label: string; count: number }>();
  for (const p of rows) {
    const key = searchText(p.address);
    const old = map.get(key);
    if (old) old.count++; else map.set(key, { key, label: String(p.address || "").trim() || "गाँव / पता दर्ज नहीं", count: 1 });
  }
  return [...map.values()].sort((a,b) => a.label.localeCompare(b.label,"hi"));
}
export function filterPatients(rows: DirectoryPatient[], query: string, village: string, exactVillage: string | null) {
  const q = searchText(query), v = searchText(village);
  const digits = q.replace(/\D/g, "");
  const phoneQuery = !!digits && /^[\d\s+().-]+$/.test(q);
  return rows.filter(p => {
    const address = searchText(p.address);
    if (exactVillage !== null && address !== exactVillage) return false;
    if (v && !address.includes(v)) return false;
    if (!q) return true;
    return phoneQuery ? searchText(p.mobile).replace(/\D/g, "").includes(digits) || smsMobile(p.mobile).includes(digits)
      : searchText(p.name).includes(q) || searchText(p.registration_number).includes(q);
  }).sort((a,b) => searchText(a.name).localeCompare(searchText(b.name),"hi") || a.id.localeCompare(b.id));
}
export function uniqueSmsNumbers(rows: DirectoryPatient[]) {
  return [...new Set(rows.map(p => smsMobile(p.mobile)).filter(Boolean))];
}
