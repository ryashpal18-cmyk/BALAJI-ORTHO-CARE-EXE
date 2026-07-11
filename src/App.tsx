import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import React from "react";

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

import { useState, useEffect, useCallback } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ThemeProvider } from "@/lib/themeContext";
import { BranchProvider } from "@/lib/branchContext";
import { PinLockScreen } from "@/components/PinLockScreen";
import { shouldShowLock, markActive, isPinEnabled } from "@/lib/pinLock";
import { useAppointmentReminders } from "@/hooks/useAppointmentReminders";
import { BugAlertWatcher } from "@/components/BugAlertWatcher";
import Dashboard from "./pages/Dashboard";
import OPD from "./pages/OPD";
import IPD from "./pages/IPD";
import Appointments from "./pages/Appointments";
import Billing from "./pages/Billing";
import DueAmount from "./pages/DueAmount";
import CashTally from "./pages/CashTally";
import DailyCashBook from "./pages/DailyCashBook";
import MedicineCommission from "./pages/MedicineCommission";
import Physiotherapy from "./pages/Physiotherapy";
import Reports from "./pages/Reports";
import Analytics from "./pages/Analytics";
import RevenueDashboard from "./pages/RevenueDashboard";
import SettingsPage from "./pages/SettingsPage";
import WhatsApp from "./pages/WhatsApp";
import MedicineMaster from "./pages/MedicineMaster";
import PatientMedicine from "./pages/PatientMedicine";
import PatientProfile from "./pages/PatientProfile";
import Prescription from "./pages/Prescription";
import Ortho from "./pages/Ortho";
import RecoveryTracker from "./pages/RecoveryTracker";
import SmsLogs from "./pages/SmsLogs";
import PlasterSync from "./pages/PlasterSync";
import Inventory from "./pages/Inventory";
import AuditLog from "./pages/AuditLog";
import InsuranceClaims from "./pages/InsuranceClaims";
import Branches from "./pages/Branches";
import BookAppointment from "./pages/BookAppointment";
import BookingRequests from "./pages/BookingRequests";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// ✅ queryClient ab "@/lib/queryClient" se import hota hai — offlineSync.ts
// isi shared instance ko Background Sync ke baad invalidate karta hai
// (taaki useSearchPatients/usePatients turant fresh SQLite data dikhayein).

// QueryClientProvider ke ANDAR render hota hai, isliye useQuery yahan safe hai
function AppointmentReminders() {
  useAppointmentReminders();
  return null;
}

const App = () => {
  const [locked, setLocked] = useState(false);

  // ── App resume / inactivity ke baad PIN lock check ──
  useEffect(() => {
    if (!isPinEnabled()) return;
    if (shouldShowLock()) setLocked(true);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (shouldShowLock()) setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // har user interaction par "last active" timestamp refresh karo
  const trackActivity = useCallback(() => {
    if (!locked) markActive();
  }, [locked]);

  useEffect(() => {
    window.addEventListener("click", trackActivity);
    window.addEventListener("keydown", trackActivity);
    return () => {
      window.removeEventListener("click", trackActivity);
      window.removeEventListener("keydown", trackActivity);
    };
  }, [trackActivity]);

  const handleUnlock = () => {
    setLocked(false);
    markActive();
  };

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BranchProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <AppointmentReminders />
              <BugAlertWatcher />
              {locked && <PinLockScreen onUnlock={handleUnlock} />}
              <HashRouter>
                <Routes>
                  <Route path="/" element={<Login />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/book-appointment" element={<BookAppointment />} />
                  <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/opd" element={<ProtectedRoute><OPD /></ProtectedRoute>} />
                  <Route path="/ipd" element={<ProtectedRoute><IPD /></ProtectedRoute>} />
                  <Route path="/appointments" element={<ProtectedRoute><Appointments /></ProtectedRoute>} />
                  <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
                  <Route path="/due-amount" element={<ProtectedRoute><DueAmount /></ProtectedRoute>} />
                  <Route path="/cash-tally" element={<ProtectedRoute><CashTally /></ProtectedRoute>} />
                  <Route path="/daily-cash-book" element={<ProtectedRoute><DailyCashBook /></ProtectedRoute>} />
                  <Route path="/medicine-commission" element={<ProtectedRoute><MedicineCommission /></ProtectedRoute>} />
                  <Route path="/physiotherapy" element={<ProtectedRoute><Physiotherapy /></ProtectedRoute>} />
                  <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
                  <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
                  <Route path="/revenue-dashboard" element={<ProtectedRoute><RevenueDashboard /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                  <Route path="/whatsapp" element={<ProtectedRoute><WhatsApp /></ProtectedRoute>} />
                  <Route path="/medicine-master" element={<ProtectedRoute><MedicineMaster /></ProtectedRoute>} />
                  <Route path="/patient-medicine" element={<ProtectedRoute><PatientMedicine /></ProtectedRoute>} />
                  <Route path="/patient-profile/:id" element={<ProtectedRoute><PatientProfile /></ProtectedRoute>} />
                  <Route path="/prescription" element={<ProtectedRoute><Prescription /></ProtectedRoute>} />
                  <Route path="/ortho" element={<ProtectedRoute><Ortho /></ProtectedRoute>} />
                  <Route path="/recovery-tracker/:caseId" element={<ProtectedRoute><RecoveryTracker /></ProtectedRoute>} />
                  <Route path="/sms-logs" element={<ProtectedRoute><SmsLogs /></ProtectedRoute>} />
                  <Route path="/plaster-sync" element={<ProtectedRoute><PlasterSync /></ProtectedRoute>} />
                  <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
                  <Route path="/audit-log" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />
                  <Route path="/insurance-claims" element={<ProtectedRoute><InsuranceClaims /></ProtectedRoute>} />
                  <Route path="/branches" element={<ProtectedRoute><Branches /></ProtectedRoute>} />
                  <Route path="/booking-requests" element={<ProtectedRoute><BookingRequests /></ProtectedRoute>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </HashRouter>
            </TooltipProvider>
          </BranchProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
