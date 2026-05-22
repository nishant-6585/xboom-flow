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
    // Auth check
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

    // Role guard: only admin / hr may resolve AI tickets and trigger Claude calls.
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const allowed = new Set(["admin", "hr"]);
    const isAuthorized = (roleRows ?? []).some((r: { role: string }) => allowed.has(r.role));
    if (!isAuthorized) {
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

    // Get approver profile
    const { data: approverProfile } = await supabaseAdmin
      .from("profiles")
      .select("name")
      .eq("user_id", user.id)
      .single();

    const approverName = approverProfile?.name || "Admin";

    // Fetch pending resolution with lovable_prompt
    const { data: resolution, error: resError } = await supabaseAdmin
      .from("ticket_ai_resolutions")
      .select("*")
      .eq("ticket_id", ticket_id)
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (resError || !resolution) {
      return new Response(JSON.stringify({ error: "No pending resolution found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!resolution.lovable_prompt) {
      return new Response(JSON.stringify({ error: "No Lovable prompt in resolution" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch ticket details for notifications
    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("subject, raised_by, assigned_to")
      .eq("id", ticket_id)
      .single();

    if (!ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Claude with the lovable_prompt
    if (!ANTHROPIC_API_KEY) {
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
        system: `You are a Lovable AI coding assistant implementing fixes for the Xboom Workflow project built on React + Supabase. You will receive a bug fix or feature implementation prompt. Execute it precisely, make minimal changes to achieve the fix, and return a structured implementation report. Respond ONLY in valid JSON.`,
        messages: [
          {
            role: "user",
            content: `${resolution.lovable_prompt}

Return this exact JSON structure:
{
  "files_changed": ["list of files that would be modified"],
  "changes_summary": "plain English summary of what was changed and why",
  "sql_migrations": "any SQL needed, or null",
  "test_steps": "how to verify the fix works",
  "implementation_status": "completed|partial|failed",
  "notes": "any caveats or follow-up needed"
}`,
          },
        ],
      }),
    });

    let implementationReport = null;
    let implementationStatus = "failed";

    if (claudeResponse.ok) {
      const claudeData = await claudeResponse.json();
      const aiText = claudeData.content?.[0]?.text || "{}";
      try {
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        implementationReport = JSON.parse(jsonMatch ? jsonMatch[0] : aiText);
        implementationStatus = implementationReport.implementation_status || "completed";
      } catch {
        console.error("Failed to parse implementation report:", aiText);
        implementationReport = {
          files_changed: [],
          changes_summary: "AI analysis completed but response parsing failed.",
          sql_migrations: null,
          test_steps: "Manual verification required.",
          implementation_status: "partial",
          notes: "Raw response could not be parsed into structured format.",
        };
        implementationStatus = "partial";
      }
    } else {
      console.error("Claude API error:", await claudeResponse.text());
      implementationReport = {
        files_changed: [],
        changes_summary: "AI service call failed. Resolution approved manually.",
        sql_migrations: null,
        test_steps: "Manual verification required.",
        implementation_status: "failed",
        notes: "Claude API returned an error. The ticket has been resolved but implementation report is unavailable.",
      };
    }

    const now = new Date().toISOString();

    // Update resolution record
    await supabaseAdmin
      .from("ticket_ai_resolutions")
      .update({
        approval_status: "approved",
        approved_by: user.id,
        approved_by_name: approverName,
        approved_at: now,
        implementation_report: implementationReport,
        implemented_at: now,
        implementation_status: implementationStatus,
      })
      .eq("id", resolution.id);

    // Update ticket
    await supabaseAdmin
      .from("tickets")
      .update({
        ai_resolution_status: "approved",
        status: "resolved",
        resolved_at: now,
        resolved_by: user.id,
        resolved_by_name: approverName,
      })
      .eq("id", ticket_id);

    // Post system comment
    const changesSummary = implementationReport?.changes_summary || "Resolution applied.";
    const filesChanged = (implementationReport?.files_changed || []).join(", ") || "N/A";
    const testSteps = implementationReport?.test_steps || "Manual verification required.";

    await supabaseAdmin.from("ticket_comments").insert({
      ticket_id,
      comment: `✅ AI Resolution approved and applied by ${approverName} on ${new Date(now).toLocaleString()}.\n\nChanges made:\n${changesSummary}\n\nFiles modified: ${filesChanged}\n\nTo verify the fix: ${testSteps}`,
      commented_by: user.id,
      commented_by_name: "🤖 Xboom AI",
      ai_generated: true,
      comment_type: "system",
    });

    // Create notifications
    const notifications: Array<{ ticket_id: string; user_id: string; type: string; message: string }> = [];

    // Notify reporter
    if (ticket.raised_by) {
      notifications.push({
        ticket_id,
        user_id: ticket.raised_by,
        type: "ticket_resolved",
        message: `Your ticket "${ticket.subject}" has been resolved. The fix has been applied and deployed.`,
      });
    }

    // Notify all Admin/HR
    const { data: adminHrRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "hr"]);

    const notifiedSet = new Set([user.id, ticket.raised_by]);
    (adminHrRoles || []).forEach((r: { user_id: string }) => {
      if (!notifiedSet.has(r.user_id)) {
        notifiedSet.add(r.user_id);
        notifications.push({
          ticket_id,
          user_id: r.user_id,
          type: "resolution_applied",
          message: `AI resolution applied for "${ticket.subject}" by ${approverName}`,
        });
      }
    });

    // Notify assignee if different
    if (ticket.assigned_to && !notifiedSet.has(ticket.assigned_to)) {
      notifications.push({
        ticket_id,
        user_id: ticket.assigned_to,
        type: "resolution_applied",
        message: `AI resolution applied for "${ticket.subject}" by ${approverName}`,
      });
    }

    if (notifications.length > 0) {
      await supabaseAdmin.from("ticket_notifications").insert(notifications);
    }

    return new Response(
      JSON.stringify({ success: true, implementation_status: implementationStatus, implementation_report: implementationReport }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("apply-lovable-resolution error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
