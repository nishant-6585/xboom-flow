import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

interface AIExtractionResult {
  is_lead: boolean;
  confidence: number;
  name: string;
  company: string;
  phone: string;
  email: string;
  product_interest: string;
  product_category: string;
  quantity: number;
  urgency: string;
  city: string;
  summary: string;
}

async function callAI(emailContent: string): Promise<AIExtractionResult> {
  const systemPrompt = `You are a lead extraction AI for XBoom, a drone and technology company. Analyze the email content and extract structured lead information.

You MUST respond with valid JSON matching this exact schema:
{
  "is_lead": true/false,
  "confidence": 0.0-1.0,
  "name": "sender's name or 'Unknown'",
  "company": "company name or 'Unknown'",
  "phone": "phone number if found or empty string",
  "email": "email address if found or empty string",
  "product_interest": "specific product/drone mentioned or 'General Enquiry'",
  "product_category": "one of: Consumer Drones, Enterprise Drones, Agriculture Drones, FPV Drones, Camera Drones, Drone Parts, Drone Accessories, Other",
  "quantity": 1,
  "urgency": "one of: high, medium, low",
  "city": "city if mentioned or empty string",
  "summary": "one-line summary of the enquiry"
}

Rules:
- Auto-replies, newsletters, OOO messages, promotional emails → is_lead: false
- Price enquiries, bulk orders, product questions → is_lead: true
- If urgency words like "urgent", "asap", "immediately" → urgency: "high"
- If timeline mentioned (weeks/months) → urgency: "medium"
- Default urgency: "low"`;

  const res = await fetch("https://ai.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze this email and extract lead information:\n\n${emailContent}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty AI response");

  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
  return JSON.parse(jsonStr) as AIExtractionResult;
}

const INTENT_KEYWORDS = ["buy", "price", "quotation", "urgent", "require", "purchase", "order", "quote", "need"];
const MAX_RETRIES = 3;

function determineStatus(aiResult: AIExtractionResult, emailText: string): "processed" | "needs_review" | "rejected" {
  const hasStrongIntent = INTENT_KEYWORDS.some((kw) => emailText.toLowerCase().includes(kw));

  if (!aiResult.is_lead && !hasStrongIntent) {
    if (aiResult.confidence >= 0.5) return "needs_review";
    return "rejected";
  }

  // is_lead = true OR has strong intent
  if (aiResult.confidence >= 0.7 || hasStrongIntent) return "processed";
  if (aiResult.confidence >= 0.5) return "needs_review";
  return "needs_review"; // Don't auto-reject leads with intent
}

