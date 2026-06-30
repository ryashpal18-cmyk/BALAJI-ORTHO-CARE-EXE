import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { offlineFetch, offlineInsert, offlineUpdate, offlineDelete } from "@/lib/offlineQuery";
import { logAudit } from "@/hooks/useAuditLog";

export interface InsuranceClaim {
  id: string;
  patient_id: string | null;
  patient_name: string;
  billing_id: string | null;
  tpa_name: string;
  policy_number: string | null;
  claim_amount: number;
  approved_amount: number | null;
  status: "Submitted" | "Under Review" | "Approved" | "Partially Approved" | "Rejected" | "Settled";
  submitted_date: string;
  settled_date: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const QUERY_OPTS = { staleTime: 0, refetchOnMount: true as const, refetchOnWindowFocus: true, retry: 1 };

export function useInsuranceClaims() {
  return useQuery({
    queryKey: ["insurance-claims"],
    ...QUERY_OPTS,
    queryFn: async () => {
      return offlineFetch<InsuranceClaim>("insurance_claims", async () => {
        const { data, error } = await supabase
          .from("insurance_claims" as any)
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data || []) as any;
      });
    },
  });
}

export function useCreateClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (claim: Partial<InsuranceClaim>) => {
      const data = await offlineInsert("insurance_claims", claim);
      await logAudit({
        action: "create",
        module: "insurance-claims",
        recordId: data?.id,
        description: `Claim filed: ${claim.patient_name} — ${claim.tpa_name} — ₹${claim.claim_amount}`,
      });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["insurance-claims"] }),
  });
}

export function useUpdateClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<InsuranceClaim> }) => {
      const data = await offlineUpdate("insurance_claims", id, updates);
      await logAudit({
        action: "update",
        module: "insurance-claims",
        recordId: id,
        description: `Claim status: ${updates.status || "updated"}`,
      });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["insurance-claims"] }),
  });
}

export function useDeleteClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => offlineDelete("insurance_claims", id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["insurance-claims"] }),
  });
}
