import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── Metrics helper ─────────────────────────────────────────────────────
interface ResolutionMetrics {
  ticket_id: string;
  used_rule: boolean;
  used_cache: boolean;
  used_code_context: boolean;
  code_context_length: number;
  ai_called: boolean;
  response_time_ms: number;
  confidence_score: number | null;
  resolution_type: string | null;
}

function createMetrics(ticketId: string): ResolutionMetrics {
  return {
    ticket_id: ticketId,
    used_rule: false,
    used_cache: false,
    used_code_context: false,
    code_context_length: 0,
    ai_called: false,
    response_time_ms: 0,
    confidence_score: null,
    resolution_type: null,
  };
}

async function saveMetrics(
  supabase: ReturnType<typeof createClient>,
  metrics: ResolutionMetrics
) {
  try {
    const { error } = await supabase.from("ai_resolution_metrics").insert(metrics);
    if (error) console.error("METRICS: insert failed (non-fatal):", error.message);
    else console.log("METRICS: saved successfully");
  } catch (e) {
    console.error("METRICS: insert exception (non-fatal):", e);
  }
}

// ─── Rule-Based Pre-Filter ───────────────────────────────────────────────
interface RuleResult {
  resolution_type: string;
  estimated_complexity: string;
  confidence_score: number;
  root_cause: string;
  resolution_plan: string;
  resolution_comment: string;
  lovable_prompt: string;
  needs_human_review: boolean;
  review_reason: string | null;
}

const RULES: Array<{
  patterns: RegExp[];
  result: Omit<RuleResult, "resolution_comment" | "lovable_prompt">;
  comment: string;
  prompt: string;
}> = [
  {
    patterns: [/\bcors\b/i],
    result: {
      resolution_type: "bug_fix",
      estimated_complexity: "simple",
      confidence_score: 95,
      root_cause: "CORS misconfiguration in edge function or API response headers",
      resolution_plan: "1. Check the affected edge function's CORS headers\n2. Ensure Access-Control-Allow-Origin includes the requesting domain\n3. Verify OPTIONS pre-flight handler returns correct headers\n4. Check Supabase config.toml for verify_jwt settings",
      needs_human_review: false,
      review_reason: null,
    },
    comment: "This appears to be a CORS configuration issue. The fix involves updating the edge function's response headers to allow cross-origin requests properly.",
    prompt: "Check and fix CORS headers in the affected Supabase edge function. Ensure corsHeaders include proper Access-Control-Allow-Origin, Access-Control-Allow-Headers, and that OPTIONS pre-flight requests are handled correctly.",
  },
  {
    patterns: [/\b401\b/, /\b403\b/, /\bunauthorized\b/i, /\bforbidden\b/i],
    result: {
      resolution_type: "bug_fix",
      estimated_complexity: "moderate",
      confidence_score: 90,
      root_cause: "Authentication or authorization failure — JWT validation, missing token, or insufficient permissions",
      resolution_plan: "1. Verify JWT token is being passed in Authorization header\n2. Check Supabase RLS policies on affected tables\n3. Verify user role permissions\n4. Check edge function auth validation logic\n5. Ensure token hasn't expired",
      needs_human_review: true,
      review_reason: "Auth issues require manual verification of RLS policies and user permissions",
    },
    comment: "This is an authentication/authorization issue. We need to verify the JWT token handling and RLS policies for the affected resources.",
    prompt: "Debug and fix the authentication/authorization error. Check Supabase RLS policies on the affected table, verify JWT validation in the edge function, and ensure the user's role grants appropriate access.",
  },
  {
    patterns: [/\benvironment\s*variable\b/i, /\b\.env\b/i, /\benv\s+not\s+set\b/i, /\bmissing.*secret\b/i],
    result: {
      resolution_type: "bug_fix",
      estimated_complexity: "simple",
      confidence_score: 90,
      root_cause: "Missing or incorrect environment variable / secret configuration",
      resolution_plan: "1. Identify which environment variable is missing\n2. Check Supabase Edge Function secrets configuration\n3. Verify the variable name matches what the code expects\n4. Add or update the secret via Lovable Cloud secrets management",
      needs_human_review: true,
      review_reason: "Requires manual verification of secret values",
    },
    comment: "This issue is caused by a missing or misconfigured environment variable. The correct secret needs to be added to the backend configuration.",
    prompt: "Check the edge function for missing environment variables. Verify all required secrets (API keys, tokens) are configured in Supabase Edge Function secrets. Add any missing variables.",
  },
  {
    patterns: [/\bpermission\s*denied\b/i, /\brls\b/i, /\brow.level.security\b/i],
    result: {
      resolution_type: "bug_fix",
      estimated_complexity: "moderate",
      confidence_score: 90,
      root_cause: "Row Level Security (RLS) policy blocking database query",
      resolution_plan: "1. Identify the affected table\n2. Review existing RLS policies\n3. Check if the user's role is included in policy conditions\n4. Verify the query uses the correct auth context\n5. Add or update RLS policy to allow the intended access",
      needs_human_review: true,
      review_reason: "RLS changes must be reviewed for security implications",
    },
    comment: "This is an RLS (Row Level Security) issue where the database policy is blocking the query. The policy needs to be updated to allow legitimate access.",
    prompt: "Review and fix RLS policies on the affected Supabase table. Ensure the policy allows the correct user roles to perform the required operation (SELECT/INSERT/UPDATE/DELETE) while maintaining security.",
  },
];

