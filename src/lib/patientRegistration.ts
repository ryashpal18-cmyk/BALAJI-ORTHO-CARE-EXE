import { supabase } from "@/integrations/supabase/client";
import { ensureCloudSession } from "./localSession";
import { cacheGetAll, cacheGetRow, cacheUpsertRowFromServer, metaGet, metaSet, queueGetAll } from "./offlineDb";
import { queryClient } from "./queryClient";

export const REGISTRATION_LEASES = "patient-registration:leases";
export const registrationSerial = (value: unknown) => /^BAOR\d{4,}$/.test(String(value || "")) ? Number(String(value).slice(4)) : 0;
let warming: Promise<void> | null = null;
let retryAfter = 0;
/** Reserve unique numbers centrally; consuming them during Save is a local DB transaction. */
export function warmRegistrationNumbers(force = false): Promise<void> {
  if (warming) return warming;
  if (!force && Date.now() < retryAfter) return Promise.resolve();
  warming = (async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("इंटरनेट नहीं है। मरीज की सेव जानकारी सुरक्षित है।");
    if (!(await ensureCloudSession())) throw new Error("Clinic cloud जुड़ा नहीं है। Sync में सही cloud account जोड़ें।");
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) throw new Error("Cloud session उपलब्ध नहीं है।");
    const scope = String((supabase as any).supabaseUrl || "clinic") + "::" + session.user.id;
    await metaSet("patient-registration:scope", scope);
    const leases: any[] = (await metaGet(REGISTRATION_LEASES)) || [];
    let remaining = 0;
    for (const lease of leases.filter(l => l.scope === scope)) remaining += Math.max(0, lease.numbers.length - Number(await metaGet("patient-registration:used:" + lease.requestId) || 0));
    if (remaining > 8) return;
    const device = await metaGet("patient-registration:device") || crypto.randomUUID();
    await metaSet("patient-registration:device", device);
    const pendingKey = "patient-registration:request:" + scope;
    const requestId = await metaGet(pendingKey) || crypto.randomUUID();
    await metaSet(pendingKey, requestId); // Network retries reuse the same server reservation.
    const floor = Math.max(0, ...(await cacheGetAll("patients")).map(p => registrationSerial(p.registration_number)));
    const { data, error } = await supabase.rpc("reserve_patient_registration_numbers" as any, { p_request: requestId, p_device: device, p_count: 32, p_floor: floor } as any);
    if (error) {
      const message = String(error.message || "");
      if (/reserve_patient_registration|schema cache|does not exist/i.test(message)) throw new Error("Database में registration setup अधूरा है। PATIENT_REGISTRATION_SETUP.sql सही clinic project में चलानी है। केवल बार-बार Sync दबाने से नंबर नहीं बनेगा।");
      throw new Error("Registration reserve नहीं हुआ: " + message);
    }
    const result = data as any;
    if (!Array.isArray(result?.numbers) || !result.numbers.length || !result.numbers.every((n: unknown) => registrationSerial(n))) throw new Error("Cloud से सही registration numbers नहीं मिले।");
    if ((await supabase.auth.getSession()).data.session?.user.id !== session.user.id) throw new Error("Cloud account बदल गया। दोबारा जाँच करें।");
    const latest: any[] = await metaGet(REGISTRATION_LEASES) || [];
    if (!latest.some(l => l.requestId === requestId)) await metaSet(REGISTRATION_LEASES, [...latest, { requestId, scope, numbers: result.numbers }]);
    await metaSet(pendingKey, null);
    await metaSet("patient-registration:last-error", null);
  })().catch(async error => {
    retryAfter = Date.now() + 60000;
    await metaSet("patient-registration:last-error", error.message || "Registration check failed");
    throw error;
  }).finally(() => { warming = null; });
  return warming;
}

export async function refreshPatientRegistration(patientId: string) {
  const local = await cacheGetRow("patients", patientId);
  if (local?.registration_number) return { message: "मरीज का स्थायी नंबर: " + local.registration_number };
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("इंटरनेट नहीं है। मरीज सुरक्षित है; अगली online जाँच पर नंबर डाउनलोड होगा।");
  if (!(await ensureCloudSession())) throw new Error("Clinic cloud जुड़ा नहीं है। Sync में सही account जोड़ें।");
  const { error: schemaError } = await supabase.from("patients").select("registration_number" as any).limit(1);
  if (schemaError) {
    if (/registration_number|schema cache/i.test(schemaError.message)) throw new Error("Database में registration_number कॉलम नहीं है। सही clinic project में registration SQL चलानी है।");
    throw new Error("मरीज का नंबर पढ़ने की अनुमति/connection नहीं मिला: " + schemaError.message);
  }
  const realId = String(patientId).replace(/^local_/, "");
  const { data: server, error } = await supabase.from("patients").select("*").eq("id", realId).maybeSingle();
  if (error) throw new Error("मरीज का नंबर डाउनलोड नहीं हुआ: " + error.message);
  if (server && !server.registration_number) throw new Error("मरीज cloud में है, लेकिन BAOR नंबर खाली है। पुराने मरीजों का registration backfill अभी बाकी है।");
  if (!server) {
    const pending = (await queueGetAll()).some(m => m.table === "patients" && m.op === "insert" && m.tempId === patientId);
    if (pending) throw new Error("यह नया मरीज डिवाइस पर सेव है, लेकिन अभी cloud में upload नहीं हुआ। Sync की pending/error सूची जाँचें।");
    throw new Error("मरीज cloud से नहीं मिला। सही clinic account/branch जाँचें। Saved data नहीं बदला गया।");
  }
  await cacheUpsertRowFromServer("patients", server);
  const refreshed = await cacheGetRow("patients", patientId);
  void queryClient.invalidateQueries();
  if (refreshed?.registration_number) return { message: "नंबर डाउनलोड हो गया: " + refreshed.registration_number };
  throw new Error("Cloud में नंबर मिला, लेकिन local save पूरा नहीं हुआ। Storage error जाँचें।");
}
