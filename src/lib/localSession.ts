import { supabase, setCloudAccessMode } from "@/integrations/supabase/client";
import { STORAGE_KEYS } from "./appConfig";

export function displaySession(profile: any) {
  localStorage.setItem(STORAGE_KEYS.IS_LOGGED_IN, "true");
  localStorage.setItem(STORAGE_KEYS.USER_NAME, profile.displayName || profile.email || "Admin");
  localStorage.setItem(STORAGE_KEYS.USER_ROLE, profile.role);
  localStorage.setItem(STORAGE_KEYS.USER_PERMS, JSON.stringify(profile.pages || []));
}

export function resetCloudConnection() { setCloudAccessMode(false); }

// Local owner login authorizes PC access; the API key independently handles cloud sync.
export async function ensureCloudSession(): Promise<boolean> {
  const bridge = (window as any).electron;
  if (!bridge?.checkAuth) {
    setCloudAccessMode(false);
    return !!(await supabase.auth.getSession()).data.session;
  }
  const auth = await bridge.checkAuth();
  if (!auth.valid) { setCloudAccessMode(false); return false; }
  setCloudAccessMode(!!auth.principal?.localAdmin);
  if (auth.principal?.localAdmin) return true;
  return !!(await supabase.auth.getSession()).data.session;
}
