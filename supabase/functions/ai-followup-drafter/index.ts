import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Supabase configuration missing");

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { enquiry } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an expert B2B sales communication specialist for XBoom, a drone technology company.
Your job is to draft personalized follow-up messages that convert leads into customers.

Rules:
- Be professional but warm, never pushy
- Reference specific product interest and context
- Include a clear call-to-action
- Adapt tone based on lead score/temperature:
  * Hot lead (score 7-10): Confident, closing-oriented, create urgency
  * Warm lead (score 4-6): Helpful, value-focused, offer demos/meetings
  * Cold lead (score 1-3): Soft nurturing, educational, no pressure
- Keep WhatsApp messages under 300 characters
- Keep email body concise (3-4 paragraphs max)
- Use the salesperson's name for sign-off
- Never use generic placeholders like {{name}} — use actual values provided

Return JSON:
{
  "whatsapp_message": "<ready-to-send WhatsApp message>",
  "email_subject": "<compelling email subject line>",
  "email_body": "<full email body with greeting, content, CTA, sign-off>",
  "follow_up_strategy": "<1-2 sentence recommendation on next steps>",
  "tone_used": "<aggressive_close|value_focused|soft_nurture>"
}`;

    const userPrompt = `Draft follow-up messages for this enquiry:

Customer Name: ${enquiry.customer_name}
Company: ${enquiry.customer_company}
Product Interest: ${enquiry.product_name}
Category: ${enquiry.product_category}
Quantity: ${enquiry.quantity}
Urgency: ${enquiry.urgency}
Lead Temperature: ${enquiry.lead_temperature || "warm"}
Is Mega Deal: ${enquiry.is_mega_deal ? "Yes" : "No"}
Current Status: ${enquiry.status}
Notes: ${enquiry.notes || "None"}
Requested Timeline: ${enquiry.requested_timeline || "Not specified"}
Sales Person: ${enquiry.sales_person_name}
Days Since Enquiry: ${enquiry.days_since_created || "Unknown"}
Previous Response Pricing: ${enquiry.response_pricing || "Not yet shared"}
AI Lead Score: ${enquiry.ai_score || "Not scored"}
AI Priority: ${enquiry.ai_priority || "Not assessed"}

Generate personalized WhatsApp message, email subject, and email body.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in workspace settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) throw new Error("No response from AI");

    let drafts;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
      drafts = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse AI drafts");
    }

    return new Response(JSON.stringify({ drafts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Follow-up drafter error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
