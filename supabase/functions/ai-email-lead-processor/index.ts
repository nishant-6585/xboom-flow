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

const INTENT_KEYWORDS = ["buy", "price", "quotation", "urgent", "require", "purchase", "order", "quote", "need", "enquiry", "inquiry", "cost", "rate", "pls", "please", "want"];
// Narrowed spam keywords — removed generic terms that could appear in legitimate emails
const SPAM_KEYWORDS = ["unsubscribe", "newsletter", "mailer-daemon", "auto-reply", "out of office", "ooo"];

const CLAUDE_PROMPT = `You are an expert sales assistant extracting leads from emails.

Company context:
We sell drones, robotics, and safety equipment.

Important:
Emails may be informal, short, broken English, or WhatsApp-style messages common in India.
Examples:
- "price drone"
- "need 1 drone urgent"
- "pls share quotation"
- "call me 9876543210"
- "want to buy safety helmet"

Interpret intent correctly even if grammar is poor.

Analyze the email and determine if it is a genuine business lead.

Rules:
- A lead shows intent to buy, request pricing, ask for quotation, or inquire about products/services
- Do NOT reject short or informal messages if intent is clear
- Ignore spam, newsletters, greetings without intent
- Auto-replies, OOO messages, promotional emails → is_lead: false
- Price enquiries, bulk orders, product questions → is_lead: true
- If urgency words like "urgent", "asap", "immediately" → urgency: "high"
- If timeline mentioned (weeks/months) → urgency: "medium"
- Default urgency: "low"

Extract:
- name (if available, else "Unknown")
- company (if available, else "Unknown")
- phone (if available, especially Indian formats like +91 or 10-digit)
- email (sender or mentioned)
- product_interest (what they want)
- product_category (one of: Consumer Drones, Enterprise Drones, Agriculture Drones, FPV Drones, Camera Drones, Drone Parts, Drone Accessories, Safety Equipment, Robotics, Other)
- quantity (number if mentioned, else 1)
- city (if mentioned)
- summary (short concise summary)

Return ONLY valid JSON (no explanation, no extra text):
{
  "is_lead": true/false,
  "confidence": number (0-1),
  "name": "...",
  "company": "...",
  "phone": "...",
  "email": "...",
  "product_interest": "...",
  "product_category": "...",
  "quantity": 1,
  "urgency": "low|medium|high",
  "city": "...",
  "summary": "..."
}`;

function isSpam(text: string): boolean {
  const lower = text.toLowerCase();
  return SPAM_KEYWORDS.some((kw) => lower.includes(kw));
}

function hasStrongIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return INTENT_KEYWORDS.some((kw) => lower.includes(kw));
}

function hasPhoneNumber(text: string): boolean {
  return /(\+91[\s-]?\d{10}|\b\d{10}\b|\b\d{5}[\s-]\d{5}\b)/.test(text);
}

