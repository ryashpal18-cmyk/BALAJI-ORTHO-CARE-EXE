import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isOnline } from "@/lib/offlineSync";
import { offlineInsert, offlineFetch } from "@/lib/offlineQuery";
import { cLog } from "@/lib/clientLogger";
import { getCurrentRole } from "@/lib/appConfig";

export interface AuditLogEntry {
  id: string;
  actor_name: string;
  actor_role: string | null;
  action: string;
  module: string;
  record_id: string | null;
  description: string | null;
  created_at: string;
}

/**
 * Kisi bhi page/action se call karo — best-effort hai, fail hua to bhi
 * app crash nahi hoga (sirf console mein log ho jayega).
 * ✅ Offline hone par bhi ab queue mein daal diya jaata hai — internet
 * aane par automatically sync ho jaayega (pehle silently skip hota tha).
 */
export async function logAudit(params: {
  action: string;        // 'create' | 'update' | 'delete' | 'login' | 'print' | 'stock_in' | 'stock_out' etc.
  module: string;        // page/feature name e.g. 'billing', 'ortho', 'inventory'
  recordId?: string;
  description?: string;
}) {
  try {
    const actorName = localStorage.getItem("userName") || "Unknown";
    const actorRole = getCurrentRole();

    await offlineInsert("audit_logs", {
      actor_name: actorName,
      actor_role: actorRole,
      action: params.action,
      module: params.module,
      record_id: params.recordId || null,
      description: params.description || null,
    });
  } catch (err) {
    cLog.error("supabase", "audit log insert fail", err);
  }
}

// ── Audit log list — Settings/Reports page me dikhane ke liye ──
export function useAuditLogs(filters?: { module?: string; limit?: number }) {
  return useQuery({
    queryKey: ["audit-logs", filters?.module || "all", filters?.limit || 200],
    staleTime: 0,
    refetchOnMount: true,
    queryFn: async () => {
      const rows = await offlineFetch<AuditLogEntry>("audit_logs", async () => {
        let query = supabase
          .from("audit_logs" as any)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(filters?.limit || 200);
        if (filters?.module) query = query.eq("module", filters.module);
        const { data, error } = await query;
        if (error) throw error;
        return (data || []) as any as AuditLogEntry[];
      });
      const filtered = filters?.module ? rows.filter((r: any) => r.module === filters.module) : rows;
      return [...filtered].sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || "")).slice(0, filters?.limit || 200);
    },
  });
}
