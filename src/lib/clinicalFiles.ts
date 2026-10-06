import { supabase } from "@/integrations/supabase/client";
/** Renew persisted private links, including legacy public storage URLs. */
export async function refreshClinicalUrl(value: string): Promise<string> {
  const url = new URL(value);
  const match = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/(invoices|prescriptions|reports|xray-files)\/(.+)$/);
  if (!match) throw new Error("Unsupported clinical file URL");
  const { data, error } = await supabase.storage.from(match[1]).createSignedUrl(decodeURIComponent(match[2]), 86400);
  if (error || !data?.signedUrl) throw error || new Error("Unable to sign clinical file");
  return data.signedUrl;
}