async function createEnquiryFromLead(
  supabase: ReturnType<typeof createClient>,
  lead: Record<string, any>,
  aiResult: AIExtractionResult
): Promise<{ created: boolean; error?: string }> {
  // Idempotency check
  const { data: existing } = await supabase
    .from("enquiries")
    .select("id")
    .eq("email_lead_id", lead.id)
    .limit(1);

  if (existing && existing.length > 0) {
    return { created: false };
  }

  const enquiryData: Record<string, unknown> = {
    customer_name: aiResult.name !== "Unknown" ? aiResult.name : lead.customer_name,
    customer_company: aiResult.company !== "Unknown" ? aiResult.company : (lead.customer_company || "Unknown"),
    product_name: aiResult.product_interest || lead.product_name || "General Enquiry",
    product_code: lead.product_code || "EMAIL-AUTO",
    product_category: aiResult.product_category || lead.product_category || "Consumer Drones",
    quantity: aiResult.quantity || lead.quantity || 1,
    urgency: aiResult.urgency || lead.urgency || "low",
    status: "pending",
    lead_source: "gmail",
    notes: `[AI-Scored: ${(aiResult.confidence * 100).toFixed(0)}% confidence]\n${aiResult.summary}\n\n---\nOriginal: ${lead.notes || ""}`,
    sales_person_name: lead.sales_person_name || "Unassigned",
    sales_person_id: lead.sales_person_id || null,
    email_lead_id: lead.id,
  };

  if (aiResult.city || lead.city) {
    enquiryData.customer_state = aiResult.city || lead.city;
  }

  const { error } = await supabase.from("enquiries").insert(enquiryData);
  if (error) return { created: false, error: error.message };
  return { created: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedCronSecret = Deno.env.get("CRON_SECRET");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (cronSecret && cronSecret === expectedCronSecret) {
      // Cron OK
    } else if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const userRoles = (roles || []).map((r: any) => r.role);
      if (!userRoles.includes("admin") && !userRoles.includes("sales_manager") && !userRoles.includes("sales")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const specificLeadId = body.lead_id;
    const batchSize = Math.min(body.batch_size || 10, 50);

    // Atomically claim pending leads (FOR UPDATE SKIP LOCKED)
    const { data: pendingLeads, error: fetchError } = await supabase.rpc(
      "claim_pending_email_leads",
      {
        p_batch_size: batchSize,
        ...(specificLeadId ? { p_specific_lead_id: specificLeadId } : {}),
      }
    );
    if (fetchError) throw fetchError;

    if (!pendingLeads || pendingLeads.length === 0) {
      return new Response(JSON.stringify({ message: "No pending leads to process", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let enquiriesCreated = 0;
    let rejected = 0;
    let needsReview = 0;
    let failed = 0;
    let totalConfidence = 0;
    const results: any[] = [];

    for (const lead of pendingLeads) {
      const currentRetryCount = (lead.retry_count || 0);
      try {
        const emailContent = [
          `Customer Name: ${lead.customer_name}`,
          lead.email ? `Email: ${lead.email}` : "",
          lead.phone_number ? `Phone: ${lead.phone_number}` : "",
          lead.customer_company ? `Company: ${lead.customer_company}` : "",
          lead.product_name ? `Product: ${lead.product_name}` : "",
          lead.notes ? `\nEmail Content:\n${lead.notes}` : "",
        ].filter(Boolean).join("\n");

        const aiResult = await callAI(emailContent);
        totalConfidence += aiResult.confidence;

        const emailText = lead.notes || "";
        const status = determineStatus(aiResult, emailText);

        const updatePayload: Record<string, unknown> = {
          ai_processed: true,
          ai_confidence: aiResult.confidence,
          ai_extracted_json: aiResult as unknown,
          error_message: null,
          processing_status: status,
        };

        if (status === "processed") {
          const result = await createEnquiryFromLead(supabase, lead, aiResult);
          if (result.error) {
            updatePayload.error_message = `Enquiry creation failed: ${result.error}`;
            updatePayload.processing_status = "pending";
          } else if (result.created) {
            enquiriesCreated++;
          }
          // If not created (already exists), still mark processed
        } else if (status === "needs_review") {
          needsReview++;
        } else {
          rejected++;
        }

        await supabase.from("email_leads").update(updatePayload).eq("id", lead.id);
        processed++;
        results.push({
          id: lead.id,
          is_lead: aiResult.is_lead,
          confidence: aiResult.confidence,
          status: updatePayload.processing_status,
        });
      } catch (leadErr) {
        console.error(`Error processing lead ${lead.id}:`, leadErr);
        const newRetryCount = currentRetryCount + 1;
        const newStatus = newRetryCount >= MAX_RETRIES ? "failed" : "pending";

        await supabase.from("email_leads").update({
          processing_status: newStatus,
          retry_count: newRetryCount,
          error_message: `AI processing error (attempt ${newRetryCount}/${MAX_RETRIES}): ${String(leadErr)}`,
        }).eq("id", lead.id);

        if (newStatus === "failed") failed++;
        results.push({ id: lead.id, error: String(leadErr), retry_count: newRetryCount, status: newStatus });
      }
    }

    // Log metrics to gmail_sync_logs
    const avgConfidence = processed > 0 ? totalConfidence / processed : 0;
    console.log(JSON.stringify({
      event: "ai_processing_complete",
      processed,
      enquiries_created: enquiriesCreated,
      rejected,
      needs_review: needsReview,
      failed,
      avg_confidence: avgConfidence.toFixed(2),
    }));

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        enquiries_created: enquiriesCreated,
        rejected,
        needs_review: needsReview,
        failed,
        avg_confidence: Number(avgConfidence.toFixed(2)),
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("AI email lead processing error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
