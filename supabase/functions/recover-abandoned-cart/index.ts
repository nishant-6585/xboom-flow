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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth check
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

    // Fetch cart
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

    const cartItems = Array.isArray(cart.cart_items) ? cart.cart_items : [];
    const itemsList = cartItems
      .map((item: Record<string, unknown>) => {
        const name = item.product_id || item.name || "Item";
        const qty = item.quantity || 1;
        const price = Number(item.line_total || item.price || 0);
        return `• ${name} (Qty: ${qty}) - ₹${price.toLocaleString("en-IN")}`;
      })
      .join("\n");

    const cartValue = Number(cart.cart_value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
    });

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">XBoom</h1>
      <p style="color: #a0aec0; margin: 8px 0 0; font-size: 14px;">Your cart is waiting for you!</p>
    </div>
    <div style="padding: 30px;">
      <p style="color: #333; font-size: 16px; line-height: 1.6;">
        Hi there,
      </p>
      <p style="color: #555; font-size: 14px; line-height: 1.6;">
        We noticed you left some items in your cart. Don't worry — your selection is still saved! Here's what's waiting for you:
      </p>
      <div style="background: #f7f8fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0 0 10px; font-weight: bold; color: #333;">Your Cart Items:</p>
        <pre style="white-space: pre-wrap; font-family: Arial, sans-serif; color: #555; font-size: 13px; margin: 0;">${itemsList || "Your selected items"}</pre>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;" />
        <p style="margin: 0; font-weight: bold; color: #333; font-size: 16px;">Total: ₹${cartValue}</p>
      </div>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://www.xboom.in/cart/" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: bold;">Complete Your Purchase →</a>
      </div>
      <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
        Need help? Reply to this email or call us.<br/>
        © XBoom - Premium Drone Solutions
      </p>
    </div>
  </div>
</body>
</html>`;

    // Send email via WordPress/SMTP endpoint or log for manual send
    // For now, we use a simple approach: log the email attempt and update status
    // Future: integrate with WhatsApp API or transactional email service

    const emailSent = false; // Placeholder - will be true when email service is configured
    let emailResult = "Email logged for manual follow-up";

    // Try sending via a simple webhook if configured
    const emailWebhookUrl = Deno.env.get("RECOVERY_EMAIL_WEBHOOK_URL");
    if (emailWebhookUrl) {
      try {
        const emailResponse = await fetch(emailWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: cart.customer_email,
            subject: `Complete your purchase - ₹${cartValue} cart waiting!`,
            html: emailHtml,
          }),
        });
        const emailText = await emailResponse.text();
        if (emailResponse.ok) {
          emailResult = "Email sent successfully";
        } else {
          emailResult = `Email webhook responded: ${emailResponse.status}`;
        }
      } catch (err) {
        emailResult = `Email webhook error: ${String(err)}`;
      }
    }

    // Update cart status and tracking
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

    // Log to domain_events
    await supabase.from("domain_events").insert({
      entity_type: "abandoned_cart_recovery",
      entity_id: cart_id,
      event_type: "recovery_email_sent",
      payload: {
        email: cart.customer_email,
        cart_value: cart.cart_value,
        email_count: currentCount + 1,
        result: emailResult,
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
