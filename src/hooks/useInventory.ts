import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { offlineFetch, offlineUpdate, offlineInsert } from "@/lib/offlineQuery";
import { cacheGetAll, cacheUpsertRow } from "@/lib/offlineDb";
import { isOnline } from "@/lib/offlineSync";
import { cLog } from "@/lib/clientLogger";
import { logAudit } from "@/hooks/useAuditLog";

export interface MedicineStock {
  id: string;
  name: string;
  rate: number;
  stock_quantity: number;
  low_stock_threshold: number;
  unit: string;
  created_at: string;
}

const QUERY_OPTS = {
  staleTime: 0,
  refetchOnMount: true as const,
  refetchOnWindowFocus: true,
  retry: 1,
};

// ── Saari medicines unki stock ke saath ──
export function useMedicineStock() {
  return useQuery({
    queryKey: ["medicine-stock"],
    ...QUERY_OPTS,
    queryFn: async () => {
      return offlineFetch<MedicineStock>("medicines", async () => {
        const { data, error } = await supabase
          .from("medicines")
          .select("*")
          .order("name", { ascending: true });
        if (error) throw error;
        return (data || []) as any;
      });
    },
  });
}

// ── Low stock items (threshold se kam) ──
export function useLowStockMedicines() {
  const { data: medicines = [], ...rest } = useMedicineStock();
  const lowStock = medicines.filter(
    (m) => Number(m.stock_quantity) <= Number(m.low_stock_threshold)
  );
  return { lowStock, allMedicines: medicines, ...rest };
}

// ── Stock adjust karo (+ ya -) aur movement log bhi likho ──
export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      medicineId: string;
      medicineName: string;
      changeQty: number; // positive = stock in, negative = stock out
      reason?: string;
      note?: string;
      actorName?: string;
    }) => {
      const { medicineId, medicineName, changeQty, reason = "manual", note, actorName } = params;

      // current stock cache se nikaal kar naya total calculate karo
      const cached = await cacheGetAll("medicines");
      const existing = (cached as any[]).find((m) => m.id === medicineId);
      const currentQty = Number(existing?.stock_quantity || 0);
      const newQty = Math.max(0, currentQty + changeQty);

      const updated = await offlineUpdate("medicines", medicineId, {
        stock_quantity: newQty,
      });

      // movement log — ✅ ab offline mein bhi queue hoga (skip nahi hoga)
      try {
        await offlineInsert("stock_movements", {
          medicine_id: medicineId,
          medicine_name: medicineName,
          change_qty: changeQty,
          reason,
          note: note || null,
          created_by: actorName || localStorage.getItem("userName") || "Unknown",
        });
      } catch (err) {
        cLog.error("supabase", "stock_movements insert fail", err);
      }

      await logAudit({
        action: changeQty >= 0 ? "stock_in" : "stock_out",
        module: "inventory",
        recordId: medicineId,
        description: `${medicineName}: ${changeQty >= 0 ? "+" : ""}${changeQty} (${reason})`,
      });

      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medicine-stock"] });
    },
  });
}

// ── Bill banate waqt stock automatically ghataane ke liye helper ──
// (Billing.tsx se call kar sakte hain jab medicine line item add ho)
export async function deductStockForSale(medicineId: string, medicineName: string, qty: number) {
  if (!medicineId || !qty) return;
  try {
    const cached = await cacheGetAll("medicines");
    const existing = (cached as any[]).find((m) => m.id === medicineId);
    if (!existing) return;
    const newQty = Math.max(0, Number(existing.stock_quantity || 0) - qty);
    await offlineUpdate("medicines", medicineId, { stock_quantity: newQty });

    // ✅ offline mein bhi queue hoga
    await offlineInsert("stock_movements", {
      medicine_id: medicineId,
      medicine_name: medicineName,
      change_qty: -qty,
      reason: "sale",
      created_by: localStorage.getItem("userName") || "Unknown",
    });
  } catch (err) {
    cLog.error("supabase", "deductStockForSale fail", err);
  }
}

// ── Movement history (ek medicine ki ya sabki) ──
export function useStockMovements(medicineId?: string) {
  return useQuery({
    queryKey: ["stock-movements", medicineId || "all"],
    ...QUERY_OPTS,
    queryFn: async () => {
      const rows = await offlineFetch<any>("stock_movements", async () => {
        let query = supabase
          .from("stock_movements" as any)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200);
        if (medicineId) query = query.eq("medicine_id", medicineId);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
      });
      const filtered = medicineId ? rows.filter((r: any) => r.medicine_id === medicineId) : rows;
      return [...filtered].sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || "")).slice(0, 200);
    },
  });
}
