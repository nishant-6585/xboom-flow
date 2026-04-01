import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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

    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return new Response(JSON.stringify({ error: "ticket_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already has a resolution
    const { data: existingResolution } = await supabaseAdmin
      .from("ticket_ai_resolutions")
      .select("id")
      .eq("ticket_id", ticket_id)
      .eq("approval_status", "pending")
      .maybeSingle();

    if (existingResolution) {
      return new Response(JSON.stringify({ error: "Resolution already pending" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark ticket as analyzing
    await supabaseAdmin
      .from("tickets")
      .update({ ai_resolution_status: "analyzing" })
      .eq("id", ticket_id);

    // Step 1: Build context
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("tickets")
      .select("*")
      .eq("id", ticket_id)
      .single();

    if (ticketError || !ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch comments
    const { data: comments } = await supabaseAdmin
      .from("ticket_comments")
      .select("commented_by_name, comment, created_at")
      .eq("ticket_id", ticket_id)
      .order("created_at", { ascending: true });

    // Fetch similar resolved IT tickets
    const { data: similarTickets } = await supabaseAdmin
      .from("tickets")
      .select("subject, ai_summary, resolution_notes")
      .eq("category", "technical_support")
      .in("status", ["resolved", "closed"])
      .not("ai_summary", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);

    // Get reporter info
    const { data: reporterProfile } = await supabaseAdmin
      .from("profiles")
      .select("name")
      .eq("user_id", ticket.raised_by)
      .single();

    // Format comment thread
    const commentsFormatted = (comments || [])
      .map((c: { commented_by_name: string; comment: string; created_at: string }) =>
        `[${c.commented_by_name}] ${c.comment}`
      )
      .join("\n\n") || "No comments yet.";

    const similarFormatted = (similarTickets || [])
      .map((t: { subject: string; ai_summary: string | null; resolution_notes: string | null }, i: number) =>
        `${i + 1}. "${t.subject}" — ${t.ai_summary || "N/A"} | Resolution: ${t.resolution_notes || "N/A"}`
      )
      .join("\n") || "No similar tickets found.";

    // Step 2: Call Claude
    if (!ANTHROPIC_API_KEY) {
      await supabaseAdmin.from("tickets").update({ ai_resolution_status: null }).eq("id", ticket_id);
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
        max_tokens: 2000,
        system: `You are an expert software engineer and project manager for Xboom Utilities, specializing in the Xboom Workflow tool built on Lovable (a React + Supabase platform). Your job is to analyze IT support tickets and generate:
1. A clear resolution plan
2. A ready-to-use Lovable AI prompt to implement the fix
Respond ONLY in valid JSON.`,
        messages: [
          {
            role: "user",
            content: `Analyze this Xboom Workflow IT ticket and generate a resolution plan.

TICKET DETAILS:
Title: ${ticket.subject}
Description: ${ticket.description}
Category: ${ticket.category}
Priority: ${ticket.priority}
Reporter: ${reporterProfile?.name || ticket.raised_by_name} (${ticket.raised_by_department})
Raised at: ${ticket.created_at}
SLA Due: ${ticket.sla_due_at || "N/A"}

COMMENT THREAD:
${commentsFormatted}

SIMILAR RESOLVED TICKETS (for context):
${similarFormatted}

Return this exact JSON:
{
  "resolution_type": "bug_fix|enhancement|feature|task",
  "estimated_complexity": "simple|moderate|complex",
  "confidence_score": 0-100,
  "root_cause": "What is causing this issue or what is needed",
  "resolution_plan": "Step-by-step plan to resolve this ticket",
  "resolution_comment": "A clear, friendly comment to post on the ticket explaining what will be done and why — written to the reporter, professional tone, under 150 words",
  "lovable_prompt": "A complete, detailed prompt ready to be pasted into Lovable to implement this fix/feature. Include: what to build, which files/components likely need changes, edge cases to handle, and any DB migrations needed. Be specific to the Xboom Workflow codebase (React + Supabase + Lovable).",
  "needs_human_review": true,
  "review_reason": "Why human review is needed (if applicable)"
}`,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error("Claude API error:", errorText);
      await supabaseAdmin.from("tickets").update({ ai_resolution_status: null }).eq("id", ticket_id);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claudeData = await claudeResponse.json();
    const aiText = claudeData.content?.[0]?.text || "{}";

    let aiResult;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      aiResult = JSON.parse(jsonMatch ? jsonMatch[0] : aiText);
    } catch {
      console.error("Failed to parse Claude response:", aiText);
      await supabaseAdmin.from("tickets").update({ ai_resolution_status: null }).eq("id", ticket_id);
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Store resolution
    const { error: insertError } = await supabaseAdmin
      .from("ticket_ai_resolutions")
      .insert({
        ticket_id,
        resolution_plan: aiResult.resolution_plan || null,
        lovable_prompt: aiResult.lovable_prompt || null,
        confidence_score: aiResult.confidence_score || null,
        resolution_type: aiResult.resolution_type || null,
        estimated_complexity: aiResult.estimated_complexity || null,
        root_cause: aiResult.root_cause || null,
        resolution_comment: aiResult.resolution_comment || null,
        needs_human_review: aiResult.needs_human_review ?? true,
        review_reason: aiResult.review_reason || null,
        approval_status: "pending",
      });

    if (insertError) {
      console.error("Failed to insert resolution:", insertError);
    }

    // Post resolution comment as AI
    if (aiResult.resolution_comment) {
      await supabaseAdmin.from("ticket_comments").insert({
        ticket_id,
        comment: aiResult.resolution_comment,
        commented_by: user.id,
        commented_by_name: "🤖 Xboom AI",
        ai_generated: true,
        comment_type: "ai_resolution",
      });
    }

    // Update ticket status
    const updateData: Record<string, unknown> = { ai_resolution_status: "pending_approval" };
    if (!ticket.ai_summary && aiResult.resolution_plan) {
      updateData.ai_summary = aiResult.root_cause || aiResult.resolution_plan.substring(0, 200);
    }
    await supabaseAdmin.from("tickets").update(updateData).eq("id", ticket_id);

    // Step 4: Notify
    const notifications: Array<{
      ticket_id: string;
      user_id: string;
      type: string;
      message: string;
    }> = [];

    const notifyMessage = `Claude has generated a resolution plan for ticket: ${ticket.subject}. Review and approve to proceed.`;

    // Notify assignee
    if (ticket.assigned_to) {
      notifications.push({
        ticket_id,
        user_id: ticket.assigned_to,
        type: "ai_resolution_ready",
        message: notifyMessage,
      });
    }

    // Notify all admins and HR
    const { data: adminHrRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "hr"]);

    const notifiedSet = new Set([ticket.assigned_to]);
    (adminHrRoles || []).forEach((r: { user_id: string }) => {
      if (!notifiedSet.has(r.user_id)) {
        notifiedSet.add(r.user_id);
        notifications.push({
          ticket_id,
          user_id: r.user_id,
          type: "ai_resolution_ready",
          message: notifyMessage,
        });
      }
    });

    if (notifications.length > 0) {
      await supabaseAdmin.from("ticket_notifications").insert(notifications);
    }

    return new Response(
      JSON.stringify({ success: true, resolution_type: aiResult.resolution_type }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("resolve-ticket-ai error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
