// Central email seam. All app outbound email flows through sendEmail(...).
//
// Provider selection is controlled by EMAIL_PROVIDER (default: 'resend').
// The 'platform' branch is a stub for the queued email system — it requires
// registered React Email templates and therefore does NOT accept raw HTML.
// It is left in place so individual variants can be migrated one at a time
// (see send-transactional-email / _shared/transactional-email-templates).
//
// send-invoice-email pins provider: 'resend' permanently because the
// platform path does not support file attachments (PDF invoices).

export type EmailProvider = "platform" | "resend";

export interface EmailAttachment {
  filename: string;
  /** base64-encoded content */
  content: string;
}

export interface SendEmailArgs {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  replyTo?: string | string[];
  /** Override the unified From. Leave undefined to use DEFAULT_FROM. */
  from?: string;
  /** Override the env-selected provider. */
  provider?: EmailProvider;
  /** Optional CC/BCC pass-through. */
  cc?: string | string[];
  bcc?: string | string[];
}

export interface SendEmailResult {
  ok: boolean;
  status: number;
  provider: EmailProvider;
  id?: string;
  error?: string;
  raw?: unknown;
}

// Unified verified sender on the notify.xboomflow.com delegated subdomain.
export const DEFAULT_FROM =
  "Xboom <notifications@notify.xboomflow.com>";
export const DEFAULT_REPLY_TO = "support@xboom.in";

function resolveProvider(explicit?: EmailProvider): EmailProvider {
  if (explicit) return explicit;
  const env = (Deno.env.get("EMAIL_PROVIDER") || "").toLowerCase();
  return env === "platform" ? "platform" : "resend";
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const provider = resolveProvider(args.provider);
  const from = args.from ?? DEFAULT_FROM;
  const to = Array.isArray(args.to) ? args.to : [args.to];
  const replyTo = args.replyTo ?? DEFAULT_REPLY_TO;

  if (provider === "platform") {
    // Not yet supported — raw HTML pass-through requires a registered
    // React Email template on the queued platform. Migrate the variant to
    // supabase/functions/_shared/transactional-email-templates/ first.
    return {
      ok: false,
      status: 501,
      provider: "platform",
      error:
        "platform provider requires a registered template — migrate this variant to the transactional-email registry, then flip provider to 'platform'",
    };
  }

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    return {
      ok: false,
      status: 500,
      provider: "resend",
      error: "RESEND_API_KEY not configured",
    };
  }

  const body: Record<string, unknown> = {
    from,
    to,
    subject: args.subject,
    html: args.html,
    reply_to: replyTo,
  };
  if (args.cc) body.cc = Array.isArray(args.cc) ? args.cc : [args.cc];
  if (args.bcc) body.bcc = Array.isArray(args.bcc) ? args.bcc : [args.bcc];
  if (args.attachments && args.attachments.length) {
    body.attachments = args.attachments;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    let raw: any = null;
    try { raw = await res.json(); } catch { /* ignore */ }
    if (!res.ok) {
      const msg =
        (raw && (raw.message || raw.error)) || `HTTP ${res.status}`;
      return {
        ok: false,
        status: res.status,
        provider: "resend",
        error: String(msg).slice(0, 500),
        raw,
      };
    }
    return {
      ok: true,
      status: res.status,
      provider: "resend",
      id: raw?.id,
      raw,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      provider: "resend",
      error: err?.message || String(err),
    };
  }
}
