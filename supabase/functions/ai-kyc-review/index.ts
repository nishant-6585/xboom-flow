// AI-assisted KYC review for MANUAL uploads (DigiLocker path is untouched — it is
// already government-verified). This function is fire-and-forget: kyc-handler
// invokes it after a manual submission is stored. The customer sees
// "under review" and it updates via realtime as this function writes.
//
// Flow:
//   1. Load the doc + expected name (portal_accounts.primary_contact_name
//      or latest order's customer_name — same as DigiLocker).
//   2. Download the file from storage; if it's a PDF, send as file part,
//      else as image_url. For Aadhaar, we ONLY ask for the holder name +
//      confirm document type — we do NOT ask the AI to extract the number
//      (see the caveat block in this file / in the review UI).
//   3. Extract structured JSON via Lovable AI Gateway (vision model).
//   4. Compare with matchNames + doc-number equality + declared type.
//   5. Hybrid decision:
//        - AUTO-APPROVE only when ALL green (see thresholds below).
//        - ELSE stay pending_verification and attach analysis for staff.
//        - NEVER hard auto-reject.
//   6. Respect sticky-approved (never downgrade an already-approved acct).

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { matchNames } from "../_shared/name-match.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const MODEL = "google/gemini-2.5-flash";
const NAME_MATCH_THRESHOLD = 0.85;
const AI_CONFIDENCE_THRESHOLD = 0.85;
const KYC_BUCKET = "kyc-documents";

type Decision = "auto_approved" | "pending" | "error";
type Recommendation = "likely_approve" | "likely_reject" | "unclear";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function maskNumber(n: string | null | undefined): string | null {
  if (!n) return null;
  const digits = n.replace(/\s|-/g, "");
  if (digits.length <= 4) return `****${digits}`;
  return `****${digits.slice(-4)}`;
}

function normalizeDeclaredType(t: string | null | undefined): string {
  return (t || "").toLowerCase().trim();
}

