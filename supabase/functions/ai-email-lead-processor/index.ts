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

  // Parse — handle markdown code blocks if present
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
  return JSON.parse(jsonStr) as AIExtractionResult;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("authorization");
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedCronSecret = Deno.env.get("CRON_SECRET");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (cronSecret && cronSecret === expectedCronSecret) {
      // Cron-triggered — OK
    } else if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const userRoles = (roles || []).map((r: any) => r.role);
      if (!userRoles.includes("admin") && !userRoles.includes("marketing") && !userRoles.includes("sales")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const specificLeadId = body.lead_id;
    const batchSize = Math.min(body.batch_size || 10, 50);

    // Atomically claim pending leads (FOR UPDATE SKIP LOCKED) and set status to 'processing'
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
    const results: any[] = [];

    for (const lead of pendingLeads) {
      try {
        const emailContent = [
          `Customer Name: ${lead.customer_name}`,
          lead.email ? `Email: ${lead.email}` : "",
          lead.phone_number ? `Phone: ${lead.phone_number}` : "",
          lead.customer_company ? `Company: ${lead.customer_company}` : "",
          lead.product_name ? `Product: ${lead.product_name}` : "",
          lead.notes ? `\nEmail Content:\n${lead.notes}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const aiResult = await callAI(emailContent);

        // Store AI results — never overwrite raw email data
        const updatePayload: Record<string, unknown> = {
          ai_processed: true,
          ai_confidence: aiResult.confidence,
          ai_extracted_json: aiResult as unknown,
          error_message: null,
        };

        const INTENT_KEYWORDS = ["buy", "price", "quotation", "urgent", "require", "purchase", "order", "quote", "need"];
        const emailText = (lead.notes || "").toLowerCase();
        const hasStrongIntent = INTENT_KEYWORDS.some((kw) => emailText.includes(kw));
        const isQualified = aiResult.is_lead && (aiResult.confidence >= 0.7 || hasStrongIntent);

        if (isQualified) {
          // Idempotency check: skip if enquiry already exists for this email lead
          const { data: existingEnquiry } = await supabase
            .from("enquiries")
            .select("id")
            .eq("email_lead_id", lead.id)
            .limit(1);

          if (existingEnquiry && existingEnquiry.length > 0) {
            updatePayload.processing_status = "processed";
            await supabase.from("email_leads").update(updatePayload).eq("id", lead.id);
            processed++;
            results.push({ id: lead.id, status: "already_processed", skipped: true });
            continue;
          }

          updatePayload.processing_status = "processed";

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

          const { error: enquiryError } = await supabase
            .from("enquiries")
            .insert(enquiryData);

          if (enquiryError) {
            console.error("Enquiry creation error:", enquiryError.message);
            updatePayload.error_message = `Enquiry creation failed: ${enquiryError.message}`;
            updatePayload.processing_status = "pending";
          } else {
            enquiriesCreated++;
          }
        } else {
          updatePayload.processing_status = "rejected";
          rejected++;
        }

        await supabase
          .from("email_leads")
          .update(updatePayload)
          .eq("id", lead.id);

        processed++;
        results.push({
          id: lead.id,
          is_lead: aiResult.is_lead,
          confidence: aiResult.confidence,
          status: updatePayload.processing_status,
        });
      } catch (leadErr) {
        console.error(`Error processing lead ${lead.id}:`, leadErr);

        // Reset back to pending so it can be retried
        await supabase
          .from("email_leads")
          .update({
            processing_status: "pending",
            error_message: `AI processing error: ${String(leadErr)}`,
          })
          .eq("id", lead.id);

        results.push({ id: lead.id, error: String(leadErr) });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        enquiries_created: enquiriesCreated,
        rejected,
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
