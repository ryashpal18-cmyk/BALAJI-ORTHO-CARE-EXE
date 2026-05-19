/**
 * useDatabase.ts — Offline-First Data Hooks
 * 
 * Logic:
 * - Electron app mein: window.electron (IPC) se local JSON files se data aata hai
 * - Browser / online fallback: Supabase se data aata hai
 * - Koi error nahi aayega — dono cases handle hain
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Helper: Electron available hai? ─────────────────────────────────────────
const isElectron = () => typeof window !== 'undefined' && !!(window as any).electron;

// ─── Helper: Supabase error ko quietly handle karo ───────────────────────────
function safeSupabase<T>(promise: Promise<{ data: T | null; error: any }>): Promise<T> {
  return promise.then(({ data, error }) => {
    if (error) throw error;
    return data as T;
  });
}

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════
export function useDashboardStats() {
  const today = new Date().toISOString().split("T")[0];

  return useQuery({
    queryKey: ["dashboard-stats"],
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // ── Electron (offline) ──
      if (isElectron()) {
        try {
          const res = await (window as any).electron.getStats();
          if (res?.success) {
            return {
              todayPatients:    res.data.todayPatients    || 0,
              todayAppointments:res.data.todayAppointments|| 0,
              pendingPayments:  res.data.pendingPayments  || 0,
              bedsOccupied:     res.data.bedsOccupied     || 0,
              totalBeds:        res.data.totalBeds        || 0,
              todayRevenue:     res.data.todayRevenue     || 0,
              pendingSync:      res.data.pendingSync      || 0,
            };
          }
        } catch (_) {}
      }

      // ── Supabase (online fallback) ──
      try {
        const [patients, appointments, pendingBills, beds, todayBills] = await Promise.all([
          supabase.from("patients").select("id", { count: "exact", head: true }),
          supabase.from("appointments").select("id", { count: "exact", head: true }).eq("date", today),
          supabase.from("billing").select("amount, amount_paid, status").in("status", ["Pending", "Partial"]),
          supabase.from("beds").select("id, status"),
          supabase.from("billing").select("amount").gte("created_at", `${today}T00:00:00`).lte("created_at", `${today}T23:59:59`),
        ]);
        const pendingTotal = pendingBills.data?.reduce((sum, b) => sum + Math.max(Number(b.amount || 0) - Number((b as any).amount_paid || 0), 0), 0) || 0;
        const todayTotal   = todayBills.data?.reduce((sum, b) => sum + Number(b.amount || 0), 0) || 0;
        return {
          todayPatients:     patients.count     || 0,
          todayAppointments: appointments.count || 0,
          pendingPayments:   pendingTotal,
          bedsOccupied:      beds.data?.filter(b => b.status === "occupied").length || 0,
          totalBeds:         beds.data?.length  || 0,
          todayRevenue:      todayTotal,
          pendingSync:       0,
        };
      } catch (_) {
        return { todayPatients: 0, todayAppointments: 0, pendingPayments: 0, bedsOccupied: 0, totalBeds: 0, todayRevenue: 0, pendingSync: 0 };
      }
    },
  });
}

// ═══════════════════════════════════════════════════════════════
//  PATIENTS
// ═══════════════════════════════════════════════════════════════
export function usePatients() {
  return useQuery({
    queryKey: ["patients"],
    staleTime: 30000,
    queryFn: async () => {
      if (isElectron()) {
        try {
          const res = await (window as any).electron.getAllPatients();
          if (res?.success) return res.data || [];
        } catch (_) {}
      }
      const { data, error } = await supabase.from("patients").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });
}

export function useSearchPatients(search: string) {
  return useQuery({
    queryKey: ["patients", "search", search],
    enabled: search.length > 0,
    queryFn: async () => {
      if (!search) return [] as any[];

      if (isElectron()) {
        try {
          const res = await (window as any).electron.searchPatients(search);
          if (res?.success) return res.data || [];
        } catch (_) {}
      }

      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .or(`name.ilike.%${search}%,mobile.ilike.%${search}%`)
        .limit(20);
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useAddPatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: any) => {
      // ── Electron: local mein save karo ──
      if (isElectron()) {
        try {
          const res = await (window as any).electron.savePatient(p);
          if (res?.success) return res.data;
        } catch (_) {}
      }
      // ── Supabase fallback ──
      const { data, error } = await supabase.from("patients").insert(p).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patients"] }),
  });
}

export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, logData }: { id: string; logData?: any }) => {
      if (!isElectron()) {
        // Supabase delete (online only)
        const { data: { user } } = await supabase.auth.getUser();
        if (logData) {
          await supabase.from("deleted_records_log" as any).insert({
            table_name: "patients", record_id: id, record_data: logData, deleted_by: user?.id,
          } as any);
        }
        await supabase.from("appointments").delete().eq("patient_id", id);
        await supabase.from("prescriptions").delete().eq("patient_id", id);
        await supabase.from("billing").delete().eq("patient_id", id);
        await supabase.from("physiotherapy_sessions").delete().eq("patient_id", id);
        await supabase.from("xray_reports").delete().eq("patient_id", id);
        await supabase.from("medical_history").delete().eq("patient_id", id);
        const { error } = await supabase.from("patients").delete().eq("id", id);
        if (error) throw error;
      }
      // Electron: local JSON se remove (future enhancement)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════
//  BILLING
// ═══════════════════════════════════════════════════════════════
export function useTodayBills() {
  const today = new Date().toISOString().split("T")[0];
  return useQuery({
    queryKey: ["billing", "today"],
    staleTime: 0,
    refetchOnMount: true,
    queryFn: async () => {
      if (isElectron()) {
        try {
          const res = await (window as any).electron.getBills(null);
          if (res?.success) {
            return (res.data || []).filter((b: any) =>
              (b.created_at || '').startsWith(today)
            );
          }
        } catch (_) {}
      }
      const { data, error } = await supabase
        .from("billing")
        .select("*, patients(name, mobile, address)")
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function usePendingBills() {
  return useQuery({
    queryKey: ["billing", "pending"],
    staleTime: 0,
    refetchOnMount: true,
    queryFn: async () => {
      if (isElectron()) {
        try {
          const res = await (window as any).electron.getBills(null);
          if (res?.success) {
            return (res.data || []).filter((b: any) =>
              b.status === 'Pending' || b.status === 'Partial'
            );
          }
        } catch (_) {}
      }
      const { data, error } = await supabase
        .from("billing")
        .select("*, patients(name, mobile, address)")
        .in("status", ["Pending", "Partial"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useBills() {
  return useQuery({
    queryKey: ["billing", "all"],
    staleTime: 0,
    refetchOnMount: true,
    queryFn: async () => {
      if (isElectron()) {
        try {
          const res = await (window as any).electron.getBills(null);
          if (res?.success) return res.data || [];
        } catch (_) {}
      }
      const { data, error } = await supabase
        .from("billing")
        .select("*, patients(name, mobile, address)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAddBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bill: any) => {
      if (isElectron()) {
        try {
          const res = await (window as any).electron.saveBill(bill);
          if (res?.success) return res.data;
        } catch (_) {}
      }
      const { data, error } = await supabase.from("billing").insert(bill).select("*, patients(name, mobile)").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useUpdateBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bill: { id: string; amount: number; amount_paid: number; status: string }) => {
      if (!isElectron()) {
        const { data, error } = await supabase.from("billing").update({ amount: bill.amount, amount_paid: bill.amount_paid, status: bill.status }).eq("id", bill.id).select().single();
        if (error) throw error;
        return data;
      }
      return bill;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useDeleteBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (arg: string | { id: string; logData?: any }) => {
      if (isElectron()) return; // local delete future mein
      const id = typeof arg === "string" ? arg : arg.id;
      const logData = typeof arg === "string" ? null : arg.logData;
      if (logData) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("deleted_records_log" as any).insert({ table_name: "billing", record_id: id, record_data: logData, deleted_by: user?.id } as any);
      }
      await supabase.from("payments").delete().eq("billing_id", id);
      const { error } = await supabase.from("billing").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════
//  APPOINTMENTS
// ═══════════════════════════════════════════════════════════════
export function useAppointments() {
  return useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(name, mobile)")
        .order("date", { ascending: false })
        .order("time_slot", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useTodayAppointments() {
  const today = new Date().toISOString().split("T")[0];
  return useQuery({
    queryKey: ["appointments", "today"],
    staleTime: 0,
    refetchOnMount: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(name, mobile)")
        .eq("date", today)
        .order("time");
      if (error) throw error;
      return data;
    },
  });
}

export function useAddAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: any) => {
      const { data, error } = await supabase.from("appointments").insert(a).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
}

export function useUpdateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, any>) => {
      const { data, error } = await supabase.from("appointments").update(updates as never).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
}

// ═══════════════════════════════════════════════════════════════
//  BEDS / IPD
// ═══════════════════════════════════════════════════════════════
export function useBeds() {
  return useQuery({
    queryKey: ["beds"],
    queryFn: async () => {
      const { data, error } = await supabase.from("beds").select("*, patients(name)").order("bed_number", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useUpdateBed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, any>) => {
      const { data, error } = await supabase.from("beds").update(updates as never).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["beds"] }),
  });
}

// ═══════════════════════════════════════════════════════════════
//  PRESCRIPTIONS & PHYSIO
// ═══════════════════════════════════════════════════════════════
export function usePrescriptions() {
  return useQuery({
    queryKey: ["prescriptions"],
    staleTime: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.from("prescriptions").select("*, patients(name)").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
  });
}

export function useAddPrescription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: any) => {
      const { data, error } = await supabase.from("prescriptions").insert(p).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prescriptions"] }),
  });
}

export function usePhysioSessions() {
  return useQuery({
    queryKey: ["physio_sessions"],
    staleTime: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.from("physiotherapy_sessions").select("*, patients(name)").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
  });
}

export function useAddPhysioSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: any) => {
      const { data, error } = await supabase.from("physiotherapy_sessions").insert(s).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["physio_sessions"] }),
  });
}

// ═══════════════════════════════════════════════════════════════
//  X-RAY REPORTS
// ═══════════════════════════════════════════════════════════════
export function useXrayReports() {
  return useQuery({
    queryKey: ["xray_reports"],
    queryFn: async () => {
      if (isElectron()) {
        try {
          const res = await (window as any).electron.getXrays(null);
          if (res?.success) return res.data || [];
        } catch (_) {}
      }
      const { data, error } = await supabase.from("xray_reports").select("*, patients(name)").order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useAddXrayReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: any) => {
      if (isElectron()) {
        try {
          const res = await (window as any).electron.saveXray(r);
          if (res?.success) return res.data;
        } catch (_) {}
      }
      const { data, error } = await supabase.from("xray_reports").insert(r).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["xray_reports"] }),
  });
}

// ═══════════════════════════════════════════════════════════════
//  ANALYTICS
// ═══════════════════════════════════════════════════════════════
export function useReportPayments() {
  return useQuery({
    queryKey: ["report_payments"],
    staleTime: 30000,
    queryFn: async () => {
      if (isElectron()) {
        try {
          const res = await (window as any).electron.getBills(null);
          if (res?.success) {
            return (res.data || [])
              .filter((b: any) => b.status === 'Paid')
              .map((b: any) => ({ amount: Number(b.amount_paid || b.amount || 0), payment_date: (b.created_at || '').slice(0, 10) }));
          }
        } catch (_) {}
      }
      const { data, error } = await supabase.from("billing").select("amount, amount_paid, created_at, status").eq("status", "Paid").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(b => ({ amount: Number(b.amount_paid || b.amount || 0), payment_date: b.created_at?.slice(0, 10) }));
    },
  });
}

// ═══════════════════════════════════════════════════════════════
//  LOCAL DATA SAVE (legacy)
// ═══════════════════════════════════════════════════════════════
export function saveLocalData(type: string, data: any) {
  try {
    if (isElectron()) {
      (window as any).ipcRenderer?.send('save-offline-data', `${type}.json`, data);
      return;
    }
    const existing = JSON.parse(localStorage.getItem(`local_${type}`) || "[]");
    existing.push({ ...data, savedAt: new Date().toISOString() });
    localStorage.setItem(`local_${type}`, JSON.stringify(existing));
  } catch {}
}
