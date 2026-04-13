import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  cart_id: z.string().uuid(),
  action: z.enum(["send_email", "mark_recovered", "mark_lost"]),
  notes: z.string().optional(),
  user_name: z.string().optional(),
});

function buildEmailHtml(cart: Record<string, unknown>): string {
  const cartItems = Array.isArray(cart.cart_items) ? cart.cart_items : [];
  const itemsHtml = cartItems
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

  const cartValue = Number(cart.cart_value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
  });

  const sessionId = cart.session_id as string | null;
  const restoreUrl = sessionId
    ? `https://xboom.in/cart?restore_cart=${encodeURIComponent(sessionId)}`
    : "https://xboom.in/cart/";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:30px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;">XBoom</h1>
      <p style="color:#a0aec0;margin:8px 0 0;font-size:14px;">Your cart is waiting for you!</p>
    </div>
    <div style="padding:30px;">
      <p style="color:#333;font-size:16px;line-height:1.6;">Hi there,</p>
      <p style="color:#555;font-size:14px;line-height:1.6;">We noticed you left some items in your cart. Don't worry — your selection is still saved!</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <thead>
          <tr style="background:#f7f8fa;">
            <th style="padding:10px 12px;text-align:left;font-size:13px;color:#666;border-bottom:2px solid #e2e8f0;">Product</th>
            <th style="padding:10px 12px;text-align:center;font-size:13px;color:#666;border-bottom:2px solid #e2e8f0;">Qty</th>
            <th style="padding:10px 12px;text-align:right;font-size:13px;color:#666;border-bottom:2px solid #e2e8f0;">Price</th>
          </tr>
        </thead>
        <tbody>${itemsHtml || '<tr><td colspan="3" style="padding:12px;text-align:center;color:#999;">Your selected items</td></tr>'}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding:12px;font-weight:bold;font-size:16px;color:#333;">Total</td>
            <td style="padding:12px;font-weight:bold;font-size:16px;color:#333;text-align:right;">₹${cartValue}</td>
          </tr>
        </tfoot>
      </table>
      <div style="text-align:center;margin:30px 0;">
        <a href="${restoreUrl}" style="display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:16px;font-weight:bold;">Complete Your Purchase →</a>
      </div>
      <p style="color:#999;font-size:12px;text-align:center;margin-top:30px;">Need help? Reply to this email or call us.<br/>© XBoom - Premium Drone Solutions</p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !authData?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { cart_id, action, notes, user_name } = parsed.data;

    const { data: cart, error: cartError } = await supabase
      .from("abandoned_carts")
      .select("*")
      .eq("id", cart_id)
      .single();

    if (cartError || !cart) {
      return new Response(
        JSON.stringify({ error: "Cart not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "mark_recovered") {
      await supabase
        .from("abandoned_carts")
        .update({
          status: "recovered",
          recovery_notes: notes || "Manually marked as recovered",
          recovered_at: new Date().toISOString(),
          recovered_amount: cart.cart_value || 0,
          recovery_source: "manual",
          updated_at: new Date().toISOString(),
        })
        .eq("id", cart_id);

      return new Response(
        JSON.stringify({ success: true, action: "mark_recovered" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "mark_lost") {
      await supabase
        .from("abandoned_carts")
        .update({
          status: "lost",
          recovery_notes: notes || "Manually marked as lost",
          updated_at: new Date().toISOString(),
        })
        .eq("id", cart_id);

      return new Response(
        JSON.stringify({ success: true, action: "mark_lost" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // send_email action
    if (!cart.customer_email) {
      return new Response(
        JSON.stringify({ error: "No email address available for this cart" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailHtml = buildEmailHtml(cart);
    const cartValue = Number(cart.cart_value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
    });

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "XBoom <noreply@xboom.in>",
        to: [cart.customer_email],
        subject: `Complete your purchase - ₹${cartValue} cart waiting!`,
        html: emailHtml,
      }),
    });

    const resendBody = await resendResponse.text();
    let emailResult: string;
    let emailSent = false;

    if (resendResponse.ok) {
      emailSent = true;
      emailResult = "Email sent successfully via Resend";
    } else {
      emailResult = `Resend API error [${resendResponse.status}]: ${resendBody}`;
      console.error("[recover-abandoned-cart] Resend error:", emailResult);

      // Log failure to domain_events
      await supabase.from("domain_events").insert({
        entity_type: "abandoned_cart_recovery",
        entity_id: cart_id,
        event_type: "recovery_email_failed",
        payload: {
          email: cart.customer_email,
          cart_value: cart.cart_value,
          error: emailResult,
          triggered_by: authData.user.id,
        },
      });

      return new Response(
        JSON.stringify({ success: false, error: "Failed to send email", detail: emailResult }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update cart status
    const currentCount = Number(cart.recovery_emails_sent || 0);
    await supabase
      .from("abandoned_carts")
      .update({
        status: "contacted",
        contacted_at: new Date().toISOString(),
        recovery_emails_sent: currentCount + 1,
        last_contacted_by: authData.user.id,
        last_contacted_by_name: user_name || "Admin",
        recovery_notes: notes || `Recovery email #${currentCount + 1} sent`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cart_id);

    // Log success
    await supabase.from("domain_events").insert({
      entity_type: "abandoned_cart_recovery",
      entity_id: cart_id,
      event_type: "recovery_email_sent",
      payload: {
        email: cart.customer_email,
        cart_value: cart.cart_value,
        email_count: currentCount + 1,
        result: emailResult,
        resend_response: resendBody,
        triggered_by: authData.user.id,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        action: "send_email",
        email: cart.customer_email,
        result: emailResult,
        emails_sent: currentCount + 1,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[recover-abandoned-cart] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
