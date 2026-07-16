import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const EL_BASE = "https://api.elevenlabs.io";

// Defaults — overridable via env without code change.
const DEFAULT_FOLDER_IDS = [
  "3dZHO2CIYGrzr06tFo7B", // www.xboom.in crawl
  "zukwN51pjotbQ88U1LWd", // safetygadgets.in crawl
];
const DEFAULT_AGENT_ID = "agent_9401kns7j9x3fxa9cj2e6xqgk0be";

interface RefreshOutcome {
  document_id: string;
  name?: string;
  url?: string;
  status: number;
  ok: boolean;
  error?: string;
}
interface FolderOutcome {
  folder_id: string;
  listed: number;
  refreshed: RefreshOutcome[];
  error?: string;
}

async function listUrlDocsInFolder(apiKey: string, folderId: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams({
      ancestor_folder_id: folderId,
      types: "url",
      page_size: "100",
    });
    if (cursor) qs.set("cursor", cursor);
    const resp = await fetch(`${EL_BASE}/v1/convai/knowledge-base?${qs.toString()}`, {
      headers: { "xi-api-key": apiKey },
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(`list folder ${folderId} failed [${resp.status}]: ${JSON.stringify(body)}`);
    }
    for (const d of body.documents || []) out.push(d);
    if (!body.has_more || !body.next_cursor) break;
    cursor = body.next_cursor;
  }
  return out;
}

async function refreshDoc(apiKey: string, docId: string): Promise<{ status: number; body: any }> {
  const resp = await fetch(`${EL_BASE}/v1/convai/knowledge-base/${docId}/refresh`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
  });
  const body = await resp.json().catch(async () => ({ text: await resp.text().catch(() => "") }));
  return { status: resp.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET");
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Dual-gate auth: X-Cron-Secret OR admin JWT
  let authorized = false;
  let triggeredBy = "cron";
  const cronHeader = req.headers.get("x-cron-secret");
  if (cronSecret && cronHeader === cronSecret) {
    authorized = true;
  } else {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: userData } = await supabase.auth.getUser(token);
      if (userData?.user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id);
        if ((roles || []).some((r: any) => r.role === "admin")) {
          authorized = true;
          triggeredBy = `user:${userData.user.id}`;
        }
      }
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Config: env override → default constants
  const envFolders = (Deno.env.get("ELEVENLABS_KB_FOLDER_IDS") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const folderIds = envFolders.length ? envFolders : DEFAULT_FOLDER_IDS;
  const agentId = Deno.env.get("ELEVENLABS_AGENT_ID") || DEFAULT_AGENT_ID;

  const runWork = async () => {
    const results: FolderOutcome[] = [];
    for (const folderId of folderIds) {
    const outcome: FolderOutcome = { folder_id: folderId, listed: 0, refreshed: [] };
    try {
      const docs = await listUrlDocsInFolder(apiKey, folderId);
      outcome.listed = docs.length;
        console.log(`[kb-refresh] folder ${folderId}: ${docs.length} url docs`);
        // Parallel refresh with concurrency limit
        const CONCURRENCY = 8;
        let cursor = 0;
        const workers = Array.from({ length: CONCURRENCY }, async () => {
          while (true) {
            const idx = cursor++;
            if (idx >= docs.length) return;
            const doc = docs[idx];
            try {
              const { status, body } = await refreshDoc(apiKey, doc.id);
              outcome.refreshed.push({
                document_id: doc.id,
                name: doc.name,
                url: doc?.url || doc?.extracted_inner_html_url,
                status,
                ok: status >= 200 && status < 300,
                error: status >= 400 ? JSON.stringify(body).slice(0, 400) : undefined,
              });
            } catch (e) {
              outcome.refreshed.push({
                document_id: doc.id, name: doc.name, status: 0, ok: false, error: String(e).slice(0, 400),
              });
            }
          }
        });
        await Promise.all(workers);
    } catch (e) {
      outcome.error = String(e).slice(0, 1000);
    }
    results.push(outcome);
      // Log progress per folder in case we're killed mid-run
      try {
        await supabase.from("domain_events").insert({
          event_type: "elevenlabs.kb_refresh",
          payload: {
            triggered_by: triggeredBy,
            agent_id: agentId,
            folder_id: folderId,
            partial: true,
            mechanism: "per_url_document_refresh",
            listed: outcome.listed,
            refreshed_ok: outcome.refreshed.filter((x) => x.ok).length,
            refreshed_total: outcome.refreshed.length,
            error: outcome.error,
            failures: outcome.refreshed.filter((x) => !x.ok).slice(0, 20),
          },
        });
      } catch (e) {
        console.error("per-folder log failed", e);
      }
    }
    const total = results.reduce((s, r) => s + r.refreshed.length, 0);
    const ok = results.reduce((s, r) => s + r.refreshed.filter((x) => x.ok).length, 0);
    try {
      await supabase.from("domain_events").insert({
        event_type: "elevenlabs.kb_refresh",
        payload: {
          triggered_by: triggeredBy,
          agent_id: agentId,
          folder_ids: folderIds,
          mechanism: "per_url_document_refresh",
          total_docs: total,
          refreshed_ok: ok,
          results,
        },
      });
    } catch (e) {
      console.error("domain_events insert failed", e);
    }
    console.log(`[kb-refresh] done: total=${total} ok=${ok}`);
  };

  // Respond immediately; work continues in the background.
  // deno-lint-ignore no-explicit-any
  const rt: any = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(runWork());
  else runWork().catch((e) => console.error("runWork failed", e));

  return new Response(JSON.stringify({
    triggered_by: triggeredBy,
    status: "accepted",
    mechanism: "per_url_document_refresh",
    agent_id: agentId,
    folder_ids: folderIds,
    note: "Refresh runs in the background; per-doc outcomes are logged to domain_events (event_type='elevenlabs.kb_refresh').",
  }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});