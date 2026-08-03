import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AGENTS_URL = "https://api.interakt.ai/v1/public/apis/agents/";

type Agent = { id?: string; uuid?: string; name?: string; full_name?: string; email?: string };

function pickId(a: Agent): string | null {
  return a.id ?? a.uuid ?? null;
}
function pickName(a: Agent): string | null {
  return a.full_name ?? a.name ?? a.email ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "admin")) {
      return json({ error: "Only admins can fetch Interakt agents" }, 403);
    }

    const key = Deno.env.get("INTERAKT_API_KEY");
    if (!key) return json({ error: "Interakt API key not configured" }, 500);

    const res = await fetch(AGENTS_URL, {
      method: "GET",
      headers: { Authorization: `Basic ${key}`, "Content-Type": "application/json" },
    });
    const text = await res.text();

    if (!res.ok) {
      let message = `Interakt agents API error (${res.status})`;
      if (res.status === 403) {
        message =
          "Interakt rejected the agent lookup: this API key does not have permission to read agents. " +
          "Ask Interakt support (or your Interakt account owner) to enable agent/team read access for the API key, then retry.";
      }
      console.error("interakt_agents_error", res.status, text.slice(0, 300));
      return json({ error: message, status: res.status }, 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: "Interakt returned an unexpected (non-JSON) response" }, 502);
    }
    const list: Agent[] = Array.isArray(parsed)
      ? (parsed as Agent[])
      : (((parsed as Record<string, unknown>)?.data as Agent[]) ??
         ((parsed as Record<string, unknown>)?.agents as Agent[]) ??
         ((parsed as Record<string, unknown>)?.results as Agent[]) ??
         []);

    let updated = 0;
    const agents: { owner_id: string; agent_name: string }[] = [];
    for (const a of list) {
      const id = pickId(a);
      const name = pickName(a);
      if (!id || !name) continue;
      agents.push({ owner_id: id, agent_name: name });
      const { error } = await admin.rpc("upsert_interakt_owner_label_admin", {
        _owner_id: id,
        _agent_name: name,
      });
      if (!error) updated += 1;
      else console.error("label_upsert_failed", id, error.message);
    }

    return json({ ok: true, agents_found: agents.length, labels_updated: updated, agents });
  } catch (e) {
    console.error("interakt_fetch_agents_unhandled", String(e));
    return json({ error: "Unexpected error while fetching Interakt agents" }, 500);
  }
});
