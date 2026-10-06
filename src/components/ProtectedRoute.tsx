import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { STORAGE_KEYS } from "@/lib/appConfig";
function pageFor(path: string) {
  if (path.startsWith("/patient-profile/")) return "/opd";
  if (path.startsWith("/recovery-tracker/")) return "/ortho";
  return path;
}
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [result, setResult] = useState<{ loading: boolean; profile: any }>({ loading: true, profile: null });
  useEffect(() => {
    let live = true;
    const check = async () => {
      try {
        let profile;
        const bridge = (window as any).electron;
        if (bridge?.checkAuth) {
          let res = await bridge.checkAuth();
          if (res.principal && navigator.onLine) {
            try { const { data: { session } } = await supabase.auth.getSession(); if (session) await bridge.establishSession(session.access_token); }
            catch { /* A transport outage can use the bounded, previously verified desktop session. */ }
            res = await bridge.checkAuth();
          }
          profile = res.valid ? res.principal : null;
        }
        else { const { data, error } = await supabase.functions.invoke("session-access"); if (error) throw error; profile = data; }
        if (live) {
          if (profile) {
            localStorage.setItem(STORAGE_KEYS.USER_ROLE, profile.role);
            localStorage.setItem(STORAGE_KEYS.USER_PERMS, JSON.stringify(profile.pages || []));
          }
          setResult({ loading: false, profile });
        }
      } catch { if (live) setResult({ loading: false, profile: null }); }
    };
    setResult({ loading: true, profile: null }); void check();
    const interval = setInterval(check, 60000);
    return () => { live = false; clearInterval(interval); };
  }, [pathname]);
  if (result.loading) return <div className="p-8">Checking access…</div>;
  if (!result.profile) return <Navigate to="/login" replace />;
  const allowed = result.profile.role === "admin" || (result.profile.pages || []).includes(pageFor(pathname));
  if (!allowed) return <div className="p-8"><h2>Access denied</h2><p>इस पेज की अनुमति नहीं है। Admin से संपर्क करें।</p><a href={`#${result.profile.pages?.[0] || "/login"}`}>वापस जाएँ</a></div>;
  return <>{children}</>;
}
