import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isOnline } from "@/lib/offlineSync";
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
 * Offline hone par silently skip ho jata hai (audit log critical nahi hai).
 */
export async function logAudit(params: {
  action: string;        // 'create' | 'update' | 'delete' | 'login' | 'print' | 'stock_in' | 'stock_out' etc.
  module: string;        // page/feature name e.g. 'billing', 'ortho', 'inventory'
  recordId?: string;
  description?: string;
}) {
  try {
    const online = await isOnline();
    if (!online) return; // offline mein audit log skip — critical nahi hai

    const actorName = localStorage.getItem("userName") || "Unknown";
    const actorRole = getCurrentRole();

    await supabase.from("audit_logs" as any).insert({
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
      const online = await isOnline();
      if (!online) return [] as AuditLogEntry[];
      let query = supabase
        .from("audit_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(filters?.limit || 200);
      if (filters?.module) query = query.eq("module", filters.module);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any as AuditLogEntry[];
    },
  });
}
