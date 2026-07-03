// KYC handler — multi-action endpoint for the KYC onboarding/verification flow.
// Actions:
//   onboard_order    — server-side, called after a new order is created. Creates a
//                      portal_account/contact (if customer has none) and sends a
//                      branded onboarding + KYC invite email. Idempotent.
//   submit           — portal customer. Persists Aadhaar number + uploaded doc and
//                      flips status to pending_verification. Notifies salesperson.
//   review           — staff (admin/finance/sales/sales_manager). Approves or
//                      rejects current KYC submission and emails the customer.
//
// Stays on the same Resend-based email pattern as portal-invite-customer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  EMAIL_RE,
  isDuplicate,
  sendWithRetry,
  type SendResult,
} from "./helpers.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// Kill switch for customer-facing KYC emails. Source of truth is the
// `feature_flags` row with key='kyc_customer_emails_enabled' (DB-backed
// so admins can toggle from the UI without redeploying). Falls back to
// the KYC_CUSTOMER_EMAILS_ENABLED env var if the row is missing.
async function isCustomerEmailsEnabled(admin: ReturnType<typeof createClient>): Promise<boolean> {
  try {
    const { data } = await admin
      .from("feature_flags")
      .select("enabled")
      .eq("key", "kyc_customer_emails_enabled")
      .maybeSingle();
    if (data && typeof (data as any).enabled === "boolean") return (data as any).enabled;
  } catch (e) {
    console.error("[kyc-handler] feature_flags read failed:", e);
  }
  return (Deno.env.get("KYC_CUSTOMER_EMAILS_ENABLED") ?? "false").toLowerCase() === "true";
}

// Wraps sendEmailOnce with the shared retry helper (3 attempts: 1s, 3s, 9s
// on HTTP 429 / 5xx / network throws — hard 4xx never retries).
async function sendEmailWithRetry(
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string; attempts: number }> {
  const outcome = await sendWithRetry(() => sendEmailOnce(to, subject, html) as Promise<SendResult>);
  return { ok: outcome.ok, error: outcome.error, attempts: outcome.attempt_count };
}
const FROM_ADDRESS = "Xboom <notifications@xboom.in>";
const PORTAL_BASE = "https://xboomflow.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function maskAadhaar(n: string) {
  if (!n || n.length !== 12) return "";
  return `XXXX XXXX ${n.slice(-4)}`;
}

