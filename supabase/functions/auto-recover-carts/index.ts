import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface CartRow {
  id: string;
  customer_email: string | null;
  cart_value: number | null;
  cart_items: unknown;
  created_at: string;
  status: string;
  auto_email_1_sent_at: string | null;
  auto_email_2_sent_at: string | null;
  auto_email_3_sent_at: string | null;
  recovery_emails_sent: number | null;
}

// ── Email template builder ────────────────────────────────────────────
function buildItemsHtml(cartItems: unknown): string {
  const items = Array.isArray(cartItems) ? cartItems : [];
  if (items.length === 0) return '<tr><td colspan="3" style="padding:12px;text-align:center;color:#999;">Your selected items</td></tr>';
  return items
    .map((item: Record<string, unknown>) => {
      const name = item.product_id || item.name || "Item";
      const qty = item.quantity || 1;
      const price = Number(item.line_total || item.price || 0);
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#333;">${name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#333;text-align:center;">${qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#333;text-align:right;">₹${price.toLocaleString("en-IN")}</td>
      </tr>`;
    })
    .join("");
}

interface EmailTemplate {
  subject: string;
  heading: string;
  message: string;
  cta: string;
  urgencyColor: string;
}

const TEMPLATES: Record<1 | 2 | 3, (cartValue: string) => EmailTemplate> = {
  1: (v) => ({
    subject: `You left items worth ₹${v} in your cart`,
    heading: "Still deciding?",
    message: "We noticed you left some items in your cart just a short while ago. No worries — your selection is still saved and ready for checkout!",
    cta: "Complete Your Purchase →",
    urgencyColor: "#667eea",
  }),
  2: (v) => ({
    subject: `⏰ Your ₹${v} cart is waiting — items selling fast!`,
    heading: "Don't miss out!",
    message: "Your cart items are popular and stock is limited. Complete your purchase now before they're gone!",
    cta: "Grab Your Items Now →",
    urgencyColor: "#e67e22",
  }),
  3: (v) => ({
    subject: `🔥 Last chance! Your ₹${v} cart expires soon`,
    heading: "Final reminder",
    message: "This is your last reminder — your saved cart will expire soon. Don't let these items slip away!",
    cta: "Complete Purchase Before It's Gone →",
    urgencyColor: "#e74c3c",
  }),
};

function buildEmailHtml(cart: CartRow, level: 1 | 2 | 3): { html: string; subject: string } {
  const cartValue = Number(cart.cart_value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
  const tpl = TEMPLATES[level](cartValue);
  const itemsHtml = buildItemsHtml(cart.cart_items);

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:30px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;">XBoom</h1>
      <p style="color:#a0aec0;margin:8px 0 0;font-size:14px;">${tpl.heading}</p>
    </div>
    <div style="padding:30px;">
      <p style="color:#333;font-size:16px;line-height:1.6;">Hi there,</p>
      <p style="color:#555;font-size:14px;line-height:1.6;">${tpl.message}</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <thead><tr style="background:#f7f8fa;">
          <th style="padding:10px 12px;text-align:left;font-size:13px;color:#666;border-bottom:2px solid #e2e8f0;">Product</th>
          <th style="padding:10px 12px;text-align:center;font-size:13px;color:#666;border-bottom:2px solid #e2e8f0;">Qty</th>
          <th style="padding:10px 12px;text-align:right;font-size:13px;color:#666;border-bottom:2px solid #e2e8f0;">Price</th>
        </tr></thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot><tr>
          <td colspan="2" style="padding:12px;font-weight:bold;font-size:16px;color:#333;">Total</td>
          <td style="padding:12px;font-weight:bold;font-size:16px;color:#333;text-align:right;">₹${cartValue}</td>
        </tr></tfoot>
      </table>
      <div style="text-align:center;margin:30px 0;">
        <a href="https://www.xboom.in/cart/" style="display:inline-block;background:${tpl.urgencyColor};color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:16px;font-weight:bold;">${tpl.cta}</a>
      </div>
      <p style="color:#999;font-size:12px;text-align:center;margin-top:30px;">Need help? Reply to this email or call us.<br/>© XBoom - Premium Drone Solutions</p>
    </div>
  </div>
</body>
</html>`;

  return { html, subject: tpl.subject };
}

// ── Send email via Resend ─────────────────────────────────────────────
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  resendApiKey: string
): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "XBoom <noreply@xboom.in>",
        to: [to],
        subject,
        html,
      }),
    });
    const body = await res.text();
    return res.ok
      ? { ok: true, detail: body }
      : { ok: false, detail: `Resend [${res.status}]: ${body}` };
  } catch (err) {
    return { ok: false, detail: String(err) };
  }
}

