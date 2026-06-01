// @ts-nocheck
// TEMP: Disabled TypeScript checking due to Supabase Deno SDK type inference issue
// Do NOT remove until Database types are available in edge runtime
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!
    ).auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Role guard: only admin/hr can invoke AI ticket analysis (matches
    // apply-lovable-resolution). Prevents arbitrary authenticated users from
    // reading any ticket via the service-role client below.
    const { data: callerRoles } = await supabaseUser
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const allowed = (callerRoles || []).some(
      (r: { role: string }) => r.role === "admin" || r.role === "hr"
    );
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return new Response(JSON.stringify({ error: "ticket_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch ticket
    const { data: ticket, error: ticketError } = await supabaseUser
      .from("tickets")
      .select("id, subject, description, category, priority, assigned_department, assigned_to, assigned_to_name")
      .eq("id", ticket_id)
      .single();

    if (ticketError || !ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch available assignees with their open ticket counts
    const { data: profiles } = await supabaseUser
      .from("profiles")
      .select("user_id, name, email")
      .eq("is_approved", true);

    const { data: roles } = await supabaseUser
      .from("user_roles")
      .select("user_id, role");

    const { data: openTickets } = await supabaseUser
      .from("tickets")
      .select("assigned_to")
      .not("status", "in", '("closed","removed","resolved")');

    // Build ticket count map
    const ticketCountMap: Record<string, number> = {};
    (openTickets || []).forEach((t: { assigned_to: string | null }) => {
      if (t.assigned_to) {
        ticketCountMap[t.assigned_to] = (ticketCountMap[t.assigned_to] || 0) + 1;
      }
    });

    // Build role map
    const roleMap: Record<string, string[]> = {};
    (roles || []).forEach((r: { user_id: string; role: string }) => {
      if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
      roleMap[r.user_id].push(r.role);
    });

    // Build assignee list
    const assignees = (profiles || []).map((p: { user_id: string; name: string }) => ({
      id: p.user_id,
      name: p.name,
      departments: roleMap[p.user_id] || [],
      open_tickets: ticketCountMap[p.user_id] || 0,
    }));

    // Call Claude
    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: `You are an intelligent IT helpdesk assistant for Xboom Utilities, a drone technology company. Analyze tickets and return structured JSON only. No markdown, no explanation—just valid JSON.

Categories to choose from: general_inquiry, order_issue, payment_issue, delivery_issue, supplier_issue, procurement_request, refund_request, technical_support, documentation, other.

Priorities: low, medium, high, critical.

When suggesting an assignee, prefer someone in the ticket's department with the fewest open tickets. If no one matches, suggest the person with the lightest workload.`,
        messages: [
          {
            role: "user",
            content: `Analyze this ticket and return a JSON object:

Ticket Title: ${ticket.subject}
Ticket Description: ${ticket.description}
Department: ${ticket.assigned_department}
Current Category: ${ticket.category}
Current Priority: ${ticket.priority}

Available Assignees (with departments and open ticket counts):
${JSON.stringify(assignees.slice(0, 30), null, 2)}

Return ONLY this JSON structure:
{
  "ai_summary": "One-line summary of the ticket",
  "ai_category": "best fitting category from the list",
  "suggested_priority": "low|medium|high|critical",
  "priority_reason": "Short reason for this priority",
  "suggested_assignee_id": "uuid of best assignee",
  "suggested_assignee_name": "name of best assignee",
  "draft_reply": "A professional first reply the assignee can send to the reporter"
}`,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error("Claude API error:", errorText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claudeData = await claudeResponse.json();
    const aiText = claudeData.content?.[0]?.text || "{}";
    
    // Parse JSON from response (handle potential markdown wrapping)
    let aiResult;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      aiResult = JSON.parse(jsonMatch ? jsonMatch[0] : aiText);
    } catch {
      console.error("Failed to parse Claude response:", aiText);
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // AUTO: Update ticket with ai_summary and ai_category
    const { error: updateError } = await supabaseUser
      .from("tickets")
      .update({
        ai_summary: aiResult.ai_summary || null,
        ai_category: aiResult.ai_category || null,
      })
      .eq("id", ticket_id);

    if (updateError) {
      console.error("Failed to update ticket with AI data:", updateError);
    }

    // MANUAL: Store suggestions in ticket_ai_suggestions
    const { error: suggestError } = await supabaseUser
      .from("ticket_ai_suggestions")
      .insert({
        ticket_id,
        suggested_priority: aiResult.suggested_priority || null,
        priority_reason: aiResult.priority_reason || null,
        suggested_assignee_id: aiResult.suggested_assignee_id || null,
        suggested_assignee_name: aiResult.suggested_assignee_name || null,
        draft_reply: aiResult.draft_reply || null,
      });

    if (suggestError) {
      console.error("Failed to insert AI suggestion:", suggestError);
    }

    // Check if ticket is eligible for auto-resolution (IT/technical tickets)
    const isItTicket = ticket.category === "technical_support" || ticket.assigned_department === "it";
    let autoResolutionTriggered = false;

    if (isItTicket && ticket.status === "open") {
      try {
        // Trigger resolve-ticket-ai
        const resolveUrl = `${SUPABASE_URL}/functions/v1/resolve-ticket-ai`;
        const resolveResp = await fetch(resolveUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader!,
          },
          body: JSON.stringify({ ticket_id }),
        });
        autoResolutionTriggered = resolveResp.ok;
      } catch (e) {
        console.error("Auto-resolution trigger failed:", e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        ai_summary: aiResult.ai_summary,
        ai_category: aiResult.ai_category,
        auto_resolution_triggered: autoResolutionTriggered,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("analyze-ticket error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
