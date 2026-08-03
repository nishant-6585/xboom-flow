import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CANDIDATES = [
  "https://api.interakt.ai/v1/public/apis/agents/",
  "https://api.interakt.ai/v1/public/apis/organizations/agents/",
  "https://api.interakt.ai/v1/public/apis/crm/agents/",
  "https://api.interakt.ai/v1/public/apis/users/agents/",
  "https://api.interakt.ai/v1/public/apis/contact-owners/",
  "https://api.interakt.ai/v1/public/apis/team/members/",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "Unauthorized" }, 401);
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
  if (!(roles ?? []).some((r: { role: string }) => r.role === "admin")) return json({ error: "Forbidden" }, 403);

  const key = Deno.env.get("INTERAKT_API_KEY");
  if (!key) return json({ error: "INTERAKT_API_KEY not configured" }, 500);

  const results: unknown[] = [];
  for (const url of CANDIDATES) {
    for (const method of ["GET", "POST"] as const) {
      try {
        const res = await fetch(url, {
          method,
          headers: { Authorization: `Basic ${key}`, "Content-Type": "application/json" },
          ...(method === "POST" ? { body: "{}" } : {}),
        });
        const text = (await res.text()).slice(0, 600);
        results.push({ url, method, status: res.status, body: text });
      } catch (e) {
        results.push({ url, method, error: String(e) });
      }
    }
  }
  return json({ results });
});
