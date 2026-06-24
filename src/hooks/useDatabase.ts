import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { offlineFetch, offlineFetchScoped, offlineInsert, offlineUpdate, offlineDelete } from "@/lib/offlineQuery";
import { cacheGetAll } from "@/lib/offlineDb";
import { isOnline } from "@/lib/offlineSync";

const QUERY_OPTS = {
  staleTime: 0,
  refetchOnMount: true as const,
  refetchOnWindowFocus: true,
  // Agar offline hain to bekaar retry na karo — cache se turant dikhao.
  retry: 1,
};

export function useDashboardStats() {
  const today = new Date().toISOString().split("T")[0];
  return useQuery({
    queryKey: ["dashboard-stats"],
    ...QUERY_OPTS,
    queryFn: async () => {
      const online = await isOnline();

      if (!online) {
        const [patients, appointments, billing, beds] = await Promise.all([
          cacheGetAll("patients"),
          cacheGetAll("appointments"),
          cacheGetAll("billing"),
          cacheGetAll("beds"),
        ]);
        const pendingBills = billing.filter((b: any) => ["Pending", "Partial"].includes(b.status));
        const todayBills = billing.filter((b: any) => (b.created_at || "").slice(0, 10) === today);
        const todayAppointments = appointments.filter((a: any) => a.date === today);
        const pendingTotal = pendingBills.reduce((sum: number, b: any) => sum + Math.max(Number(b.amount || 0) - Number(b.amount_paid || 0), 0), 0);
        const todayTotal = todayBills.reduce((sum: number, b: any) => sum + Number(b.amount || 0), 0);
        return {
          todayPatients: patients.length,
          todayAppointments: todayAppointments.length,
          pendingPayments: pendingTotal,
          bedsOccupied: beds.filter((b: any) => b.status === "occupied").length,
          totalBeds: beds.length,
          todayRevenue: todayTotal,
        };
      }

      try {
        const [patients, appointments, pendingBills, beds, todayBills] = await Promise.all([
          supabase.from("patients").select("id", { count: "exact", head: true }),
          supabase.from("appointments").select("id", { count: "exact", head: true }).eq("date", today),
          supabase.from("billing").select("amount, amount_paid, status").in("status", ["Pending", "Partial"]),
          supabase.from("beds").select("id, status"),
          supabase.from("billing").select("amount").gte("created_at", `${today}T00:00:00`).lte("created_at", `${today}T23:59:59`),
        ]);
        const pendingTotal = pendingBills.data?.reduce((sum, b) => sum + Math.max(Number(b.amount || 0) - Number((b as any).amount_paid || 0), 0), 0) || 0;
        const todayTotal = todayBills.data?.reduce((sum, b) => sum + Number(b.amount || 0), 0) || 0;
        return {
          todayPatients: patients.count || 0,
          todayAppointments: appointments.count || 0,
          pendingPayments: pendingTotal,
          bedsOccupied: beds.data?.filter(b => b.status === "occupied").length || 0,
          totalBeds: beds.data?.length || 0,
          todayRevenue: todayTotal,
        };
      } catch {
        // network blip — recurse into the offline branch's cache-based calc
        const [patients, appointments, billing, beds] = await Promise.all([
          cacheGetAll("patients"),
          cacheGetAll("appointments"),
          cacheGetAll("billing"),
          cacheGetAll("beds"),
        ]);
        const pendingBills = billing.filter((b: any) => ["Pending", "Partial"].includes(b.status));
        const todayBills = billing.filter((b: any) => (b.created_at || "").slice(0, 10) === today);
        const todayAppointments = appointments.filter((a: any) => a.date === today);
        const pendingTotal = pendingBills.reduce((sum: number, b: any) => sum + Math.max(Number(b.amount || 0) - Number(b.amount_paid || 0), 0), 0);
        const todayTotal = todayBills.reduce((sum: number, b: any) => sum + Number(b.amount || 0), 0);
        return {
          todayPatients: patients.length,
          todayAppointments: todayAppointments.length,
          pendingPayments: pendingTotal,
          bedsOccupied: beds.filter((b: any) => b.status === "occupied").length,
          totalBeds: beds.length,
          todayRevenue: todayTotal,
        };
      }
    },
  });
}

