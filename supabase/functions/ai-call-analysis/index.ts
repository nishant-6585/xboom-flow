import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Accept either the service-role key (internal callers like exotel-webhook)
    // or a valid user JWT belonging to admin/sales/sales_manager.
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (token !== SUPABASE_SERVICE_ROLE_KEY) {
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id);
      const allowed = new Set(["admin", "sales", "sales_manager"]);
      const ok = (roles ?? []).some((r: { role: string }) => allowed.has(r.role));
      if (!ok) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json();
    const { call_log_id, recording_url } = body;

    if (!call_log_id) {
      return new Response(JSON.stringify({ error: "call_log_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if analysis already exists
    const { data: existing } = await supabase
      .from("call_ai_analysis")
      .select("id")
      .eq("call_log_id", call_log_id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ message: "Analysis already exists", id: existing.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get call log details for context
    const { data: callLog } = await supabase
      .from("call_logs")
      .select("*")
      .eq("id", call_log_id)
      .single();

    if (!callLog) {
      return new Response(JSON.stringify({ error: "Call log not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context for AI analysis
    const contextParts: string[] = [];
    if (callLog.customer_name) contextParts.push(`Customer: ${callLog.customer_name}`);
    if (callLog.customer_company) contextParts.push(`Company: ${callLog.customer_company}`);
    if (callLog.product_name) contextParts.push(`Product Interest: ${callLog.product_name}`);
    if (callLog.call_duration) contextParts.push(`Call Duration: ${callLog.call_duration} seconds`);
    if (callLog.call_type) contextParts.push(`Call Type: ${callLog.call_type}`);
    if (callLog.notes) contextParts.push(`Agent Notes: ${callLog.notes}`);

    const contextStr = contextParts.length > 0
      ? `\n\nCall Context:\n${contextParts.join("\n")}`
      : "";

    // Since we can't transcribe audio directly via text models, we analyze available metadata
    // If recording_url is available, note it for future transcription
    const hasRecording = !!recording_url || !!callLog.recording_url;

    const analysisPrompt = `You are a sales call analyst for XBoom, a drone technology company. 
Analyze this call data and provide insights.

${contextStr}

Call Status: ${callLog.call_status}
Call Duration: ${callLog.call_duration || 0} seconds
Has Recording: ${hasRecording}

Based on the available information, analyze and provide a JSON response with these fields:
- intent: "hot", "warm", or "cold" (customer buying intent)
- budget: estimated budget if determinable, or "unknown"
- timeline: purchase timeline if determinable, or "unknown"  
- key_requirements: array of key requirements mentioned
- objections: array of any objections
- sentiment: "positive", "neutral", or "negative"
- summary: 2-3 line summary of the call
- next_action: recommended next step for the salesperson
- confidence_score: 0-100 indicating confidence in the analysis

Rules:
- Completed calls with >60s duration likely indicate engagement (warm/hot)
- Missed/failed calls are cold
- Short calls (<30s) are likely cold
- Product inquiries about drones suggest warm+ intent

Respond ONLY with valid JSON.`;

    // Call Lovable AI Gateway
    const aiResponse = await fetch("https://ai-gateway.lovable.dev/api/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "x-lovable-project-id": Deno.env.get("LOVABLE_PROJECT_ID") || "",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a JSON-only response AI. Always respond with valid JSON." },
          { role: "user", content: analysisPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI Gateway error: ${aiResponse.status} - ${errText}`);
    }

    const aiResult = await aiResponse.json();
    const aiContent = aiResult.choices?.[0]?.message?.content || "{}";

    // Parse AI response
    let analysis: any = {};
    try {
      const cleaned = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      analysis = {
        intent: "cold",
        sentiment: "neutral",
        summary: "Unable to parse AI analysis",
        confidence_score: 10,
      };
    }

    // Insert analysis into DB
    const { data: savedAnalysis, error: insertErr } = await supabase
      .from("call_ai_analysis")
      .insert({
        call_log_id,
        transcript: hasRecording ? "Recording available - transcription pending" : null,
        intent: analysis.intent || "cold",
        budget: analysis.budget || null,
        timeline: analysis.timeline || null,
        key_requirements: analysis.key_requirements || [],
        objections: analysis.objections || [],
        sentiment: analysis.sentiment || "neutral",
        summary: analysis.summary || null,
        next_action: analysis.next_action || null,
        confidence_score: analysis.confidence_score || 0,
        raw_ai_response: aiResult,
      })
      .select()
      .single();

    if (insertErr) {
      throw new Error(`DB insert failed: ${insertErr.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, analysis: savedAnalysis }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI Analysis error:", error);

    await supabase.from("integration_errors").insert({
      integration: "ai",
      function_name: "ai-call-analysis",
      error_message: error instanceof Error ? error.message : "Unknown error",
      error_details: { stack: error instanceof Error ? error.stack : null },
    });

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