function buildEmailContent(lead: Record<string, any>): string {
  return [
    `Customer Name: ${lead.customer_name}`,
    lead.email ? `Email: ${lead.email}` : "",
    lead.phone_number ? `Phone: ${lead.phone_number}` : "",
    lead.customer_company ? `Company: ${lead.customer_company}` : "",
    lead.product_name ? `Product: ${lead.product_name}` : "",
    lead.city ? `City: ${lead.city}` : "",
    lead.subject ? `Subject: ${lead.subject}` : "",
    lead.body_text ? `\nEmail Body:\n${lead.body_text.substring(0, 3000)}` : "",
    lead.notes ? `\nNotes:\n${lead.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function safeParseJSON(content: string): AIExtractionResult | null {
  try {
    return JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch { /* fall through */ }
    }
    const braceMatch = content.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch { /* fall through */ }
    }
    return null;
  }
}

async function callClaude(emailContent: string): Promise<AIExtractionResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 500,
      temperature: 0.1,
      messages: [
        { role: "user", content: `${CLAUDE_PROMPT}\n\nEmail:\n${emailContent}` },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const textContent = data.content?.[0]?.text;
  if (!textContent) throw new Error("Empty Claude response");

  const parsed = safeParseJSON(textContent);
  if (!parsed) throw new Error("Failed to parse Claude JSON response");

  return parsed;
}

function determineStatus(aiResult: AIExtractionResult, emailText: string): string {
  const intentFromText = hasStrongIntent(emailText);

  if (aiResult.is_lead || intentFromText) {
    if (aiResult.confidence >= 0.7 || intentFromText) return "processed";
    if (aiResult.confidence >= 0.4) return "needs_review";
    return "needs_review";
  }

  // Lower threshold: if confidence >= 0.4, send to review instead of rejecting
  if (aiResult.confidence >= 0.4) return "needs_review";
  return "rejected";
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
    const action = body.action || "process";

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

    // ========== ACTION: SAVE RESULTS (legacy support) ==========
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
          const { data: currentLead } = await supabase
            .from("email_leads")
            .select("retry_count")
            .eq("id", lead_id)
            .single();
          const currentRetry = currentLead?.retry_count || 0;
          const newRetry = currentRetry + 1;
          // FALLBACK: After max retries, create as "unclassified" instead of just failing
          const newStatus = newRetry >= MAX_RETRIES ? "needs_review" : "pending";

          await supabase.from("email_leads").update({
            processing_status: newStatus,
            retry_count: newRetry,
            error_message: itemError || "AI processing failed — moved to manual review",
            ai_processed: newRetry >= MAX_RETRIES,
            ai_confidence: newRetry >= MAX_RETRIES ? 0 : null,
            ai_extracted_json: newRetry >= MAX_RETRIES ? { is_lead: false, confidence: 0, summary: "AI failed after retries — needs manual review" } as unknown : null,
          }).eq("id", lead_id);

          if (newStatus === "needs_review") needsReview++;
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

      return new Response(
        JSON.stringify({ success: true, processed, enquiries_created: enquiriesCreated, rejected, needs_review: needsReview, failed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== ACTION: PROCESS (Server-side Claude processing) ==========
    if (action === "process") {
      const specificLeadId = body.lead_id;
      const batchSize = Math.min(body.batch_size || 10, 50);

      // Step 1: Claim pending leads
      const { data: pendingLeads, error: fetchError } = await supabase.rpc(
        "claim_pending_email_leads",
        {
          p_batch_size: batchSize,
          ...(specificLeadId ? { p_specific_lead_id: specificLeadId } : {}),
        }
      );
      if (fetchError) throw fetchError;

      const leads = pendingLeads || [];
      if (leads.length === 0) {
        return new Response(
          JSON.stringify({ processed: 0, enquiries_created: 0, rejected: 0, needs_review: 0, failed: 0, skipped_spam: 0, skipped_direct: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let processed = 0;
      let enquiriesCreated = 0;
      let rejected = 0;
      let needsReview = 0;
      let failed = 0;
      let skippedSpam = 0;
      let skippedDirect = 0;

      for (const lead of leads) {
        try {
          const emailContent = buildEmailContent(lead);
          const fullText = `${lead.customer_name || ""} ${lead.subject || ""} ${lead.body_text || ""} ${lead.notes || ""} ${lead.product_name || ""}`.toLowerCase();

          // ---- Hybrid Filter: Skip spam ----
          if (isSpam(fullText)) {
            await supabase.from("email_leads").update({
              processing_status: "rejected",
              ai_processed: true,
              ai_confidence: 0,
              ai_extracted_json: { is_lead: false, confidence: 0, summary: "Filtered as spam/newsletter by rule engine" } as unknown,
              error_message: null,
            }).eq("id", lead.id);
            skippedSpam++;
            rejected++;
            processed++;

            console.log(JSON.stringify({
              event: "email_lead_dropped",
              lead_id: lead.id,
              sender: lead.email,
              subject: lead.subject,
              reason: "spam_filter",
              detail: "Matched spam keyword in content",
            }));

            continue;
          }

          // ---- Hybrid Filter: Direct lead if strong intent + phone/product ----
          const strongIntent = hasStrongIntent(fullText);
          const hasPhone = hasPhoneNumber(fullText) || !!lead.phone_number;
          const hasProduct = !!lead.product_name && lead.product_name.trim() !== "";

          if (strongIntent && (hasPhone || hasProduct)) {
            const directResult: AIExtractionResult = {
              is_lead: true,
              confidence: 0.85,
              name: lead.customer_name || "Unknown",
              company: lead.customer_company || "Unknown",
              phone: lead.phone_number || "",
              email: lead.email || "",
              product_interest: lead.product_name || "General Enquiry",
              product_category: lead.product_category || "Consumer Drones",
              quantity: lead.quantity || 1,
              urgency: fullText.includes("urgent") || fullText.includes("asap") ? "high" : "medium",
              city: lead.city || "",
              summary: `Direct lead via rule engine: strong intent keywords detected`,
            };

            await supabase.from("email_leads").update({
              processing_status: "processed",
              ai_processed: true,
              ai_confidence: directResult.confidence,
              ai_extracted_json: directResult as unknown,
              error_message: null,
            }).eq("id", lead.id);

            const result = await createEnquiryFromLead(supabase, lead, directResult);
            if (result.created) enquiriesCreated++;
            skippedDirect++;
            processed++;

            console.log(JSON.stringify({
              event: "email_lead_processed",
              lead_id: lead.id,
              sender: lead.email,
              method: "rule_engine",
              status: "processed",
              confidence: 0.85,
            }));

            continue;
          }

          // ---- Call Claude for uncertain/ambiguous leads ----
          const aiResult = await callClaude(emailContent);
          const status = determineStatus(aiResult, fullText);

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
          } else if (status === "needs_review") {
            needsReview++;
          } else if (status === "rejected") {
            rejected++;
          }

          await supabase.from("email_leads").update(updatePayload).eq("id", lead.id);
          processed++;

          console.log(JSON.stringify({
            event: "email_lead_processed",
            lead_id: lead.id,
            sender: lead.email,
            method: "ai_claude",
            status,
            confidence: aiResult.confidence,
            is_lead: aiResult.is_lead,
          }));

        } catch (err) {
          console.error(`Error processing lead ${lead.id}:`, err);
          const { data: currentLead } = await supabase
            .from("email_leads")
            .select("retry_count")
            .eq("id", lead.id)
            .single();
          const currentRetry = currentLead?.retry_count || 0;
          const newRetry = currentRetry + 1;

          // FALLBACK: After max retries, move to needs_review instead of permanently failing
          const newStatus = newRetry >= MAX_RETRIES ? "needs_review" : "pending";

          await supabase.from("email_leads").update({
            processing_status: newStatus,
            retry_count: newRetry,
            error_message: err instanceof Error ? err.message : String(err),
            ai_processed: newRetry >= MAX_RETRIES,
            ai_confidence: newRetry >= MAX_RETRIES ? 0 : null,
            ai_extracted_json: newRetry >= MAX_RETRIES ? { is_lead: false, confidence: 0, summary: "AI processing failed after retries — needs manual review" } as unknown : null,
          }).eq("id", lead.id);

          if (newStatus === "needs_review") {
            needsReview++;
            console.log(JSON.stringify({
              event: "email_lead_fallback",
              lead_id: lead.id,
              sender: lead.email,
              reason: "ai_failure_max_retries",
              moved_to: "needs_review",
            }));
          } else {
            failed++;
          }
        }
      }

      console.log(JSON.stringify({
        event: "ai_processing_complete",
        engine: "anthropic-claude",
        processed,
        enquiries_created: enquiriesCreated,
        rejected,
        needs_review: needsReview,
        failed,
        skipped_spam: skippedSpam,
        skipped_direct: skippedDirect,
      }));

      return new Response(
        JSON.stringify({
          success: true,
          processed,
          enquiries_created: enquiriesCreated,
          rejected,
          needs_review: needsReview,
          failed,
          skipped_spam: skippedSpam,
          skipped_direct: skippedDirect,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use 'process', 'claim', or 'save_results'." }),
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
