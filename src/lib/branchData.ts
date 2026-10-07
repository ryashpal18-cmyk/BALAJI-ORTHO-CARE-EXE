import { queryClient } from "./queryClient";
import { supabase } from "@/integrations/supabase/client";
import { cacheGetAll, cacheReplaceTable } from "./offlineDb";
import { fetchCompleteTable } from "./completeFetch";
import { isOnline } from "./offlineSync";
import { ensureCloudSession } from "./localSession";
export function inBranch(row: any, branch: string | null) { return !branch || row.branch_id === branch; }
export async function readBranchTable(table: string, branch: string | null, select = "*") {
  const cached = await cacheGetAll(table);
  // Network refresh is independent of the screen's local read.
  void refreshBranchTable(table, select);
  return cached.filter(row => inBranch(row, branch));
}
const refreshing = new Set<string>();
const lastRefresh = new Map<string, number>();
async function refreshBranchTable(table: string, select: string) {
  if (refreshing.has(table) || Date.now() - (lastRefresh.get(table) || 0) < 5000) return;
  refreshing.add(table);
  try {
    if (!(await isOnline())) return;
    if (!(await ensureCloudSession())) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const rows = await fetchCompleteTable(table, select);
    const before = JSON.stringify(await cacheGetAll(table));
    await cacheReplaceTable(table, rows);
    lastRefresh.set(table, Date.now());
    if (before !== JSON.stringify(await cacheGetAll(table))) void queryClient.invalidateQueries();
  } catch { /* Network failure never blocks a local screen or wipes pending work. */ }
  finally { refreshing.delete(table); }
}
