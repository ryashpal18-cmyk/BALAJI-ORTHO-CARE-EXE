import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isOnline } from "@/lib/offlineSync";
import { cacheGetAll } from "@/lib/offlineDb";

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
}

const SELECTED_BRANCH_KEY = "bocc_selected_branch";

interface BranchContextValue {
  branches: Branch[];
  selectedBranchId: string | null; // null = "All Branches"
  setSelectedBranchId: (id: string | null) => void;
  isLoading: boolean;
}

const BranchContext = createContext<BranchContextValue | undefined>(undefined);

export function useBranches() {
  return useQuery({
    queryKey: ["branches"],
    staleTime: 60000,
    queryFn: async (): Promise<Branch[]> => {
      const online = await isOnline();
      if (online) {
        try {
          const { data, error } = await supabase
            .from("branches" as any)
            .select("*")
            .order("name", { ascending: true });
          if (error) throw error;
          return (data || []) as any;
        } catch {
          // offline ya network error — neeche cache se fallback
        }
      }
      const cached = await cacheGetAll("branches");
      return ((cached as any[]) || []).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    },
  });
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const { data: branches = [], isLoading } = useBranches();
  const [selectedBranchId, setSelectedBranchIdState] = useState<string | null>(
    () => localStorage.getItem(SELECTED_BRANCH_KEY) || null
  );

  useEffect(() => {
    if (selectedBranchId) localStorage.setItem(SELECTED_BRANCH_KEY, selectedBranchId);
    else localStorage.removeItem(SELECTED_BRANCH_KEY);
  }, [selectedBranchId]);

  const setSelectedBranchId = (id: string | null) => setSelectedBranchIdState(id);

  return (
    <BranchContext.Provider value={{ branches, selectedBranchId, setSelectedBranchId, isLoading }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranchContext() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranchContext must be used inside <BranchProvider>");
  return ctx;
}

/** Helper: client-side filter karne ke liye jab record me branch_id ho */
export function filterByBranch<T extends { branch_id?: string | null }>(
  rows: T[],
  branchId: string | null
): T[] {
  if (!branchId) return rows; // "All Branches"
  return rows.filter((r) => r.branch_id === branchId);
}
