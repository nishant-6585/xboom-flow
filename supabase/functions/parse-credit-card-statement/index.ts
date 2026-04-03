import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Validation helpers
function isValidDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
}
function isValidMonth(m: string): boolean {
  return /^\d{4}-\d{2}$/.test(m);
}
function clampNumber(val: any, min = 0, max = 100_000_000): number {
  const n = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(n)) return 0;
  return Math.max(min, Math.min(max, n));
}
function sanitizeString(s: any, maxLen = 100): string {
  if (typeof s !== "string") return "";
  return s.replace(/[<>\"'`;]/g, "").trim().substring(0, maxLen);
}

const respond = (body: Record<string, any>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const failUpload = async (admin: any, uploadId: string, msg: string, extra: Record<string, any> = {}) => {
  await admin.from("statement_uploads").update({
    status: "FAILED",
    error_message: msg.substring(0, 500),
    ...extra,
  }).eq("id", uploadId);
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Validate env vars
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing env vars:", { hasUrl: !!SUPABASE_URL, hasKey: !!SUPABASE_SERVICE_ROLE_KEY });
    return respond({ error: "Server configuration error" }, 500);
  }

  let upload_id: string | undefined;
  let supabaseAdmin: any;

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return respond({ error: "Unauthorized" }, 401);
    }

    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return respond({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub;

    // Role check
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const userRoles = (roles || []).map((r: any) => r.role);
    if (!userRoles.includes("admin") && !userRoles.includes("finance")) {
      return respond({ error: "Access denied" }, 403);
    }

    // Parse & validate input
    const body = await req.json();
    upload_id = sanitizeString(body.upload_id, 36);
    const file_url = sanitizeString(body.file_url, 500);
    const file_name = sanitizeString(body.file_name, 255);

    if (!upload_id || !file_url || !file_name) {
      return respond({ error: "Missing required fields" }, 400);
    }

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(upload_id)) {
      return respond({ error: "Invalid upload_id format" }, 400);
    }

    // Verify upload belongs to user
    const { data: uploadRecord } = await supabaseAdmin
      .from("statement_uploads")
      .select("id, uploaded_by, status")
      .eq("id", upload_id)
      .single();

    if (!uploadRecord) {
      return respond({ error: "Upload record not found" }, 404);
    }
    if (uploadRecord.uploaded_by !== userId) {
      return respond({ error: "Access denied to this upload" }, 403);
    }
    if (uploadRecord.status === "SUCCESS") {
      return respond({ error: "This upload has already been processed", duplicate: true }, 409);
    }

    // Download file
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("cc-statements")
      .download(file_url);

    if (downloadError || !fileData) {
      await failUpload(supabaseAdmin, upload_id, "Failed to download file");
      return respond({ error: "File download failed" }, 500);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    
    // Validate file size (max 10MB)
    if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
      await failUpload(supabaseAdmin, upload_id, "File exceeds 10MB limit");
      return respond({ error: "File too large" }, 400);
    }

    const ext = file_name.split(".").pop()?.toLowerCase() || "";
    if (!["pdf", "csv", "xlsx", "xls"].includes(ext)) {
      await failUpload(supabaseAdmin, upload_id, "Unsupported file type: " + ext);
      return respond({ error: "Unsupported file type" }, 400);
    }

    let mimeType = "application/octet-stream";
    if (ext === "pdf") mimeType = "application/pdf";
    else if (ext === "csv") mimeType = "text/csv";
    else if (ext === "xlsx" || ext === "xls") mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    let textContent = "";
    if (ext === "csv") {
      textContent = new TextDecoder().decode(new Uint8Array(arrayBuffer));
    }

    // Get existing cards
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
      const base64 = encodeBase64(new Uint8Array(arrayBuffer));
      aiMessages.push({
        role: "user",
        content: [
          { type: "text", text: userMsg },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      });
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      await failUpload(supabaseAdmin, upload_id, "AI service not configured");
      return respond({ error: "AI service not configured" }, 500);
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: aiMessages,
      }),
    });

    if (!aiResponse.ok) {
      const errBody = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errBody.substring(0, 200));
      
      let errorMsg = "AI processing failed";
      if (aiResponse.status === 429) errorMsg = "Rate limited. Please try again in a minute.";
      else if (aiResponse.status === 402) errorMsg = "AI credits exhausted. Please top up.";
      
      await failUpload(supabaseAdmin, upload_id, errorMsg);
      return respond({ error: errorMsg }, aiResponse.status === 429 ? 429 : 500);
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    let parsed: any = null;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // ignore parse error
    }

    if (!parsed || !parsed.bank_name) {
      await failUpload(supabaseAdmin, upload_id, "Could not extract structured data");
      return respond({ error: "Could not extract data from statement. Ensure it's a valid credit card statement." }, 422);
    }

    // ── VALIDATION ──────────────────────────────────────────────
    const validationErrors: string[] = [];

    // Sanitize strings
    parsed.bank_name = sanitizeString(parsed.bank_name, 50);
    parsed.card_name = sanitizeString(parsed.card_name, 100);

    if (!parsed.bank_name) validationErrors.push("Bank name missing");
    if (!parsed.card_name) parsed.card_name = `${parsed.bank_name} Card`;

    // Validate billing month
    if (!parsed.billing_month || !isValidMonth(parsed.billing_month)) {
      validationErrors.push("Invalid billing month format");
    } else {
      // Ensure billing month is not in the far future or too old
      const [y, m] = parsed.billing_month.split("-").map(Number);
      const now = new Date();
      const monthDate = new Date(y, m - 1);
      const maxFuture = new Date(now.getFullYear(), now.getMonth() + 2);
      const maxPast = new Date(now.getFullYear() - 10, 0);
      if (monthDate > maxFuture) validationErrors.push("Billing month is too far in the future");
      if (monthDate < maxPast) validationErrors.push("Billing month is too old");
    }

    // Validate due date
    if (!parsed.due_date || !isValidDate(parsed.due_date)) {
      validationErrors.push("Invalid or missing due date");
    }

    // Validate payment date if present
    if (parsed.payment_date && !isValidDate(parsed.payment_date)) {
      parsed.payment_date = null;
    }

    // Clamp numeric values to sane ranges
    parsed.outstanding_balance = clampNumber(parsed.outstanding_balance);
    parsed.total_due = clampNumber(parsed.total_due);
    parsed.minimum_due = clampNumber(parsed.minimum_due);
    parsed.amount_paid = clampNumber(parsed.amount_paid);
    parsed.interest_charged = clampNumber(parsed.interest_charged);
    parsed.late_fee = clampNumber(parsed.late_fee);
    parsed.credit_limit = clampNumber(parsed.credit_limit);
    parsed.available_credit_limit = clampNumber(parsed.available_credit_limit);
    parsed.confidence_score = clampNumber(parsed.confidence_score, 0, 100);

    // Cross-field consistency warnings (non-fatal)
    if (parsed.minimum_due > parsed.total_due && parsed.total_due > 0) {
      parsed.minimum_due = parsed.total_due; // auto-fix
    }
    if (parsed.outstanding_balance > parsed.credit_limit && parsed.credit_limit > 0) {
      // This can happen legitimately (over-limit), but flag low confidence
      if (parsed.confidence_score > 50) parsed.confidence_score = 50;
    }

    if (validationErrors.length > 0) {
      await failUpload(supabaseAdmin, upload_id, "Validation failed: " + validationErrors.join("; "));
      return respond({ error: "Statement validation failed: " + validationErrors.join(", ") }, 422);
    }

    // ── DUPLICATE DETECTION ─────────────────────────────────────
    // Check if a statement already exists for the same card + billing month
    const matchedCard = (existingCards || []).find((c: any) =>
      c.bank_name.toLowerCase() === parsed.bank_name.toLowerCase() &&
      c.card_name.toLowerCase() === parsed.card_name.toLowerCase()
    );

    if (matchedCard) {
      const { data: existingStmt } = await supabaseAdmin
        .from("cc_statements")
        .select("id, billing_month, total_due, outstanding_balance")
        .eq("card_id", matchedCard.id)
        .eq("billing_month", parsed.billing_month)
        .maybeSingle();

      if (existingStmt) {
        // Statement exists — check if values are identical (exact duplicate)
        if (
          existingStmt.total_due === parsed.total_due &&
          existingStmt.outstanding_balance === parsed.outstanding_balance
        ) {
          await failUpload(supabaseAdmin, upload_id, `Duplicate: ${parsed.card_name} ${parsed.billing_month} already exists with identical values`);
          return respond({
            error: `Statement for ${parsed.card_name} (${parsed.billing_month}) already exists with identical values`,
            duplicate: true,
            existing_statement_id: existingStmt.id,
          }, 409);
        }
        // Values differ — allow upsert but inform
        console.log(`Updating existing statement for ${matchedCard.id} / ${parsed.billing_month}`);
      }
    }

    // ── AUTO-CREATE OR FIND CARD ────────────────────────────────
    let cardId: string | null = null;

    if (matchedCard) {
      cardId = matchedCard.id;
      if (parsed.credit_limit > 0 && parsed.credit_limit !== matchedCard.credit_limit) {
        await supabaseAdmin.from("credit_cards").update({
          credit_limit: parsed.credit_limit,
        }).eq("id", cardId);
      }
    } else {
      const { data: newCard, error: cardError } = await supabaseAdmin
        .from("credit_cards")
        .insert({
          card_name: parsed.card_name,
          bank_name: parsed.bank_name,
          credit_limit: parsed.credit_limit || 0,
        })
        .select("id")
        .single();

      if (cardError) {
        console.error("Card creation error:", cardError.message);
        const fuzzy = (existingCards || []).find((c: any) =>
          c.bank_name.toLowerCase().includes(parsed.bank_name.toLowerCase())
        );
        cardId = fuzzy?.id || null;
      } else {
        cardId = newCard.id;
      }
    }

    if (!cardId) {
      await failUpload(supabaseAdmin, upload_id, "Could not match or create card");
      return respond({ error: "Card matching failed" }, 500);
    }

    // ── CALCULATE PAYMENT STATUS ────────────────────────────────
    const amountPaid = parsed.amount_paid || 0;
    const totalDue = parsed.total_due || 0;
    const minimumDue = parsed.minimum_due || 0;
    let paymentStatus = "UNPAID";
    if (amountPaid >= totalDue && totalDue > 0) paymentStatus = "FULL";
    else if (amountPaid >= minimumDue && minimumDue > 0) paymentStatus = "PARTIAL";

    const creditLimit = parsed.credit_limit || 0;
    const outstanding = parsed.outstanding_balance || 0;
    const availableCredit = parsed.available_credit_limit || Math.max(0, creditLimit - outstanding);

    // ── UPSERT STATEMENT ────────────────────────────────────────
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
      console.error("Statement insert error:", stmtError.message);
      await failUpload(supabaseAdmin, upload_id, "Failed to save statement: " + stmtError.message);
      return respond({ error: "Statement save failed" }, 500);
    }

    // ── MARK SUCCESS ────────────────────────────────────────────
    await supabaseAdmin.from("statement_uploads").update({
      status: "SUCCESS",
      confidence_score: parsed.confidence_score || 0,
      detected_bank: parsed.bank_name,
      detected_card_name: parsed.card_name,
      card_id: cardId,
      statement_id: stmt.id,
    }).eq("id", upload_id);

    return respond({
      success: true,
      upload_id,
      card_id: cardId,
      statement_id: stmt.id,
      confidence_score: parsed.confidence_score,
      detected_bank: parsed.bank_name,
      detected_card: parsed.card_name,
      auto_created_card: !matchedCard,
    });
  } catch (error: any) {
    console.error("Unexpected error:", error?.message || error);
    // Mark upload as FAILED if we have the ID
    if (upload_id && supabaseAdmin) {
      try {
        await failUpload(supabaseAdmin, upload_id, "Unexpected error: " + (error?.message || "Unknown"));
      } catch { /* best effort */ }
    }
    return respond({ error: "Internal server error" }, 500);
  }
});
