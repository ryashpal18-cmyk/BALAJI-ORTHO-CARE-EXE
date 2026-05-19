import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [loading,       setLoading]       = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      // ── Offline check: localStorage mein login hai? ──
      const isLoggedIn = localStorage.getItem("isLoggedIn");
      if (isLoggedIn === "true") {
        setAuthenticated(true);
        setLoading(false);

        // Background mein Supabase session bhi refresh karo (optional)
        supabase.auth.getSession().catch(() => {});
        return;
      }

      // ── Online check: Supabase session ──
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          localStorage.setItem("isLoggedIn", "true");
          setAuthenticated(true);
        } else {
          setAuthenticated(false);
        }
      } catch (_) {
        setAuthenticated(false);
      }

      setLoading(false);
    };

    checkAuth();

    // Supabase auth change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        localStorage.setItem("isLoggedIn", "true");
        setAuthenticated(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!authenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
