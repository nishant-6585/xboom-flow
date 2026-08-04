// Webhook receiver for the Mikee reception robot (TimoDesk spine) — showroom
// Order / Enquiry FABs on the robot's chest screen. Verifies mandatory
// HMAC-SHA256 signature (same scheme as leads-incoming), validates, inserts
// into public.enquiries with lead_source 'walk_in'. The salesperson is left
// unset so auto_assign_enquiry_salesperson round-robins it; phone/email ride
// in notes because enquiries has no contact columns.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-xbm-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0) return new Uint8Array();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifyHmac(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const match = signatureHeader.match(/^sha256=([a-fA-F0-9]+)$/);
  if (!match) return false;
  const expected = hexToBytes(match[1]);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const computed = new Uint8Array(sigBuf);
  return timingSafeEqual(expected, computed);
}

const str = (v: unknown, max: number): string =>
  (typeof v === "string" ? v : "").trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  const rawBody = await req.text();

  // Mandatory HMAC verification — reject if secret is unset or signature missing/invalid
  const sigHeader = req.headers.get("x-xbm-signature");
  const secret = Deno.env.get("ROBOT_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[robot-lead-incoming] ROBOT_WEBHOOK_SECRET not configured");
    return json({ ok: false, error: "server misconfigured" }, 500);
  }
  if (!sigHeader) {
    return json({ ok: false, error: "missing signature" }, 401);
  }
  const sigOk = await verifyHmac(rawBody, sigHeader, secret);
  if (!sigOk) return json({ ok: false, error: "invalid signature" }, 401);

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ ok: false, error: "body must be an object" }, 400);
  }

  const kind = body.kind === "order" ? "order" : body.kind === "enquiry" ? "enquiry" : null;
  if (!kind) return json({ ok: false, error: "kind must be 'order' or 'enquiry'" }, 400);

  const name = str(body.name, 120);
  const phone = str(body.phone, 20);
  const product = str(body.product, 300);
  const email = str(body.email, 254);
  const notes = str(body.notes, 500);
  if (name.length < 2) return json({ ok: false, error: "name required" }, 400);
  if (!/^[0-9+()\-\s]{6,20}$/.test(phone)) {
    return json({ ok: false, error: "valid phone required" }, 400);
  }
  if (!product) return json({ ok: false, error: "product required" }, 400);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: "invalid email" }, 400);
  }
  const quantity =
    typeof body.quantity === "number" && Number.isFinite(body.quantity)
      ? Math.max(1, Math.min(99, Math.round(body.quantity)))
      : 1;

  // Real SKU when the visitor picked from the robot-catalog browser;
  // 'WALK-IN' for free-text products with no catalog match.
  const productCode = str(body.product_code, 64) || "WALK-IN";

  // Contact details go in notes — enquiries has no phone/email columns.
  const noteLines = [
    `Showroom robot (reception kiosk) ${kind === "order" ? "ORDER request" : "enquiry"}.`,
    `Phone: ${phone}`,
  ];
  if (email) noteLines.push(`Email: ${email}`);
  if (notes) noteLines.push(`Visitor notes: ${notes}`);

  const row = {
    product_name: product,
    product_code: productCode,
    quantity,
    customer_name: name,
    customer_company: str(body.company, 120) || "Walk-in visitor",
    customer_type: "b2c",
    // An order request is a person standing in the showroom ready to buy.
    urgency: kind === "order" ? "high" : "medium",
    lead_temperature: kind === "order" ? "hot" : "warm",
    lead_source: "walk_in",
    notes: noteLines.join("\n"),
    // sales_person_id / sales_person_name deliberately omitted →
    // auto_assign_enquiry_salesperson round-robins the team.
  };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("enquiries")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("[robot-lead-incoming] insert failed", error);
    return json({ ok: false, error: "insert_failed" }, 500);
  }

  return json({ ok: true, id: data.id });
});
