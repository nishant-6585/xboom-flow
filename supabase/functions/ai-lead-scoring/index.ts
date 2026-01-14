import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EnquiryData {
  customer_name: string;
  customer_company: string;
  product_name: string;
  product_category: string;
  quantity: number;
  urgency: string;
  lead_temperature?: string;
  is_mega_deal?: boolean;
  notes?: string;
  requested_timeline?: string;
  response_pricing?: string;
  response_availability?: string;
  status: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { enquiry } = await req.json() as { enquiry: EnquiryData };
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert B2B sales analyst specializing in lead scoring and follow-up strategy. 
Analyze enquiries and provide actionable insights for sales teams.

Your analysis should be practical, specific, and actionable. Consider:
- Company size and potential (based on company name)
- Product category and typical sales cycles
- Quantity ordered (larger = higher value)
- Urgency level (indicates buying intent)
- Current lead temperature
- Timeline requirements

Provide your response in the following JSON structure:
{
  "score": <number 1-10>,
  "score_label": "<Hot/Warm/Cold>",
  "confidence": "<High/Medium/Low>",
  "summary": "<One sentence summary of the lead quality>",
  "key_factors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "suggested_approach": "<Paragraph describing the best follow-up strategy>",
  "priority_actions": ["<action 1>", "<action 2>", "<action 3>"],
  "talking_points": ["<point 1>", "<point 2>", "<point 3>"],
  "risk_factors": ["<risk 1>", "<risk 2>"],
  "recommended_timeline": "<When to follow up>"
}`;

    const userPrompt = `Analyze this B2B enquiry and provide lead scoring with follow-up recommendations:

Customer: ${enquiry.customer_name}
Company: ${enquiry.customer_company}
Product: ${enquiry.product_name}
Category: ${enquiry.product_category}
Quantity: ${enquiry.quantity}
Urgency Level: ${enquiry.urgency}
Current Lead Temperature: ${enquiry.lead_temperature || 'Not set'}
Mega Deal: ${enquiry.is_mega_deal ? 'Yes' : 'No'}
Status: ${enquiry.status}
Requested Timeline: ${enquiry.requested_timeline || 'Not specified'}
Pricing Response: ${enquiry.response_pricing || 'Not provided yet'}
Availability: ${enquiry.response_availability || 'Not checked yet'}
Notes: ${enquiry.notes || 'None'}

Provide your analysis in the JSON format specified.`;

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
        temperature: 0.3,
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

    if (!content) {
      throw new Error("No response from AI");
    }

    // Parse the JSON response from the AI
    let analysis;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
      analysis = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse AI analysis");
    }

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Lead scoring error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