function matchRule(subject: string, description: string): RuleResult | null {
  const text = `${subject} ${description}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return {
        ...rule.result,
        resolution_comment: rule.comment,
        lovable_prompt: rule.prompt,
      };
    }
  }
  return null;
}

// ─── Cache helpers ───────────────────────────────────────────────────────

async function generateSignature(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function checkCache(
  supabase: ReturnType<typeof createClient>,
  signature: string
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from("ai_resolution_cache")
    .select("resolution")
    .eq("error_signature", signature)
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.resolution ?? null;
}

async function writeCache(
  supabase: ReturnType<typeof createClient>,
  signature: string,
  resolution: Record<string, unknown>,
  category: string | null,
  source: string
) {
  await supabase.from("ai_resolution_cache").insert({
    error_signature: signature,
    resolution,
    ticket_category: category,
    source,
  });
}

// ─── Fetch code context (best-effort) ────────────────────────────────────

async function fetchCodeContext(
  supabaseUrl: string,
  anonKey: string,
  token: string,
  category: string
): Promise<string> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/fetch-code-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ category }),
    });
    if (!res.ok) {
      console.warn("fetch-code-context returned", res.status);
      return "";
    }
    const data = await res.json();
    return data.context || "";
  } catch (e) {
    console.warn("Code context fetch failed (non-fatal):", e);
    return "";
  }
}

// ─── Main handler ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await createClient(SUPABASE_URL, anonKey).auth.getUser(token);

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

    // Authorization: match `analyze-ticket` — only admin/hr, or the ticket's
    // raised_by / assigned_to, may trigger AI resolution. Prevents any
    // authenticated user (sales, marketing, etc.) from spending AI credits
    // on tickets they are not involved with.
    {
      const { data: roles } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", user.id);
      const privileged = new Set(["admin", "hr"]);
      const isPrivileged = (roles ?? []).some(
        (r: { role: string }) => privileged.has(r.role),
      );
      if (!isPrivileged) {
        const { data: ticketOwnership } = await supabaseAdmin
          .from("tickets")
          .select("raised_by, assigned_to")
          .eq("id", ticket_id)
          .maybeSingle();
        const isParticipant =
          !!ticketOwnership &&
          (ticketOwnership.raised_by === user.id ||
            ticketOwnership.assigned_to === user.id);
        if (!isParticipant) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Initialize metrics
    const metrics = createMetrics(ticket_id);

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

    // ─── LAYER 1: Rule-based pre-filter ──────────────────────────────────
    const ruleMatch = matchRule(ticket.subject || "", ticket.description || "");
    if (ruleMatch) {
      console.log("METRICS: rule_used");
      metrics.used_rule = true;
      metrics.ai_called = false;
      metrics.confidence_score = ruleMatch.confidence_score;
      metrics.resolution_type = ruleMatch.resolution_type;

      const { error: insertError } = await supabaseAdmin
        .from("ticket_ai_resolutions")
        .insert({
          ticket_id,
          resolution_plan: ruleMatch.resolution_plan,
          lovable_prompt: ruleMatch.lovable_prompt,
          confidence_score: ruleMatch.confidence_score,
          resolution_type: ruleMatch.resolution_type,
          estimated_complexity: ruleMatch.estimated_complexity,
          root_cause: ruleMatch.root_cause,
          resolution_comment: ruleMatch.resolution_comment,
          needs_human_review: ruleMatch.needs_human_review,
          review_reason: ruleMatch.review_reason,
          approval_status: "pending",
        });

      if (insertError) console.error("Failed to insert rule-based resolution:", insertError);

      if (ruleMatch.resolution_comment) {
        await supabaseAdmin.from("ticket_comments").insert({
          ticket_id,
          comment: ruleMatch.resolution_comment,
          commented_by: user.id,
          commented_by_name: "🤖 Xboom AI",
          ai_generated: true,
          comment_type: "ai_resolution",
        });
      }

      await supabaseAdmin
        .from("tickets")
        .update({ ai_resolution_status: "pending_approval" })
        .eq("id", ticket_id);

      // Cache the rule-based result too
      const sig = await generateSignature(
        `${ticket.subject}|${ticket.description}|${ticket.category}`
      );
      await writeCache(supabaseAdmin, sig, ruleMatch as unknown as Record<string, unknown>, ticket.category, "rule");

      // Save metrics
      metrics.response_time_ms = Date.now() - startTime;
      console.log(`METRICS: response_time_ms=${metrics.response_time_ms}`);
      await saveMetrics(supabaseAdmin, metrics);

      return new Response(
        JSON.stringify({ success: true, resolution_type: ruleMatch.resolution_type, source: "rule" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── LAYER 2: Cache lookup ───────────────────────────────────────────
    const errorSignature = await generateSignature(
      `${ticket.subject}|${ticket.description}|${ticket.category}`
    );
    const cachedResolution = await checkCache(supabaseAdmin, errorSignature);

    if (cachedResolution) {
      console.log("METRICS: cache_hit");
      metrics.used_cache = true;
      metrics.ai_called = false;
      const cached = cachedResolution as Record<string, unknown>;
      metrics.confidence_score = (cached.confidence_score as number) || null;
      metrics.resolution_type = (cached.resolution_type as string) || null;

      const { error: insertError } = await supabaseAdmin
        .from("ticket_ai_resolutions")
        .insert({
          ticket_id,
          resolution_plan: cached.resolution_plan || null,
          lovable_prompt: cached.lovable_prompt || null,
          confidence_score: cached.confidence_score || null,
          resolution_type: cached.resolution_type || null,
          estimated_complexity: cached.estimated_complexity || null,
          root_cause: cached.root_cause || null,
          resolution_comment: cached.resolution_comment || null,
          needs_human_review: cached.needs_human_review ?? true,
          review_reason: cached.review_reason || null,
          approval_status: "pending",
        });

      if (insertError) console.error("Failed to insert cached resolution:", insertError);

      if (cached.resolution_comment) {
        await supabaseAdmin.from("ticket_comments").insert({
          ticket_id,
          comment: cached.resolution_comment as string,
          commented_by: user.id,
          commented_by_name: "🤖 Xboom AI",
          ai_generated: true,
          comment_type: "ai_resolution",
        });
      }

      await supabaseAdmin
        .from("tickets")
        .update({ ai_resolution_status: "pending_approval" })
        .eq("id", ticket_id);

      // Save metrics
      metrics.response_time_ms = Date.now() - startTime;
      console.log(`METRICS: response_time_ms=${metrics.response_time_ms}`);
      await saveMetrics(supabaseAdmin, metrics);

      return new Response(
        JSON.stringify({ success: true, resolution_type: cached.resolution_type, source: "cache" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── LAYER 3: Full AI resolution ─────────────────────────────────────

    // Fetch comments
    const { data: comments } = await supabaseAdmin
      .from("ticket_comments")
      .select("commented_by_name, comment, created_at")
      .eq("ticket_id", ticket_id)
      .order("created_at", { ascending: true });

    // Fetch similar resolved tickets
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
    const commentsFormatted =
      (comments || [])
        .map(
          (c: { commented_by_name: string; comment: string; created_at: string }) =>
            `[${c.commented_by_name}] ${c.comment}`
        )
        .join("\n\n") || "No comments yet.";

    const similarFormatted =
      (similarTickets || [])
        .map(
          (
            t: { subject: string; ai_summary: string | null; resolution_notes: string | null },
            i: number
          ) =>
            `${i + 1}. "${t.subject}" — ${t.ai_summary || "N/A"} | Resolution: ${t.resolution_notes || "N/A"}`
        )
        .join("\n") || "No similar tickets found.";

    // Fetch code context (best-effort, non-blocking failure)
    const codeContext = await fetchCodeContext(
      SUPABASE_URL,
      anonKey,
      token,
      ticket.category || "general"
    );

    // Track code context metrics
    if (codeContext && codeContext.length > 0) {
      metrics.used_code_context = true;
      metrics.code_context_length = codeContext.length;
      console.log(`METRICS: code_context_used, length=${codeContext.length}`);
    } else {
      console.log("METRICS: code_context_not_used");
    }

    // Step 2: Call Claude
    if (!ANTHROPIC_API_KEY) {
      await supabaseAdmin.from("tickets").update({ ai_resolution_status: null }).eq("id", ticket_id);

      // Save metrics even on config failure
      metrics.response_time_ms = Date.now() - startTime;
      await saveMetrics(supabaseAdmin, metrics);

      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const codeSection = codeContext.length > 0
      ? `\n\nRELEVANT CODE CONTEXT:\n${codeContext}`
      : "";

    console.log("METRICS: ai_called");
    metrics.ai_called = true;

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
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
${similarFormatted}${codeSection}

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

      // Save metrics on AI failure
      metrics.response_time_ms = Date.now() - startTime;
      await saveMetrics(supabaseAdmin, metrics);

      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claudeData = await claudeResponse.json();
    const aiText = claudeData.content?.[0]?.text || "{}";

    let aiResult: Record<string, unknown>;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      aiResult = JSON.parse(jsonMatch ? jsonMatch[0] : aiText);
    } catch {
      console.error("Failed to parse Claude response:", aiText);
      await supabaseAdmin.from("tickets").update({ ai_resolution_status: null }).eq("id", ticket_id);

      // Save metrics on parse failure
      metrics.response_time_ms = Date.now() - startTime;
      await saveMetrics(supabaseAdmin, metrics);

      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Capture AI response metrics
    metrics.confidence_score = (aiResult.confidence_score as number) || null;
    metrics.resolution_type = (aiResult.resolution_type as string) || null;

    // Low confidence → force human review
    const confidence = (aiResult.confidence_score as number) || 0;
    if (confidence < 60) {
      aiResult.needs_human_review = true;
      aiResult.review_reason = `Low AI confidence (${confidence}%) — manual review recommended`;
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

    // Cache the AI result for future similar tickets
    await writeCache(supabaseAdmin, errorSignature, aiResult, ticket.category, "ai");

    // Post resolution comment as AI
    if (aiResult.resolution_comment) {
      await supabaseAdmin.from("ticket_comments").insert({
        ticket_id,
        comment: aiResult.resolution_comment as string,
        commented_by: user.id,
        commented_by_name: "🤖 Xboom AI",
        ai_generated: true,
        comment_type: "ai_resolution",
      });
    }

    // Update ticket status
    const updateData: Record<string, unknown> = { ai_resolution_status: "pending_approval" };
    if (!ticket.ai_summary && aiResult.resolution_plan) {
      updateData.ai_summary =
        (aiResult.root_cause as string) ||
        (aiResult.resolution_plan as string).substring(0, 200);
    }
    await supabaseAdmin.from("tickets").update(updateData).eq("id", ticket_id);

    // Step 4: Notify
    const notifications: Array<{
      ticket_id: string;
      user_id: string;
      type: string;
      message: string;
    }> = [];

    const notifyMessage = `AI has generated a resolution plan for ticket: ${ticket.subject}. Review and approve to proceed.`;

    if (ticket.assigned_to) {
      notifications.push({
        ticket_id,
        user_id: ticket.assigned_to,
        type: "ai_resolution_ready",
        message: notifyMessage,
      });
    }

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

    // Save final metrics
    metrics.response_time_ms = Date.now() - startTime;
    console.log(`METRICS: response_time_ms=${metrics.response_time_ms}`);
    await saveMetrics(supabaseAdmin, metrics);

    return new Response(
      JSON.stringify({ success: true, resolution_type: aiResult.resolution_type, source: "ai" }),
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
