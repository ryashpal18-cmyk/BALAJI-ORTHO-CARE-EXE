import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ✅ ErrorBoundary - white screen ki jagah error message dikhega
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: error?.message || String(error) };
  }
  componentDidCatch(error: any, info: any) {
    console.error("App crash:", error, info);
    // Stack trace bhi state mein save karo
    const stack = info?.componentStack || "";
    this.setState(s => ({ error: s.error + "\n\nComponent Stack:" + stack.slice(0, 500) }));
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, fontFamily: "sans-serif", color: "#1e293b" }}>
          <h2 style={{ color: "#dc2626", marginBottom: 8 }}>⚠️ Kuch galat hua</h2>
          <p style={{ color: "#64748b", marginBottom: 16 }}>Error detail (screenshot lo aur developer ko bhejo):</p>
          <pre style={{ background: "#f1f5f9", padding: 12, borderRadius: 8, fontSize: 11, overflowX: "auto", whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto" }}>
            {this.state.error}
          </pre>
          <button
            onClick={() => { this.setState({ hasError: false, error: "" }); window.location.reload(); }}
            style={{ marginTop: 16, padding: "8px 20px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}
          >
            🔄 Reload karo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { HashRouter, Routes, Route } from "react-router-dom"
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import OPD from "./pages/OPD";
import IPD from "./pages/IPD";
import Appointments from "./pages/Appointments";
import Billing from "./pages/Billing";
import CashTally from "./pages/CashTally";
import MedicineCommission from "./pages/MedicineCommission";
import Physiotherapy from "./pages/Physiotherapy";
import Analytics from "./pages/Analytics";
import SettingsPage from "./pages/SettingsPage";
import WhatsApp from "./pages/WhatsApp";
import MedicineMaster from "./pages/MedicineMaster";
import PatientMedicine from "./pages/PatientMedicine";
import PatientProfile from "./pages/PatientProfile";
import Ortho from "./pages/Ortho";
import SmsLogs from "./pages/SmsLogs";
import PlasterSync from "./pages/PlasterSync";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/opd"
            element={
              <ProtectedRoute>
                <OPD />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ipd"
            element={
              <ProtectedRoute>
                <IPD />
              </ProtectedRoute>
            }
          />
          <Route
            path="/appointments"
            element={
              <ProtectedRoute>
                <Appointments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing"
            element={
              <ProtectedRoute>
                <Billing />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cash-tally"
            element={
              <ProtectedRoute>
                <CashTally />
              </ProtectedRoute>
            }
          />
          <Route
            path="/medicine-commission"
            element={
              <ProtectedRoute>
                <MedicineCommission />
              </ProtectedRoute>
            }
          />
          <Route
            path="/physiotherapy"
            element={
              <ProtectedRoute>
                <Physiotherapy />
              </ProtectedRoute>
            }
          />
            path="/analytics"
            element={
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/whatsapp"
            element={
              <ProtectedRoute>
                <WhatsApp />
              </ProtectedRoute>
            }
          />
          <Route path="/medicine-master" element={<ProtectedRoute><MedicineMaster /></ProtectedRoute>} />
          <Route path="/patient-medicine" element={<ProtectedRoute><PatientMedicine /></ProtectedRoute>} />
          <Route path="/patient-profile/:id" element={<ProtectedRoute><PatientProfile /></ProtectedRoute>} />
          <Route path="/ortho" element={<ProtectedRoute><Ortho /></ProtectedRoute>} />
          <Route path="/sms-logs" element={<ProtectedRoute><SmsLogs /></ProtectedRoute>} />
          <Route path="/plaster-sync" element={<ProtectedRoute><PlasterSync /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
