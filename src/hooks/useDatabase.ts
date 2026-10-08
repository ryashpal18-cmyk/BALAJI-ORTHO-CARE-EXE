import { useBranchContext } from "@/lib/branchContext";
import { readBranchTable } from "@/lib/branchData";
import { businessDayStart, businessDayEnd } from "@/lib/businessDate";
import { businessDate } from "@/lib/businessDate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { offlineFetch, offlineFetchScoped, offlineInsert, offlineUpdate, offlineDelete } from "@/lib/offlineQuery";
import { cLog } from "@/lib/clientLogger";
import { cacheGetAll, cacheReplaceTable } from "@/lib/offlineDb";
import { isOnline } from "@/lib/offlineSync";

const QUERY_OPTS = {
  staleTime: 0,
  refetchOnMount: true as const,
  refetchOnWindowFocus: true,
  // Agar offline hain to bekaar retry na karo — cache se turant dikhao.
  retry: 1,
};

export function useDashboardStats() {
  const { selectedBranchId } = useBranchContext(); const today = businessDate();
  return useQuery({ queryKey: ["dashboard-stats", selectedBranchId, today], ...QUERY_OPTS,
    queryFn: async () => {
      const [patients, appointments, billing, beds] = await Promise.all([
        readBranchTable("patients", selectedBranchId), readBranchTable("appointments", selectedBranchId),
        readBranchTable("billing", selectedBranchId), cacheGetAll("beds")]);
      return { todayPatients: patients.length, todayAppointments: appointments.filter(a => a.date === today).length,
        pendingPayments: billing.reduce((sum,b) => sum + Math.max(Number(b.amount || 0)-Number(b.discount || 0)-Number(b.amount_paid || 0),0),0),
        todayRevenue: billing.filter(b => businessDate(b.created_at) === today).reduce((sum,b) => sum+Number(b.amount || 0),0),
        bedsOccupied: beds.filter(b => b.status === "occupied").length, totalBeds: beds.length };
    } });
}

export function useTodayBills() {
  const { selectedBranchId } = useBranchContext(); const today = businessDate();
  return useQuery({ queryKey: ["billing", "today", selectedBranchId, today], ...QUERY_OPTS,
    queryFn: async () => (await readBranchTable("billing", selectedBranchId, "*, patients(name, mobile, address)")).filter(b => businessDate(b.created_at) === today) });
}

export function usePendingBills() {
  const { selectedBranchId } = useBranchContext();
  return useQuery({ queryKey: ["billing", "pending", selectedBranchId], ...QUERY_OPTS,
    queryFn: async () => (await readBranchTable("billing", selectedBranchId, "*, patients(name, mobile, address)")).filter(b => ["Pending", "Partial"].includes(b.status)) });
}

export function useBills(scope: "selected" | "clinic" = "selected") {
  const { selectedBranchId } = useBranchContext();
  const branch = scope === "clinic" ? null : selectedBranchId;
  return useQuery({ queryKey: ["billing", "all", branch], ...QUERY_OPTS,
    queryFn: async () => (await readBranchTable("billing", branch, "*, patients(name, mobile, address)")).sort((a,b) => (b.created_at || "").localeCompare(a.created_at || "")) });
}

export function usePatients() {
  const { selectedBranchId } = useBranchContext();
  return useQuery({ queryKey: ["patients", selectedBranchId], ...QUERY_OPTS,
    queryFn: async () => (await readBranchTable("patients", selectedBranchId)).sort((a,b) => (a.name || "").localeCompare(b.name || "")) });
}

