// Public walk-in / referral lead capture endpoint.
// GET  -> returns the list of sales reps a lead can be assigned to.
// POST -> validates payload and inserts a row in public.form_leads.
// No auth required (public form), so every write is validated + rate limited.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const FORM_NAME = "Walk-in / Referral Capture";

const ALLOWED_SOURCES = [
  "Referral",
  "Walk-in",
  "Exhibition / Event",
  "Cold Call",
  "WhatsApp",
  "Phone Call",
  "Email",
  "Website",
  "IndiaMART",
  "Just Dial",
  "Trade India",
  "Social Media",
  "Dealer / Partner",
  "Repeat Customer",
  "Other",
] as const;

const BodySchema = z.object({
  customer_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(20).regex(/^[+0-9 ()-]+$/),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  product_name: z.string().trim().max(200).optional().or(z.literal("")),
  quantity: z.coerce.number().int().min(1).max(9999).optional(),
  lead_source: z.enum(ALLOWED_SOURCES),
  referred_by: z.string().trim().max(160).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  /** "" / "auto" => round-robin assignment */
  sales_person_id: z.string().uuid().optional().or(z.literal("")).or(z.literal("auto")),
});

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function listReps(sb: ReturnType<typeof admin>) {
  const { data, error } = await sb.rpc("allowed_website_lead_assignees");
  if (error) throw error;
  return ((data ?? []) as any[])
    .map((r) => ({ id: r.uid as string, name: (r.uname as string) || "Unknown" }))
    .filter((r) => !!r.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = admin();

  try {
    if (req.method === "GET") {
      return json({ ok: true, sources: ALLOWED_SOURCES, reps: await listReps(sb) });
    }

    if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    const { data: allowed } = await sb.rpc("check_rate_limit", {
      p_key: `capture-lead:${ip}`,
      p_max_requests: 10,
      p_window_ms: 600000,
    });
    if (allowed === false) {
      return json({ ok: false, error: "Too many submissions. Please try again later." }, 429);
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return json({ ok: false, error: "invalid json" }, 400);
    }

    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return json({ ok: false, error: "Please check the form fields", fields: parsed.error.flatten().fieldErrors }, 400);
    }
    const b = parsed.data;

    // Resolve assignee
    const reps = await listReps(sb);
    let assignee: { id: string; name: string } | null = null;
    if (b.sales_person_id && b.sales_person_id !== "auto") {
      assignee = reps.find((r) => r.id === b.sales_person_id) ?? null;
      if (!assignee) return json({ ok: false, error: "Selected salesperson is not available" }, 400);
    } else if (reps.length > 0) {
      // Round-robin: pick the rep with the fewest capture-form leads so far.
      const { data: recent } = await sb
        .from("form_leads")
        .select("assigned_to")
        .eq("form_name", FORM_NAME)
        .not("assigned_to", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);
      const counts = new Map<string, number>(reps.map((r) => [r.id, 0]));
      (recent ?? []).forEach((r: any) => {
        if (counts.has(r.assigned_to)) counts.set(r.assigned_to, (counts.get(r.assigned_to) ?? 0) + 1);
      });
      assignee = reps.reduce((best, r) =>
        (counts.get(r.id) ?? 0) < (counts.get(best.id) ?? 0) ? r : best, reps[0]);
    }

    const noteParts: string[] = [`Lead Source: ${b.lead_source}`];
    if (b.referred_by) noteParts.push(`Referred by: ${b.referred_by}`);
    if (b.quantity) noteParts.push(`Qty: ${b.quantity}`);
    if (b.notes) noteParts.push(b.notes);

    const { data, error } = await sb
      .from("form_leads")
      .insert({
        form_name: FORM_NAME,
        customer_name: b.customer_name,
        phone: b.phone,
        email: b.email || null,
        company: b.company || null,
        city: b.city || null,
        product_name: b.product_name || null,
        lead_source: b.lead_source,
        notes: noteParts.join(" | "),
        status: "new",
        assigned_to: assignee?.id ?? null,
        assigned_to_name: assignee?.name ?? null,
        sales_person_id: assignee?.id ?? null,
        sales_person_name: assignee?.name ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[capture-lead-public] insert failed", error.message);
      return json({ ok: false, error: "Could not save the lead. Please try again." }, 500);
    }

    return json({ ok: true, id: data.id, assigned_to_name: assignee?.name ?? null });
  } catch (e) {
    console.error("[capture-lead-public] error", (e as Error).message);
    return json({ ok: false, error: "Unexpected error" }, 500);
  }
});
