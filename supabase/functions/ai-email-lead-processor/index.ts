import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

const MAX_RETRIES = 3;

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
    const action = body.action || "process"; // "claim", "save_results", or legacy "process"

    // ========== ACTION: CLAIM ==========
    if (action === "claim") {
      const specificLeadId = body.lead_id;
      const batchSize = Math.min(body.batch_size || 10, 50);

      const { data: pendingLeads, error: fetchError } = await supabase.rpc(
        "claim_pending_email_leads",
        {
          p_batch_size: batchSize,
          ...(specificLeadId ? { p_specific_lead_id: specificLeadId } : {}),
        }
      );
      if (fetchError) throw fetchError;

      return new Response(
        JSON.stringify({ leads: pendingLeads || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== ACTION: SAVE RESULTS ==========
    if (action === "save_results") {
      const resultsToSave = body.results || [];
      if (!Array.isArray(resultsToSave) || resultsToSave.length === 0) {
        return new Response(
          JSON.stringify({ processed: 0, enquiries_created: 0, rejected: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let processed = 0;
      let enquiriesCreated = 0;
      let rejected = 0;
      let needsReview = 0;
      let failed = 0;

      for (const item of resultsToSave) {
        const { lead_id, ai_result, status, error: itemError } = item;
        if (!lead_id) continue;

        if (status === "error" || !ai_result) {
          // AI call failed on client, increment retry
          const { data: currentLead } = await supabase
            .from("email_leads")
            .select("retry_count")
            .eq("id", lead_id)
            .single();
          const currentRetry = currentLead?.retry_count || 0;
          const newRetry = currentRetry + 1;
          const newStatus = newRetry >= MAX_RETRIES ? "failed" : "pending";

          await supabase.from("email_leads").update({
            processing_status: newStatus,
            retry_count: newRetry,
            error_message: itemError || "AI processing failed on client",
          }).eq("id", lead_id);

          if (newStatus === "failed") failed++;
          continue;
        }

        const aiResult = ai_result as AIExtractionResult;

        const updatePayload: Record<string, unknown> = {
          ai_processed: true,
          ai_confidence: aiResult.confidence,
          ai_extracted_json: aiResult as unknown,
          error_message: null,
          processing_status: status,
        };

        if (status === "processed") {
          // Fetch lead data for enquiry creation
          const { data: lead } = await supabase
            .from("email_leads")
            .select("*")
            .eq("id", lead_id)
            .single();

          if (lead) {
            const result = await createEnquiryFromLead(supabase, lead, aiResult);
            if (result.error) {
              updatePayload.error_message = `Enquiry creation failed: ${result.error}`;
              updatePayload.processing_status = "pending";
            } else if (result.created) {
              enquiriesCreated++;
            }
          }
        } else if (status === "needs_review") {
          needsReview++;
        } else if (status === "rejected") {
          rejected++;
        }

        await supabase.from("email_leads").update(updatePayload).eq("id", lead_id);
        processed++;
      }

      console.log(JSON.stringify({
        event: "ai_processing_complete",
        processed,
        enquiries_created: enquiriesCreated,
        rejected,
        needs_review: needsReview,
        failed,
      }));

      return new Response(
        JSON.stringify({
          success: true,
          processed,
          enquiries_created: enquiriesCreated,
          rejected,
          needs_review: needsReview,
          failed,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Legacy fallback
    return new Response(
      JSON.stringify({ error: "Unknown action. Use 'claim' or 'save_results'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("AI email lead processing error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
