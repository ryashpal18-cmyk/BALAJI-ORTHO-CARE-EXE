import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FractureCase = {
  id: string;
  patient_id: string;
  patient_type: string;
  body_part: string | null;
  side: string | null;
  fracture_type: string | null;
  cause: string | null;
  plaster_type: string | null;
  plaster_date: string | null;
  followup_days: number;
  next_followup_date: string | null;
  plaster_status: string;
  hospital_name: string | null;
  doctor_name: string | null;
  referral_reason: string | null;
  doctor_notes: string | null;
  created_at: string;
  updated_at: string;
};

async function attachPatientsToCases(cases: any[]) {
  const patientIds = [...new Set(cases.map((c) => c.patient_id).filter(Boolean))];
  if (!patientIds.length) return cases;

  const { data: patients, error } = await supabase
    .from("patients")
    .select("id, name, mobile")
    .in("id", patientIds);
  if (error) return cases;

  const patientMap = new Map((patients || []).map((p: any) => [p.id, p]));
  return cases.map((c) => ({ ...c, patients: patientMap.get(c.patient_id) || null }));
}

export function useFractureCases() {
  return useQuery({
    queryKey: ["fracture_cases"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fracture_cases" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return attachPatientsToCases((data || []) as any[]);
    },
  });
}

export function useAddFractureCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<FractureCase>) => {
      const { data, error } = await supabase
        .from("fracture_cases" as any)
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fracture_cases"] });
      qc.invalidateQueries({ queryKey: ["followups_today"] });
    },
  });
}

export function useUpdateFractureCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<FractureCase>) => {
      const { data, error } = await supabase
        .from("fracture_cases" as any)
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fracture_cases"] });
      qc.invalidateQueries({ queryKey: ["followups_today"] });
    },
  });
}

export function useFollowupsAround() {
  return useQuery({
    queryKey: ["followups_today"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 30);
      const end = new Date(today);
      end.setDate(end.getDate() + 30);
      const { data, error } = await supabase
        .from("fracture_cases" as any)
        .select("*")
        .gte("next_followup_date", start.toISOString().slice(0, 10))
        .lte("next_followup_date", end.toISOString().slice(0, 10))
        .order("next_followup_date", { ascending: true });
      if (error) throw error;
      return attachPatientsToCases((data || []) as any[]);
    },
  });
}

export function useHospitals() {
  return useQuery({
    queryKey: ["hospitals"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitals" as any)
        .select("*")
        .order("name");
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useAddHospital() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; doctor_name?: string }) => {
      const { data, error } = await supabase
        .from("hospitals" as any)
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hospitals"] }),
  });
}

export function useFractureXrays(caseId?: string) {
  return useQuery({
    queryKey: ["fracture_xrays", caseId],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      if (!caseId) return [];
      const { data, error } = await supabase
        .from("fracture_xrays" as any)
        .select("*")
        .eq("fracture_case_id", caseId)
        .order("image_date", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!caseId,
  });
}

export async function uploadFractureXray(caseId: string, patientId: string, file: File) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${patientId}/${caseId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("xray-files")
    .upload(path, file, { upsert: false });
  if (upErr) throw upErr;
  const { data: signed } = await supabase.storage
    .from("xray-files")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  const file_url = signed?.signedUrl || path;
  const { error } = await supabase.from("fracture_xrays" as any).insert({
    fracture_case_id: caseId,
    patient_id: patientId,
    file_url,
  } as any);
  if (error) throw error;
  return file_url;
}
