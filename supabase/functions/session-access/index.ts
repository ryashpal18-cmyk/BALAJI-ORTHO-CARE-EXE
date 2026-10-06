import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = req.headers.get("Authorization")?.replace(/^Bearer /i, "");
  if (!token) return new Response("{}", { status: 401, headers });
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return new Response("{}", { status: 401, headers });
  const { data: roles, error: roleError } = await db.from("user_roles").select("role").eq("user_id", user.id);
  if (roleError) return new Response("{}", { status: 403, headers });
  if (roles?.some(r => r.role === "admin")) return new Response(JSON.stringify({ userId: user.id, role: "admin", pages: [] }), { headers });
  const { data: access, error: accessError } = await db.from("staff_access").select("*").eq("user_id", user.id).eq("enabled", true).single();
  if (accessError || !access || !roles?.some(r => r.role === "staff")) return new Response("{}", { status: 403, headers });
  return new Response(JSON.stringify({ userId: user.id, role: "staff", pages: access.allowed_pages, branchIds: access.allowed_branches, displayName: access.display_name }), { headers });
});
