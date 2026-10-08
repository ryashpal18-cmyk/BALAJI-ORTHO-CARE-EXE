import { businessDate } from "@/lib/businessDate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { offlineFetch, offlineFetchScoped, offlineInsert, offlineUpdate } from "@/lib/offlineQuery";
import { cacheGetAll, queueAdd, cacheUpsertRow, commitMutation } from "@/lib/offlineDb";
import { isOnline } from "@/lib/offlineSync";

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

  const cachedPatients = await cacheGetAll("patients");
  const patientMap = new Map(cachedPatients.map((p: any) => [p.id, p]));
  return cases.map((c) => ({ ...c, patients: patientMap.get(c.patient_id) || null }));
}

export function useFractureCases() {
  return useQuery({
    queryKey: ["fracture_cases"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const rows = await offlineFetch("fracture_cases", async () => {
        const { data, error } = await supabase
          .from("fracture_cases" as any)
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data || []) as any[];
      });
      const sorted = [...rows].sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""));
      return attachPatientsToCases(sorted);
    },
  });
}

export function useAddFractureCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<FractureCase>) => offlineInsert("fracture_cases", payload),
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
      return offlineUpdate("fracture_cases", id, { ...updates, updated_at: new Date().toISOString() });
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
      const startStr = businessDate(start);
      const endStr = businessDate(end);

      const cached = await offlineFetch("fracture_cases", async () => {
        const { data, error } = await supabase.from("fracture_cases" as any).select("*")
          .gte("next_followup_date", startStr).lte("next_followup_date", endStr);
        if (error) throw error;
        return data || [];
      });
      const filtered = cached
        .filter((c: any) => c.next_followup_date && c.next_followup_date >= startStr && c.next_followup_date <= endStr)
        .sort((a: any, b: any) => (a.next_followup_date || "").localeCompare(b.next_followup_date || ""));
      return attachPatientsToCases(filtered);
    },
  });
}

export function useHospitals() {
  return useQuery({
    queryKey: ["hospitals"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const rows = await offlineFetch("hospitals", async () => {
        const { data, error } = await supabase
          .from("hospitals" as any)
          .select("*")
          .order("name");
        if (error) throw error;
        return (data || []) as any[];
      });
      return [...rows].sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
    },
  });
}

export function useAddHospital() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; doctor_name?: string }) => offlineInsert("hospitals", payload),
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
      return offlineFetchScoped("fracture_xrays", async () => {
        const { data, error } = await supabase.from("fracture_xrays" as any).select("*")
          .eq("fracture_case_id", caseId).order("image_date", { ascending: false });
        if (error) throw error;
        return data || [];
      }, cached => cached.filter(x => x.fracture_case_id?.replace(/^local_/, "") === caseId.replace(/^local_/, "")).map(x => ({ ...x, file_url: x._localFileUrl || x.file_url }))
        .sort((a, b) => (b.image_date || "").localeCompare(a.image_date || "")));

    },
    enabled: !!caseId,
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export type XrayUploadResult = {
  ok: boolean;       // true if uploaded now OR safely queued — never a hard failure to the user
  queued: boolean;    // true if it will upload automatically once internet aata hai
  file_url?: string;  // only set when uploaded immediately
};

/**
 * X-ray file upload. Internet hai to seedha Supabase Storage par upload ho
 * jaata hai. Internet nahi hai (ya upload call fail ho jaye) to file ko
 * IndexedDB me (base64 ke roop me) save kar ke queue me daal dete hain —
 * koi error nahi dikhata. Internet wapas aane par background sync engine
 * isi file ko automatically Supabase par upload kar dega.
 */
export async function uploadClinicalFile(table: 'fracture_xrays' | 'xray_reports', patientId: string, file: File, caseId?: string, reportType = 'X-Ray'): Promise<XrayUploadResult> {
  if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type)) throw new Error('JPEG, PNG, WebP या PDF चुनें');
  const fileBase64 = await fileToBase64(file);
  const uploadId = crypto.randomUUID();
  const localUrl = `data:${file.type};base64,${fileBase64}`;
  const row = { id: uploadId, patient_id: patientId, ...(caseId ? { fracture_case_id: caseId, image_date: businessDate() } : { report_type: reportType, uploaded_at: new Date().toISOString() }), created_at: new Date().toISOString(), file_url: localUrl, _localFileUrl: localUrl, _pendingSync: true };
  await commitMutation({ table, op: 'xray_upload', tempId: uploadId, payload: { caseId, patientId, uploadId, fileName: file.name, fileBase64, mimeType: file.type, reportType, imageDate: caseId ? businessDate() : undefined, created_at: row.created_at } }, row);
  void import('@/lib/offlineSync').then(m => m.runSync()).catch(() => {});
  return { ok: true, queued: true, file_url: localUrl };
}
export async function uploadFractureXray(caseId: string, patientId: string, file: File): Promise<XrayUploadResult> {
  return uploadClinicalFile('fracture_xrays', patientId, file, caseId);
}
