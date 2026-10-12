import { boundedFetch } from "@/lib/boundedFetch";
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Supabase URL/API key missing in .env');
const authenticatedClient = createClient<Database>(url, key, {
  global: { fetch: boundedFetch },
  auth: { storage: localStorage, persistSession: !(window as any).electron, autoRefreshToken: !(window as any).electron }
});
// Desktop refresh credentials are held by the OS-encrypted main process.
export const supabase = authenticatedClient;
export function usesApiSync() { return false; }