// Map free-text "document_type" back to our canonical enum.
function canonicalDocType(t: string | null | undefined): string | null {
  const raw = (t || "").toLowerCase().trim();
  if (!raw) return null;
  if (/aadhaar|aadhar|uidai/.test(raw)) return "aadhaar";
  if (/\bpan\b|permanent account/.test(raw)) return "pan";
  if (/driving|licen[cs]e|dl\b/.test(raw)) return "driving_license";
  if (/voter|epic|election/.test(raw)) return "voter_id";
  if (/passport/.test(raw)) return "passport";
  if (/rental|lease|agreement/.test(raw)) return "rental_agreement";
  return "other_gov_id";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Only accept service-role invocations (this is triggered internally by
  // kyc-handler). No user-JWT callers.
  const authHeader = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (authHeader !== SERVICE_KEY) return json({ error: "Unauthorized" }, 401);

  let body: { document_id?: string; account_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const documentId = body.document_id;
  const accountId = body.account_id;
  if (!documentId || !accountId) return json({ error: "document_id and account_id required" }, 400);

  try {
    return await runReview(admin, accountId, documentId);
  } catch (e) {
    console.error("[ai-kyc-review] fatal", e);
    await admin.from("ai_kyc_reviews").insert({
      account_id: accountId,
      document_id: documentId,
      decision: "error",
      recommendation: "unclear",
      flags: ["exception"],
      error: (e as Error).message,
      model: MODEL,
    });
    return json({ error: (e as Error).message }, 500);
  }
});

async function runReview(
  admin: ReturnType<typeof createClient>,
  accountId: string,
  documentId: string,
) {
  // Load doc + declared reference (from kyc_sensitive_data — service-role only).
  const [{ data: doc }, { data: sens }, { data: acct }] = await Promise.all([
    admin
      .from("kyc_documents")
      .select("id, account_id, doc_type, file_path, file_name, mime_type, status, method")
      .eq("id", documentId)
      .maybeSingle(),
    admin
      .from("kyc_sensitive_data")
      .select("aadhaar_full, document_reference")
      .eq("document_id", documentId)
      .maybeSingle(),
    admin
      .from("portal_accounts")
      .select("id, primary_contact_name, kyc_status")
      .eq("id", accountId)
      .maybeSingle(),
  ]);
  if (!doc) return json({ error: "document not found" }, 404);
  if (!acct) return json({ error: "account not found" }, 404);

  // Respect sticky-approved.
  if ((acct as any).kyc_status === "approved") {
    console.log("[ai-kyc-review] sticky approved — skipping AI review", { accountId });
    return json({ skipped: "already_approved" });
  }

  // DigiLocker path: skip. This function is for manual uploads only.
  if ((doc as any).method === "digilocker") {
    return json({ skipped: "digilocker_path" });
  }

  const declaredType = normalizeDeclaredType((doc as any).doc_type);
  const isAadhaar = declaredType === "aadhaar";
  const declaredNumberRaw: string | null =
    (isAadhaar ? (sens as any)?.aadhaar_full : (sens as any)?.document_reference) || null;

  // Fall back to primary_contact_name — same target DigiLocker matches.
  let expectedName: string | null = ((acct as any).primary_contact_name || "").trim() || null;
  if (!expectedName) {
    // Try latest order's customer_name via the account's contact email.
    const { data: contact } = await admin
      .from("portal_contacts")
      .select("email")
      .eq("account_id", accountId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if ((contact as any)?.email) {
      const { data: latestOrder } = await admin
        .from("orders")
        .select("customer_name")
        .ilike("customer_email", (contact as any).email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if ((latestOrder as any)?.customer_name) expectedName = (latestOrder as any).customer_name;
    }
  }

  if (!LOVABLE_API_KEY) {
    await admin.from("ai_kyc_reviews").insert({
      account_id: accountId,
      document_id: documentId,
      declared_doc_type: declaredType,
      declared_number_masked: maskNumber(declaredNumberRaw),
      expected_name: expectedName,
      decision: "error",
      recommendation: "unclear",
      flags: ["missing_lovable_api_key"],
      error: "LOVABLE_API_KEY not configured",
      model: MODEL,
    });
    return json({ error: "LOVABLE_API_KEY not configured" }, 500);
  }

  // Download the file and inline it as base64.
  const { data: file, error: dlErr } = await admin.storage.from(KYC_BUCKET).download((doc as any).file_path);
  if (dlErr || !file) {
    throw new Error(`file download failed: ${dlErr?.message || "unknown"}`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = (doc as any).mime_type || file.type || "application/octet-stream";
  const base64 = base64Encode(bytes);

  const prompt = buildPrompt(isAadhaar, declaredType);

  // Vision content blocks — image_url for images, file for PDFs.
  const contentBlocks: any[] = [{ type: "text", text: prompt }];
  if (mime === "application/pdf") {
    contentBlocks.push({
      type: "file",
      file: {
        filename: (doc as any).file_name || "kyc.pdf",
        file_data: `data:application/pdf;base64,${base64}`,
      },
    });
  } else {
    contentBlocks.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${base64}` },
    });
  }

  const gatewayRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a KYC document analyst. Return ONLY strict JSON — no prose, no markdown fences. " +
            "If you cannot read a field, use null. Be honest about legibility.",
        },
        { role: "user", content: contentBlocks },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!gatewayRes.ok) {
    const errText = await gatewayRes.text();
    throw new Error(`AI gateway ${gatewayRes.status}: ${errText.slice(0, 400)}`);
  }
  const gatewayJson = await gatewayRes.json();
  const rawText: string = gatewayJson?.choices?.[0]?.message?.content ?? "";
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Strip potential fences.
    const stripped = rawText.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    try { parsed = JSON.parse(stripped); } catch { parsed = null; }
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI returned non-JSON response");
  }

  // Normalize AI output.
  const aiHolderName: string | null = (parsed.holder_name || parsed.name || null)?.toString().trim() || null;
  const aiDocTypeRaw: string | null = (parsed.document_type || parsed.doc_type || null)?.toString() || null;
  const aiDocType = canonicalDocType(aiDocTypeRaw);
  const aiNumberRaw: string | null =
    (parsed.document_number || parsed.number || null)?.toString().replace(/\s|-/g, "") || null;
  const legibility = (parsed.legibility || "").toString().toLowerCase();
  const legOk = legibility === "good" || legibility === "clear" || legibility === "readable";
  const aiConfidence = typeof parsed.confidence === "number" ? parsed.confidence : Number(parsed.confidence) || 0;

  // Compare fields.
  const nameCmp = matchNames(aiHolderName, expectedName, NAME_MATCH_THRESHOLD);
  const numberMatch = isAadhaar
    ? true // Aadhaar: name-only, don't check number (we don't ask AI for it).
    : Boolean(aiNumberRaw && declaredNumberRaw && aiNumberRaw.toLowerCase() === declaredNumberRaw.replace(/\s|-/g, "").toLowerCase());
  const typeMatch = Boolean(aiDocType && declaredType && aiDocType === declaredType);

  const flags: string[] = [];
  if (!legOk) flags.push("poor_image");
  if (!typeMatch) flags.push("type_mismatch");
  if (!nameCmp.matches) flags.push("name_mismatch");
  if (!isAadhaar && !numberMatch) flags.push("number_mismatch");
  if (aiConfidence < AI_CONFIDENCE_THRESHOLD) flags.push("low_confidence");

  const allGreen =
    nameCmp.score >= NAME_MATCH_THRESHOLD &&
    numberMatch &&
    typeMatch &&
    legOk &&
    aiConfidence >= AI_CONFIDENCE_THRESHOLD;

  let recommendation: Recommendation;
  if (allGreen) recommendation = "likely_approve";
  else if (flags.includes("name_mismatch") || flags.includes("type_mismatch") || flags.includes("number_mismatch"))
    recommendation = "likely_reject";
  else recommendation = "unclear";

  let decision: Decision = "pending";
  if (allGreen) decision = "auto_approved";

  // Persist AI review row. Mask any number the AI returned before storing.
  const { data: reviewRow } = await admin
    .from("ai_kyc_reviews")
    .insert({
      account_id: accountId,
      document_id: documentId,
      extracted_doc_type: aiDocType,
      extracted_holder_name: aiHolderName,
      extracted_number_masked: isAadhaar ? null : maskNumber(aiNumberRaw),
      declared_doc_type: declaredType,
      declared_number_masked: maskNumber(declaredNumberRaw),
      expected_name: expectedName,
      name_match_score: Number(nameCmp.score.toFixed(3)),
      number_match: numberMatch,
      type_match: typeMatch,
      legibility: legOk ? "good" : "poor",
      ai_confidence: Number.isFinite(aiConfidence) ? Number(aiConfidence.toFixed(3)) : 0,
      recommendation,
      decision,
      flags,
      model: MODEL,
      raw_response: { ai: parsed },
    })
    .select("id")
    .single();

  // Auto-approve path.
  if (allGreen) {
    const reviewedAt = new Date().toISOString();
    await admin
      .from("kyc_documents")
      .update({ status: "approved", reviewed_at: reviewedAt, rejection_reason: null })
      .eq("id", documentId);
    await admin
      .from("portal_accounts")
      .update({
        kyc_status: "approved",
        kyc_reviewed_at: reviewedAt,
        kyc_rejection_reason: null,
      })
      .eq("id", accountId);
    await admin.from("kyc_audit_log").insert({
      account_id: accountId,
      document_id: documentId,
      action: "approved",
      actor_role: "ai",
      notes: `Auto-approved by AI (name ${nameCmp.score.toFixed(2)}, conf ${aiConfidence.toFixed(2)})`,
      metadata: {
        ai_review_id: (reviewRow as any)?.id ?? null,
        model: MODEL,
        extracted_holder_name: aiHolderName,
        expected_name: expectedName,
        name_match_score: nameCmp.score,
        number_match: numberMatch,
        type_match: typeMatch,
        legibility,
        ai_confidence: aiConfidence,
      },
    });
  } else {
    // Do NOT hard reject. Just log that AI reviewed and the row is queued.
    await admin.from("kyc_audit_log").insert({
      account_id: accountId,
      document_id: documentId,
      action: "ai_reviewed",
      actor_role: "ai",
      notes: `AI recommendation: ${recommendation}. Flags: ${flags.join(", ") || "none"}`,
      metadata: {
        ai_review_id: (reviewRow as any)?.id ?? null,
        model: MODEL,
        name_match_score: nameCmp.score,
        number_match: numberMatch,
        type_match: typeMatch,
        legibility,
        ai_confidence: aiConfidence,
        flags,
      },
    });
  }

  return json({
    ok: true,
    decision,
    recommendation,
    flags,
    name_match_score: nameCmp.score,
    ai_confidence: aiConfidence,
  });
}

function buildPrompt(isAadhaar: boolean, declaredType: string) {
  const aadhaarNote = isAadhaar
    ? "This document is an Indian Aadhaar card. For privacy, do NOT return the 12-digit Aadhaar number — set document_number to null. Only extract the holder's name and confirm the document type."
    : "";
  return [
    `The customer declared this document as: "${declaredType || "unknown"}".`,
    aadhaarNote,
    "Extract the following as strict JSON with EXACTLY these keys:",
    "{",
    '  "document_type": string (e.g. "aadhaar", "pan", "driving_license", "voter_id", "passport", "rental_agreement", "other_gov_id") or null,',
    '  "holder_name": string (as printed) or null,',
    '  "document_number": string (no spaces or dashes) or null,',
    '  "legibility": "good" | "poor",',
    '  "confidence": number between 0 and 1 (your overall confidence)',
    "}",
    "Rules:",
    "- Return ONLY the JSON object. No markdown, no code fences, no commentary.",
    "- If the image is blurry / cropped / dark / unreadable, set legibility='poor' and lower confidence.",
    "- If a field cannot be read, use null (never guess).",
  ].filter(Boolean).join("\n");
}

// Fast base64 encoder for Uint8Array.
function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}