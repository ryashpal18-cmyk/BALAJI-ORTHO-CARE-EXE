import { supabase } from "@/integrations/supabase/client";
import { STORAGE_KEYS } from "./appConfig";

export function displaySession(profile: any) {
  localStorage.setItem(STORAGE_KEYS.IS_LOGGED_IN, "true");
  localStorage.setItem(STORAGE_KEYS.USER_NAME, profile.displayName || profile.email || "Admin");
  localStorage.setItem(STORAGE_KEYS.USER_ROLE, profile.role);
  localStorage.setItem(STORAGE_KEYS.USER_PERMS, JSON.stringify(profile.pages || []));
}

let connecting: Promise<boolean> | null = null;
let validUntil = 0;
let verifiedIdentity = "";
export function resetCloudConnection() { validUntil = 0; verifiedIdentity = ""; }

// Called only in background reads/sync, never on the local login/save critical path.
export async function ensureCloudSession(): Promise<boolean> {
  const bridge = (window as any).electron;
  if (!bridge?.checkAuth) return !!(await supabase.auth.getSession()).data.session;
  const auth = await bridge.checkAuth();
  if (!auth.valid) return false;
  if (!auth.principal?.localAdmin) return !!(await supabase.auth.getSession()).data.session;
  const identity = auth.principal.sessionKey;
  if (verifiedIdentity === identity && Date.now() < validUntil) return true;
  if (connecting) return connecting;
  connecting = (async () => {
    const result = await bridge.syncSession();
    if (!result?.success) return false;
    if ((await bridge.checkAuth()).principal?.sessionKey !== identity) return false;
    const { error } = await supabase.auth.setSession(result.session);
    if (error || (await bridge.checkAuth()).principal?.sessionKey !== identity) return false;
    verifiedIdentity = identity;
    validUntil = Math.min(Date.now() + 60000, result.session.expires_at * 1000 - 60000);
    return true;
  })();
  try { return await connecting; } finally { connecting = null; }
}
