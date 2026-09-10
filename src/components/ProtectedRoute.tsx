import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const electron = (window as any).electron;
        const localSession = sessionStorage.getItem("boccAuthenticated") === "true";
        const result = electron?.checkAuth ? await electron.checkAuth() : null;
        setAuthenticated(Boolean(result?.valid || localSession));
      } catch {
        setAuthenticated(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  if (!authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
