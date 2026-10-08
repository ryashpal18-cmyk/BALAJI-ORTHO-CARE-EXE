import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const bridge = (window as any).electron;
        let allowed = false;
        if (bridge?.checkAuth) {
          const auth = await bridge.checkAuth();
          allowed = !!auth.valid && auth.principal?.role === 'admin';
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data, error } = await supabase.from('user_roles').select('role').eq('user_id',user.id).eq('role','admin').maybeSingle();
            allowed = !error && !!data;
          }
        }
        if (!cancelled) setIsAdmin(allowed);
      } catch { if (!cancelled) setIsAdmin(false); }
      finally { if (!cancelled) setLoading(false); }
    }
    void check();
    const timer = setInterval(check, 10000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  return { isAdmin, loading };
}
