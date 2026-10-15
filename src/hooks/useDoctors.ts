import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cacheGetAll } from "@/lib/offlineDb";
import { offlineInsert, offlineUpdate } from "@/lib/offlineQuery";
import { DEFAULT_COMMISSION_PERCENT, type Doctor } from "@/lib/doctors";

export function useDoctors() {
  return useQuery({
    queryKey: ["doctors"],
    staleTime: 0,
    refetchOnMount: true,
    retry: 1,
    queryFn: async (): Promise<Doctor[]> =>
      ((await cacheGetAll("doctors")) as Doctor[]).slice().sort((a, b) => (a.name || "").localeCompare(b.name || "")),
  });
}

export type NewDoctor = { name: string; mobile?: string; speciality?: string; commission_percent?: number };

export function useAddDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: NewDoctor) =>
      offlineInsert("doctors", {
        name: d.name.trim(),
        mobile: d.mobile?.trim() || null,
        speciality: d.speciality?.trim() || null,
        commission_percent: Number.isFinite(Number(d.commission_percent)) ? Number(d.commission_percent) : DEFAULT_COMMISSION_PERCENT,
        is_active: true,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}

export function useUpdateDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...changes }: { id: string } & Partial<Omit<Doctor, "id">>) =>
      offlineUpdate("doctors", id, { ...changes, updated_at: new Date().toISOString() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });
}
