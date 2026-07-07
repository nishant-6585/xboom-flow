import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Server not configured");
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { company_id } = await req.json();
    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authorization: must be an approved internal user with a CRM-relevant role.
    const { data: isApproved } = await admin.rpc("is_user_approved", { _user_id: user.id });
    if (!isApproved) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const allowedRoles = ["admin", "sales", "sales_manager", "supply_chain", "finance"];
    const roleChecks = await Promise.all(
      allowedRoles.map((r) => admin.rpc("has_role", { _user_id: user.id, _role: r }))
    );
    const hasAllowedRole = roleChecks.some((r) => r.data === true);
    if (!hasAllowedRole) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: company }, { data: orders }, { data: activities }, { data: contacts }] = await Promise.all([
      admin.from("companies").select("*").eq("id", company_id).maybeSingle(),
      admin.from("orders").select("order_number, product_name, total_sales_amount, status, order_date").eq("company_id", company_id).order("order_date", { ascending: false }).limit(20),
      admin.from("company_activities").select("activity_type, source, title, description, occurred_at").eq("company_id", company_id).order("occurred_at", { ascending: false }).limit(30),
      admin.from("company_contacts").select("name, designation, phone, email").eq("company_id", company_id),
    ]);

    if (!company) {
      return new Response(JSON.stringify({ error: "Company not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `You are a senior sales account strategist. Generate a concise account brief (max 250 words) in Markdown for the following B2B account. Use clear sections: **Status**, **Opportunities**, **Risks**, **Recommended Next Step**.

## Account Snapshot
- Name: ${company.name}
- Industry: ${company.industry || "Unknown"}
- City: ${company.city || "Unknown"}
- Tier: ${company.tier || "Unrated"} (${company.tier_source || "auto"})
- Health Score: ${company.health_score}/100 (${company.health_band})
- Total Revenue: ₹${(company.total_order_value || 0).toLocaleString("en-IN")}
- Total Orders: ${company.total_orders_count || 0}
- Recurring: ${company.is_recurring ? "Yes" : "No"}
- Pipeline Value: ₹${(company.pipeline_value || 0).toLocaleString("en-IN")}
- Potential Value: ₹${(company.potential_value || 0).toLocaleString("en-IN")}
- Last Order: ${company.last_order_at || "—"}
- Last Activity: ${company.last_activity_at || "—"}

## Recent Orders (top 20)
${(orders || []).map((o: any) => `- ${o.order_date?.slice(0,10) || "—"} | ${o.product_name || "—"} | ₹${o.total_sales_amount || 0} | ${o.status}`).join("\n") || "None"}

## Recent Activity (top 30)
${(activities || []).map((a: any) => `- ${a.occurred_at?.slice(0,10)} | ${a.activity_type}/${a.source} | ${a.title}`).join("\n") || "None"}

## Contacts
${(contacts || []).map((c: any) => `- ${c.name}${c.designation ? ` (${c.designation})` : ""} ${c.phone || ""} ${c.email || ""}`).join("\n") || "None"}

Be specific to this account, reference numbers, and recommend ONE concrete next action with timing.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a senior B2B sales account strategist. Be concise, specific, and actionable." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits to continue." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      throw new Error(`AI gateway failed: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const brief = aiData.choices?.[0]?.message?.content || "No brief generated.";

    await admin.from("companies").update({
      ai_brief: brief,
      ai_brief_generated_at: new Date().toISOString(),
    }).eq("id", company_id);

    return new Response(JSON.stringify({ brief }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-account-brief error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});