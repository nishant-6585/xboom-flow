import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check role
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const userRoles = (roles || []).map((r: any) => r.role);
    if (!userRoles.includes("admin") && !userRoles.includes("finance")) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { upload_id, file_url, file_name, card_id } = body;

    if (!upload_id || !file_url) {
      return new Response(JSON.stringify({ error: "Missing upload_id or file_url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download file from storage
    const filePath = file_url.replace(/^.*\/storage\/v1\/object\//, "");
    const parts = filePath.split("/");
    const bucket = parts[0];
    const path = parts.slice(1).join("/");

    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(bucket)
      .download(path);

    if (downloadError || !fileData) {
      await supabaseAdmin.from("statement_uploads").update({
        status: "failed",
        error_message: "Failed to download file: " + (downloadError?.message || "Unknown"),
      }).eq("id", upload_id);

      return new Response(JSON.stringify({ error: "File download failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get card info if provided
    let cardInfo = "";
    if (card_id) {
      const { data: card } = await supabaseAdmin
        .from("credit_cards")
        .select("card_name, bank_name, credit_limit")
        .eq("id", card_id)
        .single();
      if (card) {
        cardInfo = `Known card: ${card.card_name} (${card.bank_name}), Credit Limit: ${card.credit_limit}`;
      }
    }

    // Convert file to base64 for AI processing
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const ext = file_name.split(".").pop()?.toLowerCase() || "";

    let mimeType = "application/octet-stream";
    if (ext === "pdf") mimeType = "application/pdf";
    else if (ext === "csv") mimeType = "text/csv";
    else if (ext === "xlsx" || ext === "xls") mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    // For CSV/text files, extract text content directly
    let textContent = "";
    if (ext === "csv" || mimeType.startsWith("text/")) {
      textContent = new TextDecoder().decode(new Uint8Array(arrayBuffer));
    }

    const systemPrompt = `You are a financial data extraction AI. Extract credit card statement data from the uploaded file.

EXTRACT ONLY THESE FIELDS (return JSON):
{
  "billing_month": "YYYY-MM format",
  "due_date": "YYYY-MM-DD format",
  "outstanding_balance": number,
  "total_due": number,
  "minimum_due": number,
  "amount_paid": number or null,
  "payment_date": "YYYY-MM-DD" or null,
  "interest_charged": number,
  "late_fee": number,
  "credit_limit": number or null,
  "available_credit_limit": number or null,
  "detected_bank": "bank name" or null,
  "detected_card": "card name/type" or null,
  "confidence_score": 0-100,
  "missing_fields": ["field names that could not be found"]
}

RULES:
- DO NOT extract transactions
- If multiple months, select the LATEST
- Normalize dates to ISO format
- Normalize currency to plain numbers (remove ₹, Rs, commas)
- If a field is not found, use null or 0 as appropriate
- confidence_score: 90+ if all key fields found, 70-89 if some missing, <70 if many missing
${cardInfo ? `\n${cardInfo}` : ""}`;

    const userMessage = textContent
      ? `Parse this credit card statement (CSV/text content):\n\n${textContent.substring(0, 15000)}`
      : `Parse this credit card statement file (${file_name}).`;

    // Call Lovable AI gateway
    const aiPayload: any = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: [] as any[] },
      ],
    };

    if (textContent) {
      aiPayload.messages[1].content = [{ type: "text", text: userMessage }];
    } else {
      // For PDF/Excel, send as file with base64
      aiPayload.messages[1].content = [
        { type: "text", text: userMessage },
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64}` },
        },
      ];
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const aiResponse = await fetch("https://ai-gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify(aiPayload),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", errText);
      await supabaseAdmin.from("statement_uploads").update({
        status: "failed",
        error_message: "AI processing failed",
      }).eq("id", upload_id);

      return new Response(JSON.stringify({ error: "AI processing failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Extract JSON from response
    let parsed: any = null;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("JSON parse error:", e);
    }

    if (!parsed) {
      await supabaseAdmin.from("statement_uploads").update({
        status: "failed",
        error_message: "Could not extract structured data from statement",
      }).eq("id", upload_id);

      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update upload record
    await supabaseAdmin.from("statement_uploads").update({
      status: "parsed",
      ai_confidence_score: parsed.confidence_score || 0,
      parsed_json: parsed,
      card_id: card_id || null,
    }).eq("id", upload_id);

    return new Response(JSON.stringify({
      success: true,
      upload_id,
      parsed_data: parsed,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
