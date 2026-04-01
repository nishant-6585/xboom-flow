import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify cron secret for scheduled calls
    const cronSecret = req.headers.get("X-Cron-Secret");
    const authHeader = req.headers.get("Authorization");

    let isAuthorized = false;

    if (cronSecret && CRON_SECRET && cronSecret === CRON_SECRET) {
      isAuthorized = true;
    } else if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await createClient(
        SUPABASE_URL,
        Deno.env.get("SUPABASE_ANON_KEY")!
      ).auth.getUser(token);

      if (user) {
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: roles } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        const userRoles = (roles || []).map((r: { role: string }) => r.role);
        if (userRoles.includes("admin") || userRoles.includes("hr")) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find at-risk tickets: SLA due within 30 minutes, not breached, not closed/removed
    const thirtyMinFromNow = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { data: atRiskTickets, error: queryError } = await supabase
      .from("tickets")
      .select("id, ticket_number, subject, priority, assigned_to_name, assigned_department, raised_by_name, sla_due_at, status")
      .eq("sla_breached", false)
      .not("status", "in", '("closed","removed","resolved")')
      .lte("sla_due_at", thirtyMinFromNow)
      .gte("sla_due_at", now);

    if (queryError) {
      console.error("Query error:", queryError);
      return new Response(JSON.stringify({ error: "Failed to query tickets" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!atRiskTickets || atRiskTickets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, alerts_created: 0, message: "No at-risk tickets found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check which tickets already have unacknowledged alerts
    const ticketIds = atRiskTickets.map((t: { id: string }) => t.id);
    const { data: existingAlerts } = await supabase
      .from("ticket_sla_alerts")
      .select("ticket_id")
      .in("ticket_id", ticketIds)
      .eq("acknowledged", false);

    const alreadyAlerted = new Set((existingAlerts || []).map((a: { ticket_id: string }) => a.ticket_id));
    const newTickets = atRiskTickets.filter((t: { id: string }) => !alreadyAlerted.has(t.id));

    if (newTickets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, alerts_created: 0, message: "All at-risk tickets already alerted" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate alerts - use Claude if available, otherwise generate simple alerts
    const alerts = [];

    for (const ticket of newTickets) {
      let alertMessage: string;
      const minutesLeft = Math.round(
        (new Date(ticket.sla_due_at).getTime() - Date.now()) / (1000 * 60)
      );

      if (ANTHROPIC_API_KEY) {
        try {
          const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              max_tokens: 256,
              system: "You are an SLA monitoring assistant for Xboom Utilities. Generate concise, actionable escalation alert messages. Return only the alert text, no JSON.",
              messages: [
                {
                  role: "user",
                  content: `Generate an SLA escalation alert for:
Ticket: ${ticket.ticket_number} - "${ticket.subject}"
Priority: ${ticket.priority}
Assigned to: ${ticket.assigned_to_name || "Unassigned"}
Department: ${ticket.assigned_department}
Raised by: ${ticket.raised_by_name}
Minutes until SLA breach: ${minutesLeft}
Current status: ${ticket.status}

Write a brief, urgent alert message (2-3 sentences max).`,
                },
              ],
            }),
          });

          if (claudeResponse.ok) {
            const data = await claudeResponse.json();
            alertMessage = data.content?.[0]?.text || "";
          } else {
            throw new Error("Claude API failed");
          }
        } catch {
          alertMessage = `⚠️ SLA Alert: Ticket ${ticket.ticket_number} ("${ticket.subject}") has ${minutesLeft} minutes until SLA breach. Priority: ${ticket.priority}. ${ticket.assigned_to_name ? `Assigned to ${ticket.assigned_to_name}` : "Currently unassigned"}.`;
        }
      } else {
        alertMessage = `⚠️ SLA Alert: Ticket ${ticket.ticket_number} ("${ticket.subject}") has ${minutesLeft} minutes until SLA breach. Priority: ${ticket.priority}. ${ticket.assigned_to_name ? `Assigned to ${ticket.assigned_to_name}` : "Currently unassigned"}.`;
      }

      alerts.push({
        ticket_id: ticket.id,
        alert_message: alertMessage,
      });
    }

    // Insert alerts
    const { error: insertError } = await supabase
      .from("ticket_sla_alerts")
      .insert(alerts);

    if (insertError) {
      console.error("Failed to insert SLA alerts:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create alerts" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, alerts_created: alerts.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("check-sla-risk error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