export function useTodayBills() {
  const today = new Date().toISOString().split("T")[0];
  return useQuery({
    queryKey: ["billing", "today"],
    ...QUERY_OPTS,
    queryFn: async () => {
      return offlineFetchScoped(
        "billing",
        async () => {
          const { data, error } = await supabase.from("billing").select("*, patients(name, mobile, address)").gte("created_at", `${today}T00:00:00`).lte("created_at", `${today}T23:59:59`).order("created_at", { ascending: false });
          if (error) throw error;
          return data || [];
        },
        (cached) => cached.filter((b: any) => (b.created_at || "").slice(0, 10) === today)
      );
    },
  });
}

export function usePendingBills() {
  return useQuery({
    queryKey: ["billing", "pending"],
    ...QUERY_OPTS,
    queryFn: async () => {
      return offlineFetchScoped(
        "billing",
        async () => {
          const { data, error } = await supabase.from("billing").select("*, patients(name, mobile, address)").in("status", ["Pending", "Partial"]).order("created_at", { ascending: false });
          if (error) throw error;
          return data || [];
        },
        (cached) => cached.filter((b: any) => ["Pending", "Partial"].includes(b.status))
      );
    },
  });
}

export function useBills() {
  return useQuery({
    queryKey: ["billing", "all"],
    staleTime: 0,
    refetchOnMount: true,
    queryFn: async () => {
      return offlineFetch("billing", async () => {
        const { data, error } = await supabase.from("billing").select("*, patients(name, mobile, address)").order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      });
    },
  });
}

export function usePatients() {
  return useQuery({
    queryKey: ["patients"],
    staleTime: 0,
    refetchOnMount: true,
    queryFn: async () => {
      const rows = await offlineFetch("patients", async () => {
        const { data, error } = await supabase.from("patients").select("*").order("name");
        if (error) throw error;
        return data || [];
      });
      return [...rows].sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
    },
  });
}

export function useUpdateBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bill: { id: string; amount: number; amount_paid: number; status: string; service?: string; payment_mode?: string }) => {
      const updateData: any = { amount: bill.amount, amount_paid: bill.amount_paid, status: bill.status };
      if (bill.service !== undefined) updateData.service = bill.service;
      if (bill.payment_mode !== undefined) updateData.payment_mode = bill.payment_mode;
      return offlineUpdate("billing", bill.id, updateData);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
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
      return offlineFetchScoped(
        "appointments",
        async () => {
          const { data, error } = await supabase.from("appointments").select("*, patients(name, mobile)").eq("date", today).order("time");
          if (error) throw error;
          return data || [];
        },
        (cached) => cached.filter((a: any) => a.date === today).sort((a: any, b: any) => (a.time || "").localeCompare(b.time || ""))
      );
    },
  });
}

export function usePrescriptions() {
  return useQuery({
    queryKey: ["prescriptions"],
    staleTime: 30000,
    queryFn: async () => {
      const rows = await offlineFetch("prescriptions", async () => {
        const { data, error } = await supabase.from("prescriptions").select("*, patients(name)").order("created_at", { ascending: false }).limit(20);
        if (error) throw error;
        return data || [];
      });
      return [...rows].sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || "")).slice(0, 20);
    },
  });
}

export function usePhysioSessions() {
  return useQuery({
    queryKey: ["physio_sessions"],
    staleTime: 30000,
    queryFn: async () => {
      const rows = await offlineFetch("physiotherapy_sessions", async () => {
        const { data, error } = await supabase.from("physiotherapy_sessions").select("*, patients(name)").order("created_at", { ascending: false }).limit(20);
        if (error) throw error;
        return data || [];
      });
      return [...rows].sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || "")).slice(0, 20);
    },
  });
}

export function useReportPayments() {
  return useQuery({
    queryKey: ["report_payments"],
    staleTime: 30000,
    queryFn: async () => {
      const rows = await offlineFetchScoped(
        "billing",
        async () => {
          const { data, error } = await supabase.from("billing").select("amount, amount_paid, created_at, status").eq("status", "Paid").order("created_at", { ascending: false });
          if (error) throw error;
          return data || [];
        },
        (cached) => cached.filter((b: any) => b.status === "Paid")
      );
      return (rows || []).map((b: any) => ({ amount: Number(b.amount_paid || b.amount || 0), payment_date: b.created_at?.slice(0, 10) }));
    },
  });
}

export function useAddBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bill: any) => offlineInsert("billing", bill),
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
      const id = typeof arg === "string" ? arg : arg.id;
      const logData = typeof arg === "string" ? null : arg.logData;
      const online = await isOnline();
      if (logData && online) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          await supabase.from("deleted_records_log" as any).insert({
            table_name: "billing",
            record_id: id,
            record_data: logData,
            deleted_by: user?.id,
          } as any);
        } catch { /* logging failure shouldn't block the delete */ }
      }
      if (online && !id.startsWith("local_")) {
        try { await supabase.from("payments").delete().eq("billing_id", id); } catch { /* best effort */ }
      }
      await offlineDelete("billing", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function saveLocalData(type: string, data: any) {
  try {
    const existing = JSON.parse(localStorage.getItem(`local_${type}`) || "[]");
    existing.push({ ...data, savedAt: new Date().toISOString() });
    localStorage.setItem(`local_${type}`, JSON.stringify(existing));
  } catch {}
}

// ─── Restored hooks for existing pages ───
export function useAppointments() {
  return useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const rows = await offlineFetch("appointments", async () => {
        const { data, error } = await supabase
          .from("appointments")
          .select("*, patients(name, mobile)")
          .order("date", { ascending: false })
          .order("time_slot", { ascending: true });
        if (error) throw error;
        return data || [];
      });
      return [...rows].sort((a: any, b: any) => {
        const d = (b.date || "").localeCompare(a.date || "");
        if (d !== 0) return d;
        return (a.time_slot || "").localeCompare(b.time_slot || "");
      });
    },
  });
}

export function useAddAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: any) => offlineInsert("appointments", a),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
}

export function useUpdateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, any>) => offlineUpdate("appointments", id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
}

export function useBeds() {
  return useQuery({
    queryKey: ["beds"],
    queryFn: async () => {
      const rows = await offlineFetch("beds", async () => {
        const { data, error } = await supabase
          .from("beds")
          .select("*, patients(name)")
          .order("bed_number", { ascending: true });
        if (error) throw error;
        return data as any[] || [];
      });
      return [...rows].sort((a: any, b: any) => Number(a.bed_number) - Number(b.bed_number));
    },
  });
}

export function useUpdateBed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, any>) => offlineUpdate("beds", id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["beds"] }),
  });
}

export function useAddPatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: any) => offlineInsert("patients", p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patients"] }),
  });
}

export function useSearchPatients(search: string) {
  return useQuery({
    queryKey: ["patients", "search", search],
    queryFn: async () => {
      if (!search) return [] as any[];
      const online = await isOnline();
      if (online) {
        try {
          const { data, error } = await supabase
            .from("patients")
            .select("*")
            .or(`name.ilike.%${search}%,mobile.ilike.%${search}%`)
            .limit(20);
          if (error) throw error;
          return data as any[];
        } catch {
          // fall through to offline cache search below
        }
      }
      const cached = await cacheGetAll("patients");
      const term = search.toLowerCase();
      return cached
        .filter((p: any) => (p.name || "").toLowerCase().includes(term) || (p.mobile || "").includes(search))
        .slice(0, 20);
    },
    enabled: search.length > 0,
  });
}

export function useAddPrescription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: any) => offlineInsert("prescriptions", p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prescriptions"] }),
  });
}

export function useAddPhysioSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: any) => offlineInsert("physiotherapy_sessions", s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["physio_sessions"] }),
  });
}

export function useXrayReports() {
  return useQuery({
    queryKey: ["xray_reports"],
    queryFn: async () => {
      const rows = await offlineFetch("xray_reports", async () => {
        const { data, error } = await supabase
          .from("xray_reports")
          .select("*, patients(name)")
          .order("uploaded_at", { ascending: false });
        if (error) throw error;
        return data as any[] || [];
      });
      return [...rows].sort((a: any, b: any) => (b.uploaded_at || "").localeCompare(a.uploaded_at || ""));
    },
  });
}

export function useAddXrayReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: any) => offlineInsert("xray_reports", r),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["xray_reports"] }),
  });
}

export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, logData }: { id: string; logData?: any }) => {
      const online = await isOnline();
      if (online) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (logData) {
            await supabase.from("deleted_records_log" as any).insert({
              table_name: "patients",
              record_id: id,
              record_data: logData,
              deleted_by: user?.id,
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
          await offlineDelete("patients", id); // also clears local cache copy
          return;
        } catch {
          // fall through to offline-only delete below
        }
      }
      // Offline: queue the patient delete; related-table cleanup will run
      // once connectivity is back (admin can re-run delete then if needed).
      await offlineDelete("patients", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}
