import { supabase } from "@/integrations/supabase/client";
import { STORAGE_KEYS } from "./appConfig";

export function displaySession(profile: any) {
  localStorage.setItem(STORAGE_KEYS.IS_LOGGED_IN, "true");
  localStorage.setItem(STORAGE_KEYS.USER_NAME, profile.displayName || profile.email || "Admin");
  localStorage.setItem(STORAGE_KEYS.USER_ROLE, profile.role);
  localStorage.setItem(STORAGE_KEYS.USER_PERMS, JSON.stringify(profile.pages || []));
}

let connecting: Promise<boolean> | null = null;
let verifiedIdentity = "";
let validUntil = 0;
let lastCloudError = "";
let adoptionTried = false;
export function resetCloudConnection() { verifiedIdentity = ""; validUntil = 0; adoptionTried = false; lastCloudError = ""; }
export function cloudConnectionError() { return lastCloudError; }

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
    try {
      let result = await bridge.syncSession();
      // Migrate only this project's existing session. Never read old embedded passwords.
      if (!result?.success && !adoptionTried && bridge.adoptSyncSession) {
        adoptionTried = true;
        const current = (await supabase.auth.getSession()).data.session;
        const ref = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split(".")[0];
        let saved = current;
        if (!saved) {
          try { saved = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) || "null"); } catch {}
        }
        if (saved?.access_token && saved?.refresh_token && (await bridge.checkAuth()).principal?.sessionKey === identity) {
          await bridge.adoptSyncSession(saved);
          result = await bridge.syncSession();
          if (result?.success) localStorage.removeItem(`sb-${ref}-auth-token`);
        }
      }
      if (!result?.success) { lastCloudError = result?.error || "Settings → Cloud Sync में cloud connection जोड़ें"; return false; }
      if ((await bridge.checkAuth()).principal?.sessionKey !== identity) return false;
      const { error } = await supabase.auth.setSession(result.session);
      if (error) throw error;
      if ((await bridge.checkAuth()).principal?.sessionKey !== identity) {
        await supabase.auth.signOut({ scope: "local" }); return false;
      }
      verifiedIdentity = identity;
      validUntil = Math.min(Date.now() + 60000, result.session.expires_at * 1000 - 60000);
      lastCloudError = "";
      return true;
    } catch (error: any) { lastCloudError = error?.message || "Cloud connection unavailable"; return false; }
  })();
  try { return await connecting; } finally { connecting = null; }
}
