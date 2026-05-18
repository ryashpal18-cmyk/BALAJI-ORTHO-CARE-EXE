import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import Reports from "./pages/Reports";
import Analytics from "./pages/Analytics";
import SettingsPage from "./pages/SettingsPage";
import WhatsApp from "./pages/WhatsApp";
import MedicineMaster from "./pages/MedicineMaster";
import PatientMedicine from "./pages/PatientMedicine";
import PatientProfile from "./pages/PatientProfile";
import Ortho from "./pages/Ortho";
import SmsLogs from "./pages/SmsLogs";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
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
          <Route path="/reports" element={<Reports />} />
          <Route
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
