import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { order_id, storage_path } = await req.json();
    if (!order_id || !storage_path) {
      return jsonResponse({ error: "order_id and storage_path are required" }, 400);
    }

    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from("purchase-orders")
      .download(storage_path);
    if (dlErr || !fileBlob) return jsonResponse({ error: "Failed to download PO" }, 500);

    const arrayBuf = await fileBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);

    const ext = storage_path.split(".").pop()?.toLowerCase();
    let mimeType = "application/pdf";
    if (ext === "png") mimeType = "image/png";
    else if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
    else if (ext === "webp") mimeType = "image/webp";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You extract the Purchase Order (PO) number from purchase order documents. Return ONLY the PO number as plain text. No labels, no quotes, no extra words. If unsure, return an empty string.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the PO number from this purchase order document." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      if (aiRes.status === 429) return jsonResponse({ error: "Rate limited" }, 429);
      if (aiRes.status === 402) return jsonResponse({ error: "AI credits exhausted" }, 402);
      return jsonResponse({ error: "AI extraction failed" }, 500);
    }

    const aiJson = await aiRes.json();
    const raw: string = aiJson?.choices?.[0]?.message?.content ?? "";
    const poNumber = raw.trim().replace(/^["']|["']$/g, "").slice(0, 100);

    if (poNumber) {
      // Only set if order doesn't already have a PO number (don't overwrite manual entries)
      const { data: existing } = await supabase
        .from("orders")
        .select("po_number")
        .eq("id", order_id)
        .maybeSingle();
      if (!existing?.po_number) {
        await supabase.from("orders").update({ po_number: poNumber }).eq("id", order_id);
      }
    }

    return jsonResponse({ po_number: poNumber });
  } catch (err) {
    console.error("extract-po-number error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});