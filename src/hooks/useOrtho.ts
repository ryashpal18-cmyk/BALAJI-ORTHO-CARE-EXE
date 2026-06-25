import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { offlineFetch, offlineInsert, offlineUpdate } from "@/lib/offlineQuery";
import { cacheGetAll, queueAdd, cacheUpsertRow } from "@/lib/offlineDb";
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

  const online = await isOnline();
  if (online) {
    try {
      const { data: patients, error } = await supabase
        .from("patients")
        .select("id, name, mobile")
        .in("id", patientIds);
      if (error) throw error;
      const patientMap = new Map((patients || []).map((p: any) => [p.id, p]));
      return cases.map((c) => ({ ...c, patients: patientMap.get(c.patient_id) || null }));
    } catch {
      // fall through to offline cache lookup below
    }
  }

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
      const online = await isOnline();

      if (online && !id.startsWith("local_")) {
        // Step 1: Update karo (no .select().single() — RLS issue avoid karne ke liye)
        const { error } = await supabase
          .from("fracture_cases" as any)
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", id);

        if (error) throw new Error(error.message || "Update fail hua. Please dobara try karo.");

        // Step 2: Updated row fetch karo cache ke liye
        const { data: updated } = await supabase
          .from("fracture_cases" as any)
          .select("*")
          .eq("id", id)
          .single();

        if (updated) await cacheUpsertRow("fracture_cases", updated, "id");
        return updated || { id, ...updates };
      }

      // Offline path
      return offlineUpdate("fracture_cases", id, updates);
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
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);

      const online = await isOnline();
      if (online) {
        try {
          const { data, error } = await supabase
            .from("fracture_cases" as any)
            .select("*")
            .gte("next_followup_date", startStr)
            .lte("next_followup_date", endStr)
            .order("next_followup_date", { ascending: true });
          if (error) throw error;
          return attachPatientsToCases((data || []) as any[]);
        } catch {
          // fall through to offline cache filter below
        }
      }

      const cached = await cacheGetAll("fracture_cases");
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
      const online = await isOnline();
      if (online) {
        try {
          const { data, error } = await supabase
            .from("fracture_xrays" as any)
            .select("*")
            .eq("fracture_case_id", caseId)
            .order("image_date", { ascending: false });
          if (error) throw error;
          return (data || []) as any[];
        } catch {
          // fall through to offline cache below
        }
      }
      const cached = await cacheGetAll("fracture_xrays");
      return cached
        .filter((x: any) => x.fracture_case_id === caseId)
        .sort((a: any, b: any) => (b.image_date || "").localeCompare(a.image_date || ""));
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
export async function uploadFractureXray(caseId: string, patientId: string, file: File): Promise<XrayUploadResult> {
  const online = await isOnline();

  if (online) {
    try {
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
      return { ok: true, queued: false, file_url };
    } catch {
      // Network blip mid-upload — fall through to offline queue below so the
      // doctor's work isn't lost; it'll retry automatically.
    }
  }

  const fileBase64 = await fileToBase64(file);
  await queueAdd({
    table: "fracture_xrays",
    op: "xray_upload",
    payload: { caseId, patientId, fileName: file.name, fileBase64, mimeType: file.type },
  });
  return { ok: true, queued: true };
}
