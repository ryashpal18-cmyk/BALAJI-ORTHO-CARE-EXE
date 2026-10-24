import { queryClient } from "./queryClient";
import { supabase, usesApiSync } from "@/integrations/supabase/client";
import { cacheGetAll, cacheReplaceTable } from "./offlineDb";
import { fetchCompleteTable } from "./completeFetch";
import { isOnline } from "./offlineSync";
import { ensureCloudSession } from "./localSession";
import { attachPatients } from "./patientRecords";
export function inBranch(row: any, branch: string | null) { return !branch || row.branch_id === branch; }
export async function readBranchTable(table: string, branch: string | null, select = "*") {
  const cached = await cacheGetAll(table);
  // Network refresh is independent of the screen's local read.
  void refreshBranchTable(table, select);
  const rows = cached.filter(row => inBranch(row, branch));
  return select.includes('patients(') ? attachPatients(rows, await cacheGetAll('patients')) : rows;
}
const refreshing = new Set<string>();
const lastRefresh = new Map<string, number>();
async function refreshBranchTable(table: string, select: string) {
  if (refreshing.has(table) || Date.now() - (lastRefresh.get(table) || 0) < 5000) return;
  refreshing.add(table);
  try {
    if (!(await isOnline())) return;
    if (!(await ensureCloudSession())) return;

    const rows = await fetchCompleteTable(table, select);
    const before = JSON.stringify(await cacheGetAll(table));
    if (usesApiSync() && rows.length === 0 && (await cacheGetAll(table)).length > 0) return;
    await cacheReplaceTable(table, rows);
    lastRefresh.set(table, Date.now());
    if (before !== JSON.stringify(await cacheGetAll(table))) void queryClient.invalidateQueries();
  } catch { /* Network failure never blocks a local screen or wipes pending work. */ }
  finally { refreshing.delete(table); }
}
