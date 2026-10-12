import { boundedFetch } from "@/lib/boundedFetch";
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Supabase URL/API key missing in .env');
const authenticatedClient = createClient<Database>(url, key, {
  global: { fetch: boundedFetch },
  auth: { storage: localStorage, persistSession: !(window as any).electron, autoRefreshToken: true }
});
// The owner API client never inherits a staff/old-project Auth token.
const apiClient = createClient<Database>(url, key, {
  global: { fetch: boundedFetch },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
let apiMode = false;
export function setCloudAccessMode(api: boolean) { apiMode = api; }
export function usesApiSync() { return apiMode; }
export const supabase = new Proxy(authenticatedClient, {
  get(_, prop) {
    const client = prop === 'auth' || !apiMode ? authenticatedClient : apiClient;
    const value = Reflect.get(client, prop);
    return typeof value === 'function' ? value.bind(client) : value;
  }
});
