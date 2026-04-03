import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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
    const { upload_id, file_url, file_name } = body;

    if (!upload_id || !file_url || !file_name) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download file
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("cc-statements")
      .download(file_url);

    if (downloadError || !fileData) {
      await supabaseAdmin.from("statement_uploads").update({
        status: "FAILED",
        error_message: "Failed to download file",
      }).eq("id", upload_id);

      return new Response(JSON.stringify({ error: "File download failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const ext = file_name.split(".").pop()?.toLowerCase() || "";

    let mimeType = "application/octet-stream";
    if (ext === "pdf") mimeType = "application/pdf";
    else if (ext === "csv") mimeType = "text/csv";
    else if (ext === "xlsx" || ext === "xls") mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    // For text-based files, get content
    let textContent = "";
    if (ext === "csv") {
      textContent = new TextDecoder().decode(new Uint8Array(arrayBuffer));
    }

    // Get existing cards for context
    const { data: existingCards } = await supabaseAdmin
      .from("credit_cards")
      .select("id, card_name, bank_name, credit_limit");

    const cardsContext = (existingCards || []).map((c: any) =>
      `${c.card_name} (${c.bank_name}) - Limit: ${c.credit_limit}`
    ).join("\n");

    const systemPrompt = `You are a financial data extraction AI specialized in Indian credit card statements. Extract data from credit card statements.

EXTRACT THIS JSON:
{
  "bank_name": "exact bank name (e.g. HDFC, ICICI, Axis, SBI, Amex, Kotak, IndusInd, RBL, Yes Bank, Standard Chartered)",
  "card_name": "card variant name (e.g. HDFC Regalia, ICICI Amazon Pay, Axis Flipkart)",
  "billing_month": "YYYY-MM",
  "due_date": "YYYY-MM-DD",
  "outstanding_balance": number,
  "total_due": number,
  "minimum_due": number,
  "amount_paid": number or 0,
  "payment_date": "YYYY-MM-DD" or null,
  "interest_charged": number or 0,
  "late_fee": number or 0,
  "credit_limit": number or 0,
  "available_credit_limit": number or 0,
  "confidence_score": 0-100,
  "missing_fields": ["field names not found"]
}

RULES:
- DO NOT extract individual transactions
- If multiple months in file, extract LATEST only
- Normalize: remove ₹/Rs/INR symbols, commas → plain numbers
- Dates → ISO YYYY-MM-DD
- If available_credit_limit not found, calculate: credit_limit - outstanding_balance
- payment_status: if amount_paid >= total_due → "FULL", elif amount_paid >= minimum_due → "PARTIAL", else "UNPAID"
- Detect the bank and card name from logos, headers, letterhead

${cardsContext ? `EXISTING CARDS IN SYSTEM:\n${cardsContext}\nIf the statement matches an existing card, use the EXACT same card_name and bank_name.` : ""}

Return ONLY valid JSON, no markdown.`;

    const userMsg = textContent
      ? `Parse this credit card statement CSV:\n\n${textContent.substring(0, 15000)}`
      : `Parse this credit card statement file: ${file_name}`;

    const aiMessages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    if (textContent) {
      aiMessages.push({ role: "user", content: [{ type: "text", text: userMsg }] });
    } else {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      aiMessages.push({
        role: "user",
        content: [
          { type: "text", text: userMsg },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      });
    }

    const aiResponse = await fetch("https://ai-gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: aiMessages,
      }),
    });

    if (!aiResponse.ok) {
      const errBody = await aiResponse.text();
      console.error("AI error:", errBody);
      await supabaseAdmin.from("statement_uploads").update({
        status: "FAILED",
        error_message: "AI processing failed",
      }).eq("id", upload_id);
      return new Response(JSON.stringify({ error: "AI processing failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    let parsed: any = null;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // ignore
    }

    if (!parsed || !parsed.bank_name) {
      await supabaseAdmin.from("statement_uploads").update({
        status: "FAILED",
        error_message: "Could not extract structured data",
        parsed_json: { raw: content },
      }).eq("id", upload_id);
      return new Response(JSON.stringify({ error: "Parsing failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auto-create or find card
    let cardId: string | null = null;
    const matchedCard = (existingCards || []).find((c: any) =>
      c.bank_name.toLowerCase() === parsed.bank_name.toLowerCase() &&
      c.card_name.toLowerCase() === parsed.card_name.toLowerCase()
    );

    if (matchedCard) {
      cardId = matchedCard.id;
      // Update credit limit if new one is higher
      if (parsed.credit_limit > 0 && parsed.credit_limit !== matchedCard.credit_limit) {
        await supabaseAdmin.from("credit_cards").update({
          credit_limit: parsed.credit_limit,
        }).eq("id", cardId);
      }
    } else {
      // Auto-create card
      const { data: newCard, error: cardError } = await supabaseAdmin
        .from("credit_cards")
        .insert({
          card_name: parsed.card_name || `${parsed.bank_name} Card`,
          bank_name: parsed.bank_name,
          credit_limit: parsed.credit_limit || 0,
        })
        .select("id")
        .single();

      if (cardError) {
        console.error("Card creation error:", cardError);
        // Try fuzzy match
        const fuzzy = (existingCards || []).find((c: any) =>
          c.bank_name.toLowerCase().includes(parsed.bank_name.toLowerCase())
        );
        cardId = fuzzy?.id || null;
      } else {
        cardId = newCard.id;
      }
    }

    if (!cardId) {
      await supabaseAdmin.from("statement_uploads").update({
        status: "FAILED",
        error_message: "Could not match or create card",
        parsed_json: parsed,
      }).eq("id", upload_id);
      return new Response(JSON.stringify({ error: "Card matching failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate payment status
    const amountPaid = parsed.amount_paid || 0;
    const totalDue = parsed.total_due || 0;
    const minimumDue = parsed.minimum_due || 0;
    let paymentStatus = "UNPAID";
    if (amountPaid >= totalDue && totalDue > 0) paymentStatus = "FULL";
    else if (amountPaid >= minimumDue && minimumDue > 0) paymentStatus = "PARTIAL";

    const creditLimit = parsed.credit_limit || 0;
    const outstanding = parsed.outstanding_balance || 0;
    const availableCredit = parsed.available_credit_limit || Math.max(0, creditLimit - outstanding);

    // Insert statement (upsert on card_id + billing_month)
    const { data: stmt, error: stmtError } = await supabaseAdmin
      .from("cc_statements")
      .upsert({
        card_id: cardId,
        billing_month: parsed.billing_month,
        due_date: parsed.due_date,
        outstanding_balance: outstanding,
        total_due: totalDue,
        minimum_due: minimumDue,
        amount_paid: amountPaid,
        payment_date: parsed.payment_date || null,
        interest_charged: parsed.interest_charged || 0,
        late_fee: parsed.late_fee || 0,
        payment_status: paymentStatus,
        available_credit_limit: availableCredit,
        upload_id: upload_id,
      }, { onConflict: "card_id,billing_month" })
      .select("id")
      .single();

    if (stmtError) {
      console.error("Statement insert error:", stmtError);
      await supabaseAdmin.from("statement_uploads").update({
        status: "FAILED",
        error_message: "Failed to save statement: " + stmtError.message,
        parsed_json: parsed,
      }).eq("id", upload_id);
      return new Response(JSON.stringify({ error: "Statement save failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update upload record as SUCCESS
    await supabaseAdmin.from("statement_uploads").update({
      status: "SUCCESS",
      confidence_score: parsed.confidence_score || 0,
      parsed_json: parsed,
      detected_bank: parsed.bank_name,
      detected_card_name: parsed.card_name,
      card_id: cardId,
      statement_id: stmt.id,
    }).eq("id", upload_id);

    return new Response(JSON.stringify({
      success: true,
      upload_id,
      card_id: cardId,
      statement_id: stmt.id,
      confidence_score: parsed.confidence_score,
      detected_bank: parsed.bank_name,
      detected_card: parsed.card_name,
      auto_created_card: !matchedCard,
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
