import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, userRole } = await req.json() as { messages: Message[]; userRole?: string };
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration missing");
    }

    // Fetch pricelist data
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: pricelist, error: pricelistError } = await supabase
      .from("pricelist")
      .select("*")
      .limit(500);

    if (pricelistError) {
      console.error("Error fetching pricelist:", pricelistError);
      throw new Error("Failed to fetch pricelist data");
    }

    // Determine what pricing info to show based on role
    const canSeeCostPrice = userRole === "admin" || userRole === "supply_chain";
    
    // Format pricelist for AI context (limit sensitive data based on role)
    const formattedPricelist = (pricelist || []).map(item => {
      const baseInfo = {
        name: item.product_name,
        category: item.product_category,
        brand: item.brand,
        website_price: item.website_price,
        dealer_price: item.dealer_price,
        availability: item.availability,
        lead_time: item.lead_time,
        min_order_qty: item.min_order_quantity,
        description: item.description,
      };
      
      if (canSeeCostPrice) {
        return {
          ...baseInfo,
          cost_price: item.cost_price,
          currency: item.currency,
        };
      }
      return baseInfo;
    });

    const systemPrompt = `You are a helpful sales assistant for a B2B products company. You have access to the product pricelist and can help sales team members find:
- Product information (names, descriptions, categories, brands)
- Pricing (website price, dealer price${canSeeCostPrice ? ', cost price' : ''})
- Availability status
- Lead times
- Minimum order quantities

Guidelines:
- Be concise and helpful
- Format prices with ₹ symbol when showing Indian Rupees
- If a product isn't found, suggest similar alternatives or ask for clarification
- For pricing questions, always mention both website and dealer prices when available
- Highlight availability status clearly
- If asked about products not in the list, be honest that you don't have that information
${!canSeeCostPrice ? '- You do not have access to cost price information for this user role' : '- You can share cost price information as this user has admin/supply chain access'}

Current Product Catalog (${formattedPricelist.length} products):
${JSON.stringify(formattedPricelist, null, 2)}`;

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
          ...messages,
        ],
        stream: true,
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
      return new Response(JSON.stringify({ error: "AI assistant unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Sales assistant error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
