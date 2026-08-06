// Webhook receiver for the Mikee reception robot (TimoDesk spine) — showroom
// Order / Enquiry FABs on the robot's chest screen. Verifies mandatory
// HMAC-SHA256 signature (same scheme as leads-incoming), validates, then:
//   kind "enquiry" → public.enquiries with lead_source 'walk_in'; salesperson
//     left unset so auto_assign_enquiry_salesperson round-robins it, phone/
//     email ride in notes because enquiries has no contact columns.
//   kind "order"   → public.orders shaped like a manual createOrder (status
//     'po_received', source 'walk_in'); orders has no auto-assign trigger and
//     sales_person_id is NOT NULL, so the same round-robin (same pool, same
//     lead_assignment_counter) runs here in TS before the insert. If the
//     order path can't complete (empty pool / insert rejected), we fall back
//     to the enquiry path so the walk-in is never dropped.
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

type Assignee = { uid: string; uname: string };

// Mirrors public.auto_assign_salesperson() — the BEFORE INSERT trigger that
// round-robins enquiries: available pool first, full allow-list when everyone
// is unavailable, index driven by the shared lead_assignment_counter so robot
// orders and enquiries draw from one fair rotation. Returns null only when
// the pool RPCs come back empty/erroring.
async function pickRoundRobinSalesperson(
  supabase: ReturnType<typeof createClient>,
): Promise<Assignee | null> {
  let pool: Assignee[] = [];
  const avail = await supabase.rpc("available_website_lead_assignees");
  if (!avail.error && Array.isArray(avail.data) && avail.data.length) {
    pool = avail.data as Assignee[];
  }
  if (!pool.length) {
    const all = await supabase.rpc("allowed_website_lead_assignees");
    if (!all.error && Array.isArray(all.data) && all.data.length) {
      pool = all.data as Assignee[];
    }
  }
  if (!pool.length) return null;
  pool.sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));

  // Optimistic counter bump (PostgREST can't do counter = counter + 1
  // atomically); on contention fall back to a random pick rather than fail.
  let counter: number | null = null;
  for (let attempt = 0; attempt < 3 && counter === null; attempt++) {
    const { data: cur, error: readErr } = await supabase
      .from("lead_assignment_counter")
      .select("counter")
      .eq("id", 1)
      .maybeSingle();
    if (readErr) break;
    const prev = cur?.counter ?? 0;
    const { data: upd, error: updErr } = await supabase
      .from("lead_assignment_counter")
      .update({ counter: prev + 1 })
      .eq("id", 1)
      .eq("counter", prev)
      .select("counter");
    if (!updErr && upd?.length) counter = prev + 1;
  }
  if (counter === null) counter = Math.floor(Math.random() * pool.length) + 1;
  return pool[(counter - 1) % pool.length];
}

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const customerCompany = str(body.company, 120) || "Walk-in visitor";

  if (kind === "order") {
    const sp = await pickRoundRobinSalesperson(supabase);
    if (!sp) {
      console.error(
        "[robot-lead-incoming] no assignable salesperson — falling back to enquiry",
      );
    } else {
      // Same shape as the manual createOrder path (src/hooks/useOrders.ts):
      // status 'po_received', order_number/order_date/procurement left to DB
      // triggers/defaults. lead_source uses the orders UI vocabulary
      // ('walk-in', hyphen) so the row matches manually created walk-ins;
      // source 'walk_in' marks the robot channel.
      const orderRow = {
        product_name: product,
        product_code: productCode,
        product_category: "Consumer Drones",
        quantity,
        customer_name: name,
        customer_company: customerCompany,
        customer_email: email || null,
        customer_phone: phone,
        customer_type: "b2c",
        order_type: "prepaid",
        status: "po_received",
        payment_status: "pending",
        source: "walk_in",
        lead_source: "walk-in",
        sales_person_id: sp.uid,
        sales_person_name: sp.uname,
        created_by: sp.uid,
        internal_notes: noteLines.join("\n"),
        customer_notes: notes || null,
      };

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert(orderRow)
        .select("id, order_number")
        .single();

      if (!orderErr && order) {
        // The enquiry path notified via notify_on_hot_lead_enquiry (order
        // kind was always lead_temperature 'hot'); orders have no such
        // trigger, so fire the equivalent broadcast here. Non-fatal.
        const { error: notifErr } = await supabase.from("notifications").insert({
          type: "hot_lead",
          title: "🔥 New Walk-in Order!",
          message:
            `${name} from ${customerCompany} - ${product} (${quantity} qty). ` +
            `Sales: ${sp.uname}. Order ${order.order_number}`,
          order_id: order.id,
        });
        if (notifErr) {
          console.error("[robot-lead-incoming] notification insert failed", notifErr);
        }
        return json({
          ok: true,
          id: order.id,
          order_number: order.order_number,
          kind: "order",
        });
      }

      console.error(
        "[robot-lead-incoming] order insert failed — falling back to enquiry",
        orderErr,
      );
    }
  }

  // kind === "enquiry", plus the safety net when the order path can't land:
  // the enquiry row keeps the high/hot marking for order requests so staff
  // still see it as a ready-to-buy walk-in.
  const row = {
    product_name: product,
    product_code: productCode,
    quantity,
    customer_name: name,
    customer_company: customerCompany,
    customer_type: "b2c",
    // An order request is a person standing in the showroom ready to buy.
    urgency: kind === "order" ? "high" : "medium",
    lead_temperature: kind === "order" ? "hot" : "warm",
    lead_source: "walk_in",
    notes: noteLines.join("\n"),
    // sales_person_id / sales_person_name deliberately omitted →
    // auto_assign_enquiry_salesperson round-robins the team.
  };

  const { data, error } = await supabase
    .from("enquiries")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("[robot-lead-incoming] insert failed", error);
    return json({ ok: false, error: "insert_failed" }, 500);
  }

  return json({ ok: true, id: data.id, kind: "enquiry" });
});
