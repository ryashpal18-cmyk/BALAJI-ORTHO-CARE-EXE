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
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["patients"],
    staleTime: 30000, // ✅ 30 sec — setQueryData ka data turant dikh jaayega
    refetchOnMount: true,
    queryFn: async () => {
      // ✅ Cache-first — turant local se do, network ka kabhi wait nahi
      // (naye offline patients bhi yahan milenge). Search/list hamesha fast.
      const cached = await cacheGetAll("patients");
      const sorted = [...cached].sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));

      // Online hai to background mein silently fresh data le aao — UI block nahi hoga
      const online = typeof navigator !== "undefined" ? navigator.onLine : false;
      if (online) {
        supabase.from("patients").select("*").order("name").then(({ data, error }) => {
          if (error || !data || data.length === 0) return;
          const onlineIds = new Set(data.map((p: any) => p.id));
          const offlineOnly = cached.filter((p: any) => !onlineIds.has(p.id));
          const merged = [...data, ...offlineOnly].sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
          cacheReplaceTable("patients", [...data, ...offlineOnly]).then(() => {
            // ✅ FIX: pehle yahan invalidateQueries call hota tha, jisse queryFn
            // dobara chalta, jo phir se background fetch karta, jo phir invalidate
            // karta — ek INFINITE LOOP ban jaata tha (bina ruke Supabase ko call
            // karte rehna). setQueryData seedha cache update karta hai, queryFn ko
            // dobara nahi chalata — loop nahi banta, UI phir bhi turant update ho
            // jaata hai.
            qc.setQueryData(["patients"], merged);
          });
        }).catch((err) => cLog.warn("patients", "Background refresh fail — cache use ho raha hai", err));
      }

      return sorted;
    },
  });
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
      return (rows || []).map((b: any) => ({ amount: Number(b.amount_paid || b.amount || 0), payment_date: b.created_at?.slice(0, 10) }));
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
              })
              .catch(() => { /* silently ignore — sync ke baad naam theek ho jaayega */ });
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
  return useQuery({
    queryKey: ["patients", "search", search],
    queryFn: async () => {
      if (!search) return [] as any[];

      // ✅ Cache-first — mobile number type karte hi turant local se milta
      // hai, internet ka kabhi wait nahi karna padta.
      const cached = await cacheGetAll("patients");
      const term = search.toLowerCase();
      const localMatches = cached
        .filter((p: any) => (p.name || "").toLowerCase().includes(term) || (p.mobile || "").includes(search))
        .slice(0, 20);

      const online = await isOnline();
      if (online) {
        try {
          const { data, error } = await supabase
            .from("patients")
            .select("*")
            .or(`name.ilike.%${search}%,mobile.ilike.%${search}%`)
            .limit(20);
          if (!error && data) {
            // Online result + koi offline-only naya patient jo abhi tak sync nahi hua
            const onlineIds = new Set(data.map((p: any) => p.id));
            const offlineOnly = localMatches.filter((p: any) => !onlineIds.has(p.id));
            return [...data, ...offlineOnly] as any[];
          }
        } catch {
          // fall through to cache result
        }
      }
      return localMatches;
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
          .not("notes", "ilike", "%[ortho:%")
          .order("uploaded_at", { ascending: false });
        if (error) throw error;
        return data as any[] || [];
      });
      // Also filter offline records — ortho fracture X-rays ko exclude karo
      const filtered = rows.filter((r: any) => !r.notes?.includes("[ortho:"));
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