function esc(s: string) {
  return (s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

async function sendEmailOnce(
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string; status?: number; network?: boolean }> {
  if (!RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY missing" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
    });
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        error: `Resend ${r.status}: ${(await r.text()).slice(0, 240)}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, network: true, error: (e as Error).message };
  }
}

// Back-compat wrapper used by staff notifications / status emails (no retry needed).
async function sendEmail(to: string, subject: string, html: string) {
  return await sendEmailOnce(to, subject, html);
}

async function logKycEmail(
  admin: ReturnType<typeof createClient>,
  row: {
    order_id?: string | null;
    order_number?: string | null;
    recipient_email?: string | null;
    status: "sent" | "failed" | "skipped" | "pending";
    error?: string | null;
    attempt_count?: number;
    sent_by?: string | null;
  },
) {
  try {
    await admin.from("kyc_email_log").insert({
      order_id: row.order_id ?? null,
      order_number: row.order_number ?? null,
      recipient_email: row.recipient_email ?? null,
      doc_type: "kyc_invite",
      status: row.status,
      error: row.error ?? null,
      attempt_count: row.attempt_count ?? 1,
      sent_by: row.sent_by ?? null,
    });
  } catch (e) {
    console.error("[kyc-handler] kyc_email_log insert failed:", e);
  }
}

function shell(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08);">
        <tr><td style="background:#0c1e3e;padding:22px 28px;">
          <div style="font-size:22px;font-weight:700;letter-spacing:.3px;color:#ffffff;">
            x<span style="color:#d4af37;">boom</span>
            <span style="font-size:11px;letter-spacing:1.5px;color:rgba(255,255,255,.7);margin-left:10px;text-transform:uppercase;">${esc(title)}</span>
          </div>
        </td></tr>
        <tr><td style="padding:28px;">${bodyHtml}</td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">XBOOM Flow · Customer Portal</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function btn(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:#0c1e3e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px;">${esc(label)}</a>`;
}

// ---------- Action handlers ----------

interface Body {
  action:
    | "onboard_order"
    | "submit"
    | "review"
    | "notify_salesperson"
    | "resend_invite"
    | "order_kyc_status";
  // onboard_order
  order_id?: string;
  // resend_invite
  override_email?: string;
  force?: boolean;
  // submit
  aadhaar_number?: string;
  file_path?: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  // review
  account_id?: string;
  document_id?: string;
  decision?: "approve" | "reject";
  reason?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Auth context (some actions require a user)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const userClient = token
    ? createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
    : null;
  const { data: userData } = userClient ? await userClient.auth.getUser() : { data: { user: null } as any };
  const callerId = userData?.user?.id as string | undefined;

  try {
    if (body.action === "onboard_order") {
      if (!callerId) return json({ error: "Not authenticated" }, 401);
      return await onboardOrder(admin, body.order_id!, { triggeredBy: callerId });
    }
    if (body.action === "resend_invite") {
      if (!callerId) return json({ error: "Not authenticated" }, 401);
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", callerId);
      const allowed = (roles || []).some((r: any) =>
        ["admin", "sales", "sales_manager"].includes(r.role),
      );
      if (!allowed) return json({ error: "Forbidden" }, 403);
      return await onboardOrder(admin, body.order_id!, {
        triggeredBy: callerId,
        force: true,
        overrideEmail: body.override_email,
      });
    }
    if (body.action === "order_kyc_status") {
      if (!callerId) return json({ error: "Not authenticated" }, 401);
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", callerId);
      const allowed = (roles || []).some((r: any) =>
        ["admin", "sales", "sales_manager"].includes(r.role),
      );
      if (!allowed) return json({ error: "Forbidden" }, 403);
      return await orderKycStatus(admin, body.order_id!);
    }
    if (body.action === "submit") {
      if (!callerId) return json({ error: "Not authenticated" }, 401);
      return await submitKyc(admin, callerId, body);
    }
    if (body.action === "review") {
      if (!callerId) return json({ error: "Not authenticated" }, 401);
      return await reviewKyc(admin, callerId, body);
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("kyc-handler error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

// ============ ONBOARDING ============
async function onboardOrder(
  admin: ReturnType<typeof createClient>,
  orderId: string,
  opts: { triggeredBy?: string | null; force?: boolean; overrideEmail?: string } = {},
) {
  if (!orderId) return json({ error: "order_id required" }, 400);
  // Hard kill-switch (DB-backed). When OFF: no portal_account, no auth
  // user, no portal_contact, no role, no email. Manual force from staff
  // still requires the flag to be on.
  const flagOn = await isCustomerEmailsEnabled(admin);
  if (!flagOn) {
    await logKycEmail(admin, {
      order_id: orderId,
      status: "skipped",
      error: "feature_disabled",
      sent_by: opts.triggeredBy ?? null,
    });
    return json({ skipped: true, reason: "feature_disabled" });
  }
  const { data: order, error } = await admin
    .from("orders")
    .select("id, order_number, customer_name, customer_email, customer_company, sales_person_id, sales_person_name, source, confirmation_status, requires_confirmation")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!order) return json({ error: "Order not found" }, 404);

  const email = ((opts.overrideEmail ?? order.customer_email) || "").trim().toLowerCase();
  if (!email) {
    await logKycEmail(admin, {
      order_id: order.id,
      order_number: order.order_number,
      status: "skipped",
      error: "no_customer_email",
      sent_by: opts.triggeredBy ?? null,
    });
    return json({ skipped: true, reason: "no_customer_email" });
  }
  if (!EMAIL_RE.test(email)) {
    await logKycEmail(admin, {
      order_id: order.id,
      order_number: order.order_number,
      recipient_email: email,
      status: "skipped",
      error: "invalid_email",
      sent_by: opts.triggeredBy ?? null,
    });
    return json({ skipped: true, reason: "invalid_email" });
  }

  // Idempotency: if we've already sent a KYC invite for this order, don't
  // auto-send again. Manual resend (force=true) bypasses this guard.
  if (!opts.force) {
    const { data: prev } = await admin
      .from("kyc_email_log")
      .select("status")
      .eq("order_id", order.id)
      .eq("status", "sent")
      .limit(1);
    if (isDuplicate(prev as Array<{ status?: string | null }> | null)) {
      return json({ skipped: true, reason: "already_sent" });
    }
  }

  // Only send onboarding/KYC email for drone orders, not for pure
  // Drone Components orders. If every line item on the order is in the
  // "Drone Components" category, skip the email entirely.
  const { data: items } = await admin
    .from("order_items")
    .select("product_category")
    .eq("order_id", order.id);
  if (items && items.length > 0) {
    const allComponents = items.every(
      (it: any) => (it.product_category || "").trim().toLowerCase() === "drone components",
    );
    if (allComponents) {
      await logKycEmail(admin, {
        order_id: order.id,
        order_number: order.order_number,
        recipient_email: email,
        status: "skipped",
        error: "drone_components_only",
        sent_by: opts.triggeredBy ?? null,
      });
      return json({ skipped: true, reason: "drone_components_only" });
    }
  }

  // Skip if customer already has a portal account
  const { data: existingContact } = await admin
    .from("portal_contacts")
    .select("id, account_id, auth_user_id")
    .ilike("email", email)
    .maybeSingle();
  let acctId: string | null = existingContact?.account_id ?? null;
  let authUserId: string | null = existingContact?.auth_user_id ?? null;
  const reusingExisting = !!(existingContact?.auth_user_id);

  if (!reusingExisting) {
  // Pick a salesperson: existing on the order, else round-robin random active sales user
  let assignedRepId: string | null = order.sales_person_id;
  if (!assignedRepId) {
    const { data: salesUsers } = await admin
      .from("user_roles")
      .select("user_id")
      .in("role", ["sales", "sales_manager"]);
    if (salesUsers && salesUsers.length) {
      assignedRepId = salesUsers[Math.floor(Math.random() * salesUsers.length)].user_id;
      await admin
        .from("orders")
        .update({ sales_person_id: assignedRepId })
        .eq("id", order.id);
    }
  }

  // Create portal_account
  const { data: acct, error: acctErr } = await admin
    .from("portal_accounts")
    .insert({
      company_name: order.customer_company || order.customer_name || "Customer",
      primary_contact_name: order.customer_name || null,
      assigned_rep_id: assignedRepId,
      status: "active",
    })
    .select("id")
    .single();
  if (acctErr) return json({ error: `account create failed: ${acctErr.message}` }, 500);
  acctId = acct.id;

  // Create or find auth user
  const tempPassword = crypto.randomUUID().slice(0, 16) + "Aa1!";
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: order.customer_name, portal: true },
  });
  if (createErr && /already.*registered|already exists/i.test(createErr.message)) {
    let page = 1;
    while (!authUserId) {
      const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 100 });
      const found = list?.users?.find((u: any) => u.email?.toLowerCase() === email);
      if (found) { authUserId = found.id; break; }
      if (!list?.users || list.users.length < 100) break;
      page++;
    }
  } else if (createErr) {
    return json({ error: `user create failed: ${createErr.message}` }, 500);
  } else {
    authUserId = created!.user.id;
  }
  if (!authUserId) return json({ error: "could not resolve user" }, 500);
  } // end !reusingExisting

  if (!authUserId || !acctId) return json({ error: "could not resolve user/account" }, 500);

  // Non-consuming invite link → /portal/activate. We mint our own token
  // (NOT Supabase's single-use recovery token_hash) so email scanners /
  // link previews can hit the URL without burning the one-time credential.
  const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: inviteRow, error: inviteErr } = await admin
    .from("portal_invite_tokens")
    .insert({
      auth_user_id: authUserId,
      email,
      account_id: acctId,
      expires_at: inviteExpiresAt,
    })
    .select("token")
    .single();
  if (inviteErr) return json({ error: `invite token create failed: ${inviteErr.message}` }, 500);
  const setupLink = `${PORTAL_BASE}/portal/activate?invite=${encodeURIComponent(
    (inviteRow as { token: string }).token,
  )}`;

  if (!reusingExisting) {
    // portal_contact
    await admin.from("portal_contacts").insert({
      account_id: acctId,
      auth_user_id: authUserId,
      full_name: order.customer_name || email.split("@")[0],
      email,
      role: "admin",
      is_active: true,
      invited_at: new Date().toISOString(),
    });

    // b2b_customer role + notif prefs
    await admin.from("user_roles").upsert(
      { user_id: authUserId, role: "b2b_customer" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
  }

  // Onboarding + KYC email
  const kycLink = `${PORTAL_BASE}/portal/kyc`;
  const confirmLink = `${PORTAL_BASE}/portal/confirm`;
  const needsConfirmation =
    (order as any).confirmation_status === "pending" ||
    ((order as any).requires_confirmation === true &&
      (order as any).confirmation_status !== "confirmed");

  const stepsHtml = needsConfirmation
    ? `<ol style="margin:0;padding-left:18px;font-size:14px;color:#334155;line-height:1.7;">
         <li>Set your password using the button below.</li>
         <li>Complete mandatory KYC (Aadhaar) verification.</li>
         <li>Confirm your order at <a href="${confirmLink}" style="color:#0f172a;text-decoration:underline;">${confirmLink}</a>.</li>
       </ol>
       <p style="margin:10px 0 0;font-size:13px;color:#b45309;">
         KYC completion and order confirmation are required before we start processing your order.
       </p>`
    : `<ol style="margin:0;padding-left:18px;font-size:14px;color:#334155;line-height:1.7;">
         <li>Set your password using the button below.</li>
         <li>Sign in and head to <strong>KYC Verification</strong>.</li>
         <li>Enter your 12-digit Aadhaar number and upload your Aadhaar card.</li>
       </ol>`;

  const confirmButtonHtml = needsConfirmation
    ? `<p style="margin:0 0 22px;">${btn(confirmLink, "Confirm my order")}</p>`
    : "";

  const html = shell(
    "Customer Portal",
    `<h1 style="margin:0 0 12px;font-size:22px;color:#0f172a;">Thank you for your order, ${esc(order.customer_name || "")}!</h1>
     <p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.55;">
       We've received your order <strong>${esc(order.order_number || "")}</strong>. Welcome aboard — your XBOOM Customer Portal is ready.
     </p>
     <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.55;">
       Before we begin processing, please complete a quick KYC by uploading your Aadhaar card. This usually takes under a minute.
     </p>
     <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;margin:0 0 22px;">
       <p style="margin:0 0 10px;font-weight:600;color:#0f172a;font-size:14px;">Getting started</p>
       ${stepsHtml}
     </div>
     <p style="margin:0 0 14px;">${btn(setupLink, "Set my password")}</p>
     <p style="margin:0 0 22px;">${btn(kycLink, "Upload KYC documents")}</p>
     ${confirmButtonHtml}
     <p style="margin:0;font-size:12px;color:#94a3b8;">Order processing may require KYC approval. If you have questions, just reply to this email.</p>`,
  );

  const sendRes = await sendEmailWithRetry(
    email,
    "Welcome to XBOOM — set up your portal & complete KYC",
    html,
  );

  await logKycEmail(admin, {
    order_id: order.id,
    order_number: order.order_number,
    recipient_email: email,
    status: sendRes.ok ? "sent" : "failed",
    error: sendRes.ok ? null : sendRes.error,
    attempt_count: sendRes.attempts,
    sent_by: opts.triggeredBy ?? null,
  });

  // If this onboarding email also carried the order-confirmation ask, log it
  // against order_notifications so the customer-comms audit trail is complete
  // and downstream code doesn't send a duplicate confirmation email.
  if (needsConfirmation) {
    try {
      await admin.from("order_notifications").insert({
        order_ref: order.id,
        order_source: "internal",
        order_number: order.order_number,
        status_trigger: "confirmation_request",
        channel: "email",
        template_name: "confirmation_request_email",
        payload: {
          customer_name: order.customer_name,
          order_number: order.order_number,
          link: confirmLink,
          delivered_via: "onboarding_email",
        },
        status: sendRes.ok ? "sent" : "failed",
        sent_at: sendRes.ok ? new Date().toISOString() : null,
        error_message: sendRes.ok ? null : sendRes.error,
        provider: "resend",
      });
    } catch (logErr) {
      console.error("[kyc-handler] order_notifications log failed", logErr);
    }
  }

  await admin.from("kyc_audit_log").insert({
    account_id: acctId,
    action: "onboarding_email_sent",
    actor_role: opts.triggeredBy ? "staff" : "system",
    actor_id: opts.triggeredBy ?? null,
    notes: sendRes.ok ? null : sendRes.error,
    metadata: {
      order_id: order.id,
      order_number: order.order_number,
      attempts: sendRes.attempts,
      reused_existing: reusingExisting,
      forced: !!opts.force,
    },
  });

  return json({
    ok: true,
    account_id: acctId,
    email_sent: sendRes.ok,
    email_error: sendRes.error,
    attempts: sendRes.attempts,
  });
}

// ============ SUBMIT (customer) ============
async function submitKyc(admin: ReturnType<typeof createClient>, callerId: string, body: Body) {
  const aadhaar = (body.aadhaar_number || "").replace(/\s+/g, "");
  if (!/^\d{12}$/.test(aadhaar)) return json({ error: "Aadhaar must be exactly 12 digits" }, 400);
  if (!body.file_path || !body.file_name || !body.file_size) {
    return json({ error: "file_path, file_name, file_size required" }, 400);
  }
  if (body.file_size > 10 * 1024 * 1024) return json({ error: "File exceeds 10MB" }, 400);
  const allowedMimes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
  if (body.mime_type && !allowedMimes.includes(body.mime_type)) {
    return json({ error: "Only PDF/JPG/JPEG/PNG allowed" }, 400);
  }

  // Resolve account from caller
  const { data: contact } = await admin
    .from("portal_contacts")
    .select("account_id, full_name, email")
    .eq("auth_user_id", callerId)
    .eq("is_active", true)
    .maybeSingle();
  if (!contact?.account_id) return json({ error: "No portal account for this user" }, 403);

  // Mark previous current docs as non-current
  await admin
    .from("kyc_documents")
    .update({ is_current: false })
    .eq("account_id", contact.account_id)
    .eq("doc_type", "aadhaar")
    .eq("is_current", true);

  const { data: prevCount } = await admin
    .from("kyc_documents")
    .select("id", { count: "exact", head: true })
    .eq("account_id", contact.account_id)
    .eq("doc_type", "aadhaar");

  const { data: doc, error: docErr } = await admin
    .from("kyc_documents")
    .insert({
      account_id: contact.account_id,
      doc_type: "aadhaar",
      file_path: body.file_path,
      file_name: body.file_name,
      file_size_bytes: body.file_size,
      mime_type: body.mime_type || null,
      status: "pending_verification",
      uploaded_by: callerId,
      version: ((prevCount as any) ?? 0) + 1 || 1,
    })
    .select("id")
    .single();
  if (docErr) return json({ error: docErr.message }, 500);

  await admin.from("kyc_sensitive_data").insert({
    account_id: contact.account_id,
    document_id: doc.id,
    aadhaar_full: aadhaar,
  });

  await admin
    .from("portal_accounts")
    .update({
      kyc_status: "pending_verification",
      aadhaar_last4: aadhaar.slice(-4),
      kyc_submitted_at: new Date().toISOString(),
      kyc_rejection_reason: null,
    })
    .eq("id", contact.account_id);

  await admin.from("kyc_audit_log").insert({
    account_id: contact.account_id,
    document_id: doc.id,
    action: "submitted",
    actor_id: callerId,
    actor_role: "customer",
    metadata: { aadhaar_last4: aadhaar.slice(-4), version: doc.id ? undefined : undefined },
  });

  // Notify salesperson (assigned rep on account → fallback to latest order's sales_person)
  await notifySalesperson(admin, contact.account_id, doc.id);

  return json({ ok: true, document_id: doc.id });
}

async function notifySalesperson(
  admin: ReturnType<typeof createClient>,
  accountId: string,
  documentId: string,
) {
  const { data: acct } = await admin
    .from("portal_accounts")
    .select("id, company_name, primary_contact_name, assigned_rep_id, aadhaar_last4")
    .eq("id", accountId)
    .maybeSingle();
  if (!acct) return;

  let repId = acct.assigned_rep_id as string | null;

  // Find latest order matching by company name or contact email — used for context
  const { data: contact } = await admin
    .from("portal_contacts")
    .select("email")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const email = contact?.email;
  const { data: latestOrder } = email
    ? await admin
        .from("orders")
        .select("id, order_number, sales_person_id")
        .ilike("customer_email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null as any };

  if (!repId && latestOrder?.sales_person_id) repId = latestOrder.sales_person_id;

  if (!repId) return;

  const { data: prof } = await admin
    .from("profiles")
    .select("email, name")
    .eq("user_id", repId)
    .maybeSingle();
  if (!prof?.email) return;

  const reviewLink = `${PORTAL_BASE}/kyc?account=${accountId}`;
  const html = shell(
    "KYC Review",
    `<h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">KYC submitted — review needed</h1>
     <p style="margin:0 0 8px;font-size:14px;color:#334155;">A customer just uploaded their Aadhaar card for KYC.</p>
     <table style="margin:14px 0 20px;border-collapse:collapse;font-size:14px;color:#0f172a;">
       <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Customer</td><td style="padding:4px 0;font-weight:600;">${esc(acct.primary_contact_name || acct.company_name || "")}</td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Company</td><td style="padding:4px 0;">${esc(acct.company_name || "")}</td></tr>
       ${latestOrder?.order_number ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">Order</td><td style="padding:4px 0;font-weight:600;">${esc(latestOrder.order_number)}</td></tr>` : ""}
       <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Uploaded</td><td style="padding:4px 0;">${new Date().toLocaleString("en-IN")}</td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Aadhaar</td><td style="padding:4px 0;">XXXX XXXX ${esc(acct.aadhaar_last4 || "")}</td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Status</td><td style="padding:4px 0;color:#b45309;font-weight:600;">Pending Verification</td></tr>
     </table>
     <p style="margin:0;">${btn(reviewLink, "Review KYC")}</p>`,
  );
  await sendEmail(prof.email, "KYC awaiting your review", html);

  await admin.from("kyc_audit_log").insert({
    account_id: accountId,
    document_id: documentId,
    action: "salesperson_notified",
    actor_role: "system",
    metadata: { rep_id: repId, rep_email: prof.email },
  });
}

// ============ REVIEW (staff) ============
async function reviewKyc(admin: ReturnType<typeof createClient>, callerId: string, body: Body) {
  if (!body.account_id || !body.document_id || !body.decision) {
    return json({ error: "account_id, document_id, decision required" }, 400);
  }
  // Role check
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", callerId);
  const allowed = (roles || []).some((r: any) =>
    ["admin", "finance", "sales", "sales_manager"].includes(r.role),
  );
  if (!allowed) return json({ error: "Forbidden" }, 403);

  const reviewedAt = new Date().toISOString();
  if (body.decision === "approve") {
    await admin
      .from("kyc_documents")
      .update({ status: "approved", reviewed_by: callerId, reviewed_at: reviewedAt, rejection_reason: null })
      .eq("id", body.document_id);
    await admin
      .from("portal_accounts")
      .update({
        kyc_status: "approved",
        kyc_reviewed_at: reviewedAt,
        kyc_reviewed_by: callerId,
        kyc_rejection_reason: null,
      })
      .eq("id", body.account_id);
    await admin.from("kyc_audit_log").insert({
      account_id: body.account_id,
      document_id: body.document_id,
      action: "approved",
      actor_id: callerId,
      actor_role: "staff",
    });
    await emailCustomerStatus(admin, body.account_id, "approved");
    return json({ ok: true });
  }

  if (body.decision === "reject") {
    const reason = (body.reason || "").trim();
    if (!reason) return json({ error: "Rejection reason required" }, 400);
    await admin
      .from("kyc_documents")
      .update({ status: "rejected", reviewed_by: callerId, reviewed_at: reviewedAt, rejection_reason: reason })
      .eq("id", body.document_id);
    await admin
      .from("portal_accounts")
      .update({
        kyc_status: "resubmission_required",
        kyc_reviewed_at: reviewedAt,
        kyc_reviewed_by: callerId,
        kyc_rejection_reason: reason,
      })
      .eq("id", body.account_id);
    await admin.from("kyc_audit_log").insert({
      account_id: body.account_id,
      document_id: body.document_id,
      action: "rejected",
      actor_id: callerId,
      actor_role: "staff",
      notes: reason,
    });
    await emailCustomerStatus(admin, body.account_id, "rejected", reason);
    return json({ ok: true });
  }

  return json({ error: "Invalid decision" }, 400);
}

async function emailCustomerStatus(
  admin: ReturnType<typeof createClient>,
  accountId: string,
  decision: "approved" | "rejected",
  reason?: string,
) {
  const { data: c } = await admin
    .from("portal_contacts")
    .select("email, full_name")
    .eq("account_id", accountId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!c?.email) return;
  const portalLink = `${PORTAL_BASE}/portal/kyc`;
  const html =
    decision === "approved"
      ? shell(
          "KYC Approved",
          `<h1 style="margin:0 0 12px;font-size:22px;color:#0f172a;">✅ Your KYC has been approved</h1>
           <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.55;">Hi ${esc(c.full_name || "")}, your KYC verification is complete. Your orders will continue to be processed normally — no further action needed.</p>
           <p style="margin:0 0 0;">${btn(portalLink, "View in portal")}</p>`,
        )
      : shell(
          "KYC Rejected",
          `<h1 style="margin:0 0 12px;font-size:22px;color:#0f172a;">Action needed: KYC was rejected</h1>
           <p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.55;">Hi ${esc(c.full_name || "")}, your KYC submission could not be approved.</p>
           <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;margin:0 0 18px;color:#7f1d1d;font-size:14px;">
             <strong>Reason:</strong> ${esc(reason || "")}
           </div>
           <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.55;">Please re-upload your Aadhaar card from the portal so we can review again.</p>
           <p style="margin:0;">${btn(portalLink, "Re-upload KYC")}</p>`,
        );
  // Approve/reject emails are also customer-facing — respect the kill switch.
  if (!(await isCustomerEmailsEnabled(admin))) {
    console.log("[kyc-handler] status email suppressed (kill switch)", { to: c.email });
    return;
  }
  await sendEmail(
    c.email,
    decision === "approved" ? "Your KYC has been approved" : "Action needed: KYC was rejected",
    html,
  );
}

// ============ ORDER KYC STATUS (read-only) ============
async function orderKycStatus(
  admin: ReturnType<typeof createClient>,
  orderId: string,
) {
  if (!orderId) return json({ error: "order_id required" }, 400);
  const { data: order } = await admin
    .from("orders")
    .select("id, customer_email")
    .eq("id", orderId)
    .maybeSingle();
  const customerEmail =
    ((order as any)?.customer_email || "").toString().trim().toLowerCase() || null;

  let kycStatus: string | null = null;
  let hasPortalAccount = false;
  if (customerEmail) {
    const { data: contact } = await admin
      .from("portal_contacts")
      .select("account_id")
      .ilike("email", customerEmail)
      .maybeSingle();
    if ((contact as any)?.account_id) {
      hasPortalAccount = true;
      const { data: acct } = await admin
        .from("portal_accounts")
        .select("kyc_status")
        .eq("id", (contact as any).account_id)
        .maybeSingle();
      kycStatus = ((acct as any)?.kyc_status as string) ?? "not_submitted";
    }
  }

  const { data: lastLog } = await admin
    .from("kyc_email_log")
    .select("status, created_at, attempt_count")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return json({
    kyc_status: kycStatus,
    has_portal_account: hasPortalAccount,
    customer_email: customerEmail,
    last_invite: lastLog ?? null,
  });
}