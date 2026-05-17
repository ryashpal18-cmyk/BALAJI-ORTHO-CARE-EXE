import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useDashboardStats() {
  const today = new Date().toISOString().split("T")[0];
  return useQuery({
    queryKey: ["dashboard-stats"],
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    queryFn: async () => {
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
    },
  });
}

export function useTodayBills() {
  const today = new Date().toISOString().split("T")[0];
  return useQuery({
    queryKey: ["billing", "today"],
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.from("billing").select("*, patients(name, mobile, address)").gte("created_at", `${today}T00:00:00`).lte("created_at", `${today}T23:59:59`).order("created_at", { ascending: false });
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
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.from("billing").select("*, patients(name, mobile, address)").in("status", ["Pending", "Partial"]).order("created_at", { ascending: false });
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
      const { data, error } = await supabase.from("billing").select("*, patients(name, mobile, address)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function usePatients() {
  return useQuery({
    queryKey: ["patients"],
    staleTime: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.from("patients").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bill: { id: string; amount: number; amount_paid: number; status: string }) => {
      const { data, error } = await supabase.from("billing").update({ amount: bill.amount, amount_paid: bill.amount_paid, status: bill.status }).eq("id", bill.id).select().single();
      if (error) throw error;
      return data;
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
      const { data, error } = await supabase.from("appointments").select("*, patients(name, mobile)").eq("date", today).order("time");
      if (error) throw error;
      return data;
    },
  });
}

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

export function useReportPayments() {
  return useQuery({
    queryKey: ["report_payments"],
    staleTime: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.from("billing").select("amount, amount_paid, created_at, status").eq("status", "Paid").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(b => ({ amount: Number(b.amount_paid || b.amount || 0), payment_date: b.created_at?.slice(0, 10) }));
    },
  });
}

export function useAddBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bill: any) => {
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

export function useDeleteBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (arg: string | { id: string; logData?: any }) => {
      const id = typeof arg === "string" ? arg : arg.id;
      const logData = typeof arg === "string" ? null : arg.logData;
      if (logData) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("deleted_records_log" as any).insert({
          table_name: "billing",
          record_id: id,
          record_data: logData,
          deleted_by: user?.id,
        } as any);
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

export function useBeds() {
  return useQuery({
    queryKey: ["beds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beds")
        .select("*, patients(name)")
        .order("bed_number", { ascending: true });
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

export function useAddPatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: any) => {
      const { data, error } = await supabase.from("patients").insert(p).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patients"] }),
  });
}

export function useSearchPatients(search: string) {
  return useQuery({
    queryKey: ["patients", "search", search],
    queryFn: async () => {
      if (!search) return [] as any[];
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .or(`name.ilike.%${search}%,mobile.ilike.%${search}%`)
        .limit(20);
      if (error) throw error;
      return data as any[];
    },
    enabled: search.length > 0,
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

export function useXrayReports() {
  return useQuery({
    queryKey: ["xray_reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("xray_reports")
        .select("*, patients(name)")
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useAddXrayReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: any) => {
      const { data, error } = await supabase.from("xray_reports").insert(r).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["xray_reports"] }),
  });
}

export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, logData }: { id: string; logData?: any }) => {
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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}
