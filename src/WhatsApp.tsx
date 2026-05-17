// Pointing to shared external Supabase project (idcxmeczzfnipmybikue)
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://idcxmeczzfnipmybikue.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkY3htZWN6emZuaXBteWJpa3VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzODc4OTIsImV4cCI6MjA5MDk2Mzg5Mn0.WdbFTPLnUC5U3YFL6Y8dgWETit-aFspgf8RA-A6HaFc";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
