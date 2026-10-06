import { supabase } from "@/integrations/supabase/client";
import { cacheGetAll, cacheReplaceTable } from "./offlineDb";
import { fetchCompleteTable } from "./completeFetch";
import { isOnline } from "./offlineSync";
export function inBranch(row: any, branch: string | null) { return !branch || row.branch_id === branch; }
export async function readBranchTable(table: string, branch: string | null, select = "*") {
  if (await isOnline()) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // All permitted branches are downloaded completely before authoritative replacement.
        const rows = await fetchCompleteTable(table, select);
        await cacheReplaceTable(table, rows);
      }
    } catch { /* keep the durable local snapshot; never replace on a failed fetch */ }
  }
  return (await cacheGetAll(table)).filter(row => inBranch(row, branch));
}
