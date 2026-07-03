import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function pathFromUrl(u: string): string | null {
  const m = u.match(/\/storage\/v1\/object\/(?:public|sign)\/purchase-orders\/(.+?)(?:\?|$)/);
  return m ? decodeURIComponent(m[1]) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: u } = await supabase.auth.getUser(auth);
    if (!u?.user) return json({ error: "Unauthorized" }, 401);

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id);
    const allowed = new Set(["admin", "finance", "supply_chain"]);
    if (!roles?.some((r: { role: string }) => allowed.has(r.role))) {
      return json({ error: "Forbidden" }, 403);
    }

    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "8", 10);
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, order_number, po_url, po_number")
      .not("po_url", "is", null)
      .or("po_number.is.null,po_number.eq.")
      .order("order_number")
      .limit(limit);
    if (error) return json({ error: error.message }, 500);

    const results: any[] = [];
    for (const o of orders ?? []) {
      if (o.po_number && o.po_number.trim()) { results.push({ id: o.id, order_number: o.order_number, skipped: "already has po_number", po_number: o.po_number }); continue; }
      const first = String(o.po_url).split(",")[0].trim();
      const path = pathFromUrl(first);
      if (!path) { results.push({ id: o.id, order_number: o.order_number, error: "bad url" }); continue; }
      const { data: blob, error: dlErr } = await supabase.storage.from("purchase-orders").download(path);
      if (dlErr || !blob) { results.push({ id: o.id, order_number: o.order_number, error: "download: " + (dlErr?.message ?? "no blob") }); continue; }
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = ""; const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk));
      const b64 = btoa(bin);
      const ext = path.split(".").pop()?.toLowerCase();
      const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "application/pdf";
      const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You extract the Purchase Order (PO) number from purchase order documents. Return ONLY the PO number as plain text. No labels, no quotes, no extra words. If unsure, return an empty string." },
            { role: "user", content: [
              { type: "text", text: "Extract the PO number from this purchase order document." },
              { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
            ]},
          ],
        }),
      });
      if (!ai.ok) { results.push({ id: o.id, order_number: o.order_number, error: `ai ${ai.status}` }); continue; }
      const j = await ai.json();
      const po = (j?.choices?.[0]?.message?.content ?? "").trim().replace(/^["']|["']$/g, "").slice(0, 100);
      if (po) await supabase.from("orders").update({ po_number: po }).eq("id", o.id);
      results.push({ id: o.id, order_number: o.order_number, po_number: po });
    }
    return json({ count: results.length, results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});