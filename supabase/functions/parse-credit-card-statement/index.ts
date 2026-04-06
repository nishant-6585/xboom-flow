import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

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
  return s.replace(/[<>"'`;]/g, "").trim().substring(0, maxLen);
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

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    return respond({ error: "Server configuration error" }, 500);
  }

  let upload_id: string | undefined;
  let supabaseAdmin: any;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return respond({ error: "Unauthorized" }, 401);
    }

    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return respond({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub;

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const userRoles = (roles || []).map((r: any) => r.role);
    if (!userRoles.includes("admin") && !userRoles.includes("finance")) {
      return respond({ error: "Access denied" }, 403);
    }

    const body = await req.json();
    upload_id = sanitizeString(body.upload_id, 36);
    const file_url = sanitizeString(body.file_url, 500);
    const file_name = sanitizeString(body.file_name, 255);
    const pdf_password = typeof body.pdf_password === "string" ? body.pdf_password.substring(0, 200) : undefined;
    const force_reprocess = body.force_reprocess === true;
    const user_guidance = typeof body.user_guidance === "string" ? sanitizeString(body.user_guidance, 1000) : "";

    if (!upload_id || !file_url || !file_name) {
      return respond({ error: "Missing required fields" }, 400);
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(upload_id)) {
      return respond({ error: "Invalid upload_id format" }, 400);
    }

    const { data: uploadRecord } = await supabaseAdmin
      .from("statement_uploads")
      .select("id, uploaded_by, status, statement_id")
      .eq("id", upload_id)
      .single();

    if (!uploadRecord) return respond({ error: "Upload record not found" }, 404);
    if (uploadRecord.uploaded_by !== userId) return respond({ error: "Access denied to this upload" }, 403);
    if (uploadRecord.status === "SUCCESS" && !force_reprocess) {
      return respond({ error: "Already processed", duplicate: true }, 409);
    }

    if (force_reprocess) {
      await supabaseAdmin.from("statement_uploads").update({
        status: "PROCESSING",
        error_message: null,
      }).eq("id", upload_id);
    }

    const currentStatementId = uploadRecord.statement_id || null;

    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("cc-statements")
      .download(file_url, undefined, { cache: "no-store" });

    if (downloadError || !fileData) {
      await failUpload(supabaseAdmin, upload_id, "Failed to download file");
      return respond({ error: "File download failed" }, 500);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
      await failUpload(supabaseAdmin, upload_id, "File exceeds 10MB limit");
      return respond({ error: "File too large" }, 400);
    }

    const ext = file_name.split(".").pop()?.toLowerCase() || "";
    if (!["pdf", "csv", "xlsx", "xls"].includes(ext)) {
      await failUpload(supabaseAdmin, upload_id, "Unsupported file type: " + ext);
      return respond({ error: "Unsupported file type" }, 400);
    }

    let pdfBytes = new Uint8Array(arrayBuffer);
    let pdfDecrypted = false;
    let extractedPdfText = "";

    if (ext === "pdf") {
      try {
        await PDFDocument.load(pdfBytes, { ignoreEncryption: false });
      } catch (encErr: any) {
        const errMsg = (encErr?.message || "").toLowerCase();
        const isEncrypted = errMsg.includes("encrypt") || errMsg.includes("password") || errMsg.includes("protected");

        if (isEncrypted && !pdf_password) {
          await supabaseAdmin.from("statement_uploads").update({
            status: "FAILED",
            error_message: "Password-protected PDF. Please provide the password.",
          }).eq("id", upload_id);
          return respond({ error: "This PDF is password-protected. Please provide the password.", password_required: true }, 422);
        }

        if (isEncrypted && pdf_password) {
          console.log("PDF is encrypted, attempting text extraction with password...");
          
          // Try multiple approaches to extract text from password-protected PDF
          let decryptionSucceeded = false;
          
          // Approach 1: Use pdf-parse (wraps pdfjs with better compatibility)
          if (!decryptionSucceeded) {
            try {
              const pdfParse = (await import("npm:pdf-parse@1.1.1")).default;
              const buffer = Buffer.from(pdfBytes);
              const data = await pdfParse(buffer, { password: pdf_password });
              
              if (data.text && data.text.trim().length > 50) {
                extractedPdfText = data.text;
                pdfDecrypted = true;
                decryptionSucceeded = true;
                console.log(`pdf-parse succeeded: ${data.numpages} pages, ${extractedPdfText.length} chars`);
              }
            } catch (e1: any) {
              console.log("pdf-parse failed:", e1?.message);
              const errMsg1 = (e1?.message || "").toLowerCase();
              if (errMsg1.includes("incorrect password") || errMsg1.includes("wrong password")) {
                await failUpload(supabaseAdmin, upload_id, "Incorrect PDF password. Please try again with the correct password.");
                return respond({ error: "Incorrect PDF password. Please try again with the correct password.", password_required: true }, 422);
              }
            }
          }
          
          // Approach 2: Use pdfjs-dist directly
          if (!decryptionSucceeded) {
            try {
              const pdfjsLib = await import("npm:pdfjs-dist@4.0.379/legacy/build/pdf.mjs");
              
              const loadingTask = pdfjsLib.getDocument({
                data: new Uint8Array(pdfBytes),
                password: pdf_password,
                useWorkerFetch: false,
                isEvalSupported: false,
                useSystemFonts: false,
              });
              
              const pdfDoc = await loadingTask.promise;
              const pageTexts: string[] = [];
              
              for (let i = 1; i <= pdfDoc.numPages; i++) {
                const page = await pdfDoc.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map((item: any) => item.str).join(" ");
                pageTexts.push(`--- Page ${i} ---\n${pageText}`);
              }
              
              extractedPdfText = pageTexts.join("\n\n");
              pdfDecrypted = true;
              decryptionSucceeded = true;
              console.log(`pdfjs-dist succeeded: ${pdfDoc.numPages} pages, ${extractedPdfText.length} chars`);
            } catch (e2: any) {
              console.log("pdfjs-dist failed:", e2?.message);
              const errMsg2 = (e2?.message || "").toLowerCase();
              if (errMsg2.includes("incorrect password") || errMsg2.includes("wrong password")) {
                await failUpload(supabaseAdmin, upload_id, "Incorrect PDF password. Please try again with the correct password.");
                return respond({ error: "Incorrect PDF password. Please try again with the correct password.", password_required: true }, 422);
              }
            }
          }
          
          // If both approaches failed but not due to wrong password, report error
          if (!decryptionSucceeded) {
            console.error("All PDF decryption approaches failed");
            await failUpload(supabaseAdmin, upload_id, "Unable to decrypt this PDF. Please ensure the password is correct.");
            return respond({ error: "Unable to decrypt this PDF. Please ensure the password is correct.", password_required: true }, 422);
          }
        }
      }
    }

    let mimeType = "application/octet-stream";
    if (ext === "pdf") mimeType = "application/pdf";
    else if (ext === "csv") mimeType = "text/csv";
    else if (ext === "xlsx" || ext === "xls") mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    let textContent = "";
    if (ext === "csv") {
      textContent = new TextDecoder().decode(new Uint8Array(arrayBuffer));
    } else if (pdfDecrypted && extractedPdfText) {
      textContent = extractedPdfText;
    }

    const { data: existingCards } = await supabaseAdmin
      .from("credit_cards")
      .select("id, card_name, bank_name, credit_limit");

    const cardsContext = (existingCards || []).map((c: any) =>
      `${c.card_name} (${c.bank_name}) - Limit: ${c.credit_limit}`
    ).join("\n");

    const systemPrompt = `You are a financial data extraction AI specialized in Indian credit card statements.

Extract BOTH statement summary AND individual transactions from the credit card statement.

RETURN THIS JSON:
{
  "bank_name": "exact bank name",
  "card_name": "card variant name",
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
  "missing_fields": ["field names not found"],
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "merchant/transaction description",
      "category": "shopping/food/fuel/travel/utilities/entertainment/health/education/insurance/emi/fees/payment/refund/cashback/other",
      "type": "debit/credit/fee/interest/payment/refund/emi/cashback",
      "amount": number (positive always),
      "merchant": "merchant name if identifiable"
    }
  ]
}

CRITICAL RULES FOR outstanding_balance vs total_due:
- "total_due" is the TOTAL AMOUNT DUE for THIS billing cycle/month only (sometimes labeled "Total Amount Due", "Statement Balance", "New Balance", "Current Month Dues").
- "outstanding_balance" must represent TOTAL OUTSTANDING on the card, and should align with this formula whenever possible: outstanding_balance = credit_limit - available_credit_limit.
- Prioritize extracting "available_credit_limit" / "available limit" accurately from the statement.
- If both credit_limit and available_credit_limit are present, derive outstanding_balance from them instead of copying total_due.
- Do NOT set outstanding_balance equal to total_due unless the statement truly implies they are the same AND available_credit_limit is not available.
- If the statement only shows available limit and credit limit, calculate outstanding_balance = credit_limit - available_credit_limit.
- If the statement only shows outstanding and not available limit, then return the extracted outstanding and available_credit_limit as max(credit_limit - outstanding_balance, 0) when credit_limit is known.

CRITICAL RULE FOR PAYMENTS (amount_paid):
- ALWAYS set "amount_paid" to 0. Do NOT extract any payment amount from the statement.
- Payments are tracked separately in our system via manual "Record Payment" entries.
- Do NOT treat CR/credit transactions, "Payment Received", "NEFT/IMPS", or any other line item as a payment.
- When categorizing transactions: CR amounts should have type "credit" or "refund" or "cashback" — NEVER "payment".

OTHER RULES:
- Extract ALL transactions visible in the statement
- Categorize each transaction into the provided categories
- type: debit for purchases, credit for credits/refunds, fee for charges, interest for interest, payment for payments received (actual cardholder payments only), emi for EMI debits
- Dates → ISO YYYY-MM-DD
- Normalize: remove ₹/Rs/INR symbols, commas → plain numbers
- If available_credit_limit not found, calculate: max(credit_limit - outstanding_balance, 0)
- If multiple months in file, extract LATEST month's data
- Detect bank from logos, headers, letterhead
- "minimum_due" is the minimum payment required - look for "Minimum Amount Due" or "MAD"

${cardsContext ? `EXISTING CARDS IN SYSTEM:\n${cardsContext}\nIf the statement matches an existing card, use the EXACT same card_name and bank_name.` : ""}

Return ONLY valid JSON, no markdown.`;

    let userMsg = "";
    if (pdfDecrypted && textContent) {
      userMsg = `Parse this credit card statement (extracted text from password-protected PDF: ${file_name}):\n\n${textContent.substring(0, 30000)}`;
    } else if (textContent) {
      userMsg = `Parse this credit card statement CSV:\n\n${textContent.substring(0, 15000)}`;
    } else {
      userMsg = `Parse this credit card statement file: ${file_name}`;
    }

    if (pdf_password && ext === "pdf" && !pdfDecrypted) {
      userMsg += `\n\nNote: This PDF is password-protected. The password is: ${pdf_password}`;
    }

    if (user_guidance) {
      userMsg += `\n\nUser correction guidance for this re-analysis: ${user_guidance}`;
    }

    const aiMessages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    if (textContent) {
      aiMessages.push({ role: "user", content: [{ type: "text", text: userMsg }] });
    } else {
      const base64 = encodeBase64(pdfBytes.length > 0 ? pdfBytes : new Uint8Array(arrayBuffer));
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
      else if (aiResponse.status === 402) errorMsg = "AI credits exhausted.";
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
      return respond({ error: "Could not extract data from statement." }, 422);
    }

    const validationErrors: string[] = [];
    parsed.bank_name = sanitizeString(parsed.bank_name, 50);
    parsed.card_name = sanitizeString(parsed.card_name, 100);
    if (!parsed.bank_name) validationErrors.push("Bank name missing");
    if (!parsed.card_name) parsed.card_name = `${parsed.bank_name} Card`;

    if (!parsed.billing_month || !isValidMonth(parsed.billing_month)) {
      validationErrors.push("Invalid billing month");
    } else {
      const [y, m] = parsed.billing_month.split("-").map(Number);
      const now = new Date();
      if (new Date(y, m - 1) > new Date(now.getFullYear(), now.getMonth() + 2)) validationErrors.push("Billing month too far in future");
      if (new Date(y, m - 1) < new Date(now.getFullYear() - 10, 0)) validationErrors.push("Billing month too old");
    }

    if (!parsed.due_date || !isValidDate(parsed.due_date)) validationErrors.push("Invalid due date");
    if (parsed.payment_date && !isValidDate(parsed.payment_date)) parsed.payment_date = null;

    parsed.outstanding_balance = clampNumber(parsed.outstanding_balance);
    parsed.total_due = clampNumber(parsed.total_due);
    parsed.minimum_due = clampNumber(parsed.minimum_due);
    parsed.amount_paid = clampNumber(parsed.amount_paid);
    parsed.interest_charged = clampNumber(parsed.interest_charged);
    parsed.late_fee = clampNumber(parsed.late_fee);
    parsed.credit_limit = clampNumber(parsed.credit_limit);
    parsed.available_credit_limit = clampNumber(parsed.available_credit_limit);
    parsed.confidence_score = clampNumber(parsed.confidence_score, 0, 100);

    if (parsed.minimum_due > parsed.total_due && parsed.total_due > 0) parsed.minimum_due = parsed.total_due;
    if (parsed.outstanding_balance > parsed.credit_limit && parsed.credit_limit > 0) {
      if (parsed.confidence_score > 50) parsed.confidence_score = 50;
    }

    if (validationErrors.length > 0) {
      await failUpload(supabaseAdmin, upload_id, "Validation failed: " + validationErrors.join("; "));
      return respond({ error: "Validation failed: " + validationErrors.join(", ") }, 422);
    }

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

      if (existingStmt && existingStmt.id !== currentStatementId) {
        await failUpload(supabaseAdmin, upload_id, `Duplicate: ${parsed.card_name} ${parsed.billing_month} already exists`);
        return respond({ error: "Statement already exists for this card and billing month", duplicate: true }, 409);
      }
    }

    let cardId: string | null = null;
    if (matchedCard) {
      cardId = matchedCard.id;
      if (parsed.credit_limit > 0 && parsed.credit_limit !== matchedCard.credit_limit) {
        await supabaseAdmin.from("credit_cards").update({ credit_limit: parsed.credit_limit }).eq("id", cardId);
      }
    } else {
      const { data: newCard, error: cardError } = await supabaseAdmin
        .from("credit_cards")
        .insert({ card_name: parsed.card_name, bank_name: parsed.bank_name, credit_limit: parsed.credit_limit || 0 })
        .select("id")
        .single();

      if (cardError) {
        const fuzzy = (existingCards || []).find((c: any) => c.bank_name.toLowerCase().includes(parsed.bank_name.toLowerCase()));
        cardId = fuzzy?.id || null;
      } else {
        cardId = newCard.id;
      }
    }

    if (!cardId) {
      await failUpload(supabaseAdmin, upload_id, "Could not match or create card");
      return respond({ error: "Card matching failed" }, 500);
    }

    const amountPaid = parsed.amount_paid || 0;
    const totalDue = parsed.total_due || 0;
    const minimumDue = parsed.minimum_due || 0;
    let paymentStatus = "UNPAID";
    if (amountPaid >= totalDue && totalDue > 0) paymentStatus = "FULL";
    else if (amountPaid >= minimumDue && minimumDue > 0) paymentStatus = "PARTIAL";

    const creditLimit = parsed.credit_limit || matchedCard?.credit_limit || 0;
    let availableCredit = parsed.available_credit_limit || 0;
    let outstanding = parsed.outstanding_balance || 0;

    if (creditLimit > 0 && availableCredit > 0) {
      outstanding = Math.max(0, creditLimit - availableCredit);
    } else if (creditLimit > 0 && outstanding >= 0) {
      availableCredit = Math.max(0, creditLimit - outstanding);
    }

    const statementPayload = {
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
    };

    let stmt: { id: string } | null = null;
    let stmtError: { message: string } | null = null;

    if (currentStatementId) {
      const updateResult = await supabaseAdmin
        .from("cc_statements")
        .update(statementPayload)
        .eq("id", currentStatementId)
        .select("id")
        .single();
      stmt = updateResult.data;
      stmtError = updateResult.error;
    } else {
      const insertResult = await supabaseAdmin
        .from("cc_statements")
        .insert(statementPayload)
        .select("id")
        .single();
      stmt = insertResult.data;
      stmtError = insertResult.error;
    }

    if (stmtError || !stmt) {
      console.error("Statement save error:", stmtError?.message);
      await failUpload(supabaseAdmin, upload_id, "Failed to save statement: " + (stmtError?.message || "Unknown error"));
      return respond({ error: "Statement save failed" }, 500);
    }

    const transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
    let txnCount = 0;

    if (stmt.id) {
      await supabaseAdmin.from("cc_transactions").delete().eq("statement_id", stmt.id);
    }

    if (transactions.length > 0 && stmt.id) {
      const txnRows = transactions
        .filter((t: any) => t.date && t.description && t.amount)
        .slice(0, 500)
        .map((t: any) => ({
          statement_id: stmt.id,
          card_id: cardId,
          transaction_date: isValidDate(t.date) ? t.date : parsed.due_date,
          description: sanitizeString(t.description, 500),
          category: sanitizeString(t.category || "other", 50),
          transaction_type: ["debit", "credit", "fee", "interest", "payment", "refund", "emi", "cashback"].includes(t.type) ? t.type : "debit",
          amount: clampNumber(t.amount),
          merchant_name: sanitizeString(t.merchant || "", 200),
        }));

      if (txnRows.length > 0) {
        const { error: txnError } = await supabaseAdmin.from("cc_transactions").insert(txnRows);
        if (txnError) {
          console.error("Transaction insert error:", txnError.message);
        } else {
          txnCount = txnRows.length;
        }
      }
    }

    await supabaseAdmin.from("statement_uploads").update({
      status: "SUCCESS",
      error_message: null,
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
      transactions_extracted: txnCount,
    });
  } catch (error: any) {
    console.error("Unexpected error:", error?.message || error);
    if (upload_id && supabaseAdmin) {
      try {
        await failUpload(supabaseAdmin, upload_id, "Unexpected error: " + (error?.message || "Unknown"));
      } catch {
        // best effort
      }
    }
    return respond({ error: "Internal server error" }, 500);
  }
});
