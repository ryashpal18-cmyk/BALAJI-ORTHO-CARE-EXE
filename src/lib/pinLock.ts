// ── Simple PIN-lock utility (4-6 digit PIN, stored as SHA-256 hash) ──
// Biometric (fingerprint) Capacitor plugin ke bina bhi kaam karta hai;
// agar app me @capgo/capacitor-native-biometric jaisa plugin install ho,
// to isi file ke andar extend kar sakte ho.

const PIN_HASH_KEY = "bocc_pin_hash";
const PIN_ENABLED_KEY = "bocc_pin_enabled";
const LOCK_TIMEOUT_KEY = "bocc_lock_timeout_min"; // kitni der baad auto-lock ho
const LAST_ACTIVE_KEY = "bocc_last_active_ts";

async function sha256(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function setPin(pin: string): Promise<void> {
  const hash = await sha256(pin);
  localStorage.setItem(PIN_HASH_KEY, hash);
  localStorage.setItem(PIN_ENABLED_KEY, "true");
}

export function isPinEnabled(): boolean {
  return localStorage.getItem(PIN_ENABLED_KEY) === "true" && !!localStorage.getItem(PIN_HASH_KEY);
}

export function disablePin(): void {
  localStorage.removeItem(PIN_HASH_KEY);
  localStorage.removeItem(PIN_ENABLED_KEY);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(PIN_HASH_KEY);
  if (!stored) return false;
  const hash = await sha256(pin);
  return hash === stored;
}

export function getLockTimeoutMin(): number {
  const v = Number(localStorage.getItem(LOCK_TIMEOUT_KEY));
  return v > 0 ? v : 5; // default: 5 minute inactivity ke baad lock
}

export function setLockTimeoutMin(min: number): void {
  localStorage.setItem(LOCK_TIMEOUT_KEY, String(min));
}

export function markActive(): void {
  localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
}

export function shouldShowLock(): boolean {
  if (!isPinEnabled()) return false;
  const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) || 0);
  if (!last) return true; // pehli baar app khula
  const minutesSince = (Date.now() - last) / 60000;
  return minutesSince >= getLockTimeoutMin();
}