export function useUpdateBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bill: { id: string; amount: number; amount_paid: number; status: string; service?: string; payment_mode?: string; discount?: number | null }) => {
      const updateData: any = { amount: bill.amount, amount_paid: bill.amount_paid, status: bill.status };
      if (bill.service !== undefined) updateData.service = bill.service;
      if (bill.payment_mode !== undefined) updateData.payment_mode = bill.payment_mode;
      // 🚨 FIX: "discount" field yahan missing tha — Edit Bill dialog mein discount
      // badalne par woh save hi nahi hota tha (chupchaap drop ho jaata tha).
      if (bill.discount !== undefined) updateData.discount = bill.discount;
      // 🆕 FIX: online sync hone tak "Edited" date UI me nahi dikhti thi
      // (Supabase trigger updated_at sirf real DB update par set karta hai).
      // Ab offline save hote hi bhi local updated_at turant set ho jaata hai,
      // list/dialog me "Edited: <date>" turant dikhega, sync baad me ho jaaye.
      updateData.updated_at = new Date().toISOString();
      return offlineUpdate("billing", bill.id, updateData);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useTodayAppointments() {
  const { selectedBranchId } = useBranchContext(); const today = businessDate();
  return useQuery({ queryKey: ["appointments", "today", selectedBranchId, today], ...QUERY_OPTS,
    queryFn: async () => (await readBranchTable("appointments", selectedBranchId, "*, patients(name, mobile)")).filter(a => a.date === today).sort((a,b) => (a.time_slot || "").localeCompare(b.time_slot || "")) });
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
        const { data, error } = await supabase.from("physiotherapy_sessions").select("*, patients(name)").order("created_at", { ascending: false }).limit(500); // ✅ 20 → 500
        if (error) throw error;
        return data || [];
      });
      return [...rows].sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""));
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
      return (rows || []).map((b: any) => ({ amount: Number(b.amount_paid || b.amount || 0), payment_date: businessDate(b.created_at || "") }));
    },
  });
}

export function useAddBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bill: any) => {
      // 🚨 FIX: pehle patient ka naam sirf onSuccess mein, sirf in-memory
      // (react-query cache) ke liye attach hota tha — IndexedDB (disk) mein
      // kabhi save nahi hota tha. Isliye app restart ya offline reload ke
      // baad us bill ka patient naam gayab dikhta tha. Ab yahan, save hone
      // SE PEHLE hi patient info payload mein jod dete hain — taaki disk pe
      // bhi hamesha ke liye save ho jaaye.
      let payload = { ...bill };
      if (!payload.patients && payload.patient_id) {
        try {
          const cachedPatients = await cacheGetAll("patients");
          const p = cachedPatients.find((p: any) => p.id === payload.patient_id);
          if (p) {
            payload.patients = { name: p.name || "", mobile: p.mobile || "", address: p.address || "" };
          } else if (typeof navigator !== "undefined" && navigator.onLine) {
            // 🚨 FIX (strict offline-first): cache mein nahi mila to yahan
            // AWAIT karke Supabase call se UI ko block nahi karte. Insert
            // turant proceed karta hai; naam background mein resolve hoke
            // billing cache mein patch ho jaata hai jab tak result aaye.
            supabase
              .from("patients")
              .select("name, mobile, address")
              .eq("id", payload.patient_id)
              .single()
              .then(({ data }) => {
                if (data) payload.patients = { name: data.name || "", mobile: data.mobile || "", address: data.address || "" };
              }, () => { /* refresh will retry patient lookup */ });
          }
        } catch { /* silently ignore */ }
      }
      return offlineInsert("billing", payload);
    },
    onSuccess: async (newBill: any) => {
      // ["billing", "all"] cache mein seedha inject karo
      qc.setQueryData(["billing", "all"], (old: any[] | undefined) => {
        if (!old) return [newBill];
        // Duplicate check — agar pehle se hai to mat add karo
        const exists = old.some((b) => b.id === newBill.id);
        if (exists) return old;
        return [newBill, ...old];
      });

      // Baad mein background mein fresh data bhi le lo
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
      await offlineDelete("billing", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

// ─── Daily Cash Book ───
export function useCashBookEntries() {
  return useQuery({
    queryKey: ["cash_book_entries"],
    ...QUERY_OPTS,
    queryFn: async () => {
      return offlineFetch("cash_book_entries", async () => {
        const { data, error } = await supabase
          .from("cash_book_entries")
          .select("*")
          .order("entry_date", { ascending: true })
          .order("created_at", { ascending: true });
        if (error) throw error;
        return data || [];
      });
    },
  });
}

export function useAddCashBookEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: any) => offlineInsert("cash_book_entries", entry),
    onSuccess: (newEntry: any) => {
      qc.setQueryData(["cash_book_entries"], (old: any[] | undefined) => (old ? [...old, newEntry] : [newEntry]));
      qc.invalidateQueries({ queryKey: ["cash_book_entries"] });
    },
  });
}