// ── Main handler ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth: cron secret or JWT
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  let isAuthorized = false;

  if (cronSecret && expectedSecret && cronSecret === expectedSecret) {
    isAuthorized = true;
  } else {
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data, error } = await supabaseAuth.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!error && data?.user?.id) isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Fetch eligible carts (active/contacted, have email, created in last 48h)
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: carts, error: fetchErr } = await supabase
      .from("abandoned_carts")
      .select("id,customer_email,cart_value,cart_items,created_at,status,auto_email_1_sent_at,auto_email_2_sent_at,auto_email_3_sent_at,recovery_emails_sent")
      .in("status", ["active", "contacted"])
      .not("customer_email", "is", null)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });

    if (fetchErr) throw fetchErr;
    if (!carts || carts.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, message: "No eligible carts" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = Date.now();
    let emailsSent = 0;
    let errors = 0;

    for (const cart of carts as CartRow[]) {
      if (!cart.customer_email) continue;

      const ageMs = now - new Date(cart.created_at).getTime();
      const ageMinutes = ageMs / (1000 * 60);

      // Determine which email level to send
      let level: 1 | 2 | 3 | null = null;
      let emailField: string | null = null;

      if (!cart.auto_email_1_sent_at && ageMinutes >= 30) {
        level = 1;
        emailField = "auto_email_1_sent_at";
      } else if (!cart.auto_email_2_sent_at && ageMinutes >= 360) {
        level = 2;
        emailField = "auto_email_2_sent_at";
      } else if (!cart.auto_email_3_sent_at && ageMinutes >= 1440) {
        level = 3;
        emailField = "auto_email_3_sent_at";
      }

      if (!level || !emailField) continue;

      const { html, subject } = buildEmailHtml(cart, level);
      const result = await sendEmail(cart.customer_email, subject, html, resendApiKey);

      if (result.ok) {
        emailsSent++;
        const currentCount = Number(cart.recovery_emails_sent || 0);
        await supabase
          .from("abandoned_carts")
          .update({
            [emailField]: new Date().toISOString(),
            status: "contacted",
            contacted_at: new Date().toISOString(),
            recovery_emails_sent: currentCount + 1,
            last_contacted_by_name: "Auto Recovery",
            recovery_notes: `Auto email #${level} sent`,
            updated_at: new Date().toISOString(),
            priority: (cart.cart_value || 0) > 10000 ? "high" : "normal",
          })
          .eq("id", cart.id);

        await supabase.from("domain_events").insert({
          entity_type: "abandoned_cart_recovery",
          entity_id: cart.id,
          event_type: "auto_recovery_email_sent",
          payload: {
            email: cart.customer_email,
            level,
            cart_value: cart.cart_value,
            triggered_by: "auto_cron",
          },
        });
      } else {
        errors++;
        console.error(`[auto-recover] Failed for cart ${cart.id}: ${result.detail}`);
        await supabase.from("domain_events").insert({
          entity_type: "abandoned_cart_recovery",
          entity_id: cart.id,
          event_type: "auto_recovery_email_failed",
          payload: {
            email: cart.customer_email,
            level,
            error: result.detail,
          },
        });
      }

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 300));
    }

    const summary = {
      success: true,
      processed: carts.length,
      emails_sent: emailsSent,
      errors,
      timestamp: new Date().toISOString(),
    };

    console.log("[auto-recover-carts] Complete:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[auto-recover-carts] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
