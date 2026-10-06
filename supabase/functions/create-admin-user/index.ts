import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const reply = (body: any, status = 200) => new Response(JSON.stringify(body), { headers, status });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = req.headers.get("Authorization")?.replace(/^Bearer /i, "");
    if (!token) return reply({ error: "Authentication required" }, 401);
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return reply({ error: "Invalid session" }, 401);
    const { data: role, error: roleError } = await db.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (roleError || !role) return reply({ error: "Administrator required" }, 403);
    const body = await req.json();
    const { password, displayName, allowedPages = [], action = "create" } = body;
    const email = body.email || `${String(body.username || "").trim().toLowerCase()}@staff.balajiclinic.local`;
    const desiredRole = body.role === "staff" ? "staff" : "admin";
    if (action !== "create") {
      const { data: staff } = await db.from("staff_access").select("user_id").eq("user_id", body.id).single();
      if (!staff) return reply({ error: "Staff account not found" }, 404);
      if (action === "delete") {
        const { error } = await db.auth.admin.deleteUser(staff.user_id); if (error) throw error;
      } else if (action === "permissions") {
        if (!Array.isArray(allowedPages)) return reply({ error: "Invalid permissions" }, 400);
        const { error } = await db.from("staff_access").update({ allowed_pages: allowedPages }).eq("user_id", staff.user_id); if (error) throw error;
      } else return reply({ error: "Unknown action" }, 400);
      return reply({ ok: true });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || password.length < 8 || !Array.isArray(allowedPages))
      return reply({ error: "Valid username/email and at least 8-character password required" }, 400);
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    const id = data.user.id;
    try {
      const { error: roleInsertError } = await db.from("user_roles").insert({ user_id: id, role: desiredRole });
      if (roleInsertError) throw roleInsertError;
      if (desiredRole === "staff") {
        const { error: accessError } = await db.from("staff_access").insert({ user_id: id, display_name: displayName || body.username || email, allowed_pages: allowedPages });
        if (accessError) throw accessError;
      }
    } catch (error) { await db.auth.admin.deleteUser(id); throw error; }
    return reply({ user_id: id });
  } catch (error: any) { return reply({ error: error.message }, 400); }
});