export function useDeleteCashBookEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => offlineDelete("cash_book_entries", id),
    onSuccess: (_res, id) => {
      qc.setQueryData(["cash_book_entries"], (old: any[] | undefined) => (old ? old.filter((e) => e.id !== id) : old));
      qc.invalidateQueries({ queryKey: ["cash_book_entries"] });
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
  const { selectedBranchId } = useBranchContext();
  return useQuery({ queryKey: ["appointments", selectedBranchId], ...QUERY_OPTS,
    queryFn: async () => (await readBranchTable("appointments", selectedBranchId, "*, patients(name, mobile)")).sort((a,b) => (b.date || "").localeCompare(a.date || "") || (a.time_slot || "").localeCompare(b.time_slot || "")) });
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
      const patients = await cacheGetAll("patients");
      return rows.map((bed: any) => ({ ...bed, patients: patients.find(p => p.id === bed.patient_id) || null }))
        .sort((a: any, b: any) => String(a.bed_number).localeCompare(String(b.bed_number), undefined, { numeric: true }));
    },
  });
}

export function useUpdateBed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, any>) => offlineUpdate("beds", id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beds"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useAddPatient() {
  const qc = useQueryClient();
  return useMutation({
    // 🚨 FIX: naye patient ko created_at kabhi set nahi hota tha (sirf
    // Supabase pe sync hone ke baad, server side, milta tha). Tab tak
    // Billing.tsx ki patient-list "kaun sabse naya hai" ye pata karne ke
    // liye Date.now() par bharosa karti thi — jo har render me thoda alag
    // aata hai, isliye list ke naam upar-niche hote rehte the. Ab created_at
    // yahin, save karte hi, lock kar denge.
    mutationFn: async (p: any) => offlineInsert("patients", { ...p, created_at: p.created_at || new Date().toISOString() }),
    onSuccess: (newPatient: any) => {
      // Cache mein seedha inject karo — invalidate + refetch ka wait nahi karna
      // Billing page navigate hote hi naya patient list mein dikh jaayega
      qc.setQueryData(["patients"], (old: any[] | undefined) => {
        const existing = old || [];
        // duplicate avoid karo
        const filtered = existing.filter((p: any) => p.id !== newPatient.id);
        return [newPatient, ...filtered];
      });
      // Background mein invalidate bhi karo taaki fresh data aaye
      qc.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}

export function useSearchPatients(search: string) {
  const { selectedBranchId } = useBranchContext();
  return useQuery({ queryKey: ["patients", "search", search, selectedBranchId], enabled: search.trim().length > 0,
    queryFn: async () => {
      const rows = await readBranchTable("patients", selectedBranchId);
      const term = search.toLowerCase().trim();
      return rows.filter(p => (p.name || "").toLowerCase().includes(term) || (p.mobile || "").includes(term)).slice(0,20);
    } });
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
          .not("notes", "ilike", "%[ortho:%")
          .order("uploaded_at", { ascending: false });
        if (error) throw error;
        return data as any[] || [];
      });
      // Also filter offline records — ortho fracture X-rays ko exclude karo
      const filtered = rows.filter((r: any) => !r.notes?.includes("[ortho:")).map(r => ({ ...r, file_url: r._localFileUrl || r.file_url }));
      return [...filtered].sort((a: any, b: any) => (b.uploaded_at || "").localeCompare(a.uploaded_at || ""));
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
      await offlineDelete("patients", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}
