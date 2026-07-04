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
  /**
   * Platform-only: name of a template registered in
   * `_shared/transactional-email-templates/registry.ts`. Required when
   * `provider === 'platform'`. Ignored by the Resend branch.
   */
  templateName?: string;
  /** Platform-only: props passed to the React Email component. */
  templateData?: Record<string, unknown>;
  /**
   * Stable idempotency key for de-duping enqueues. Used by the platform
   * branch; safe to pass on Resend calls (ignored).
   */
  idempotencyKey?: string;
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
    // Platform (queued) branch: template is pre-rendered by
    // `send-transactional-email` and enqueued in pgmq. Raw `html` is NOT
    // used by the platform — the caller must supply a registered
    // `templateName` + `templateData`. `subject` in `args` is ignored
    // (the template controls its own subject).
    if (!args.templateName) {
      return {
        ok: false,
        status: 400,
        provider: "platform",
        error:
          "platform provider requires `templateName` (a registered React Email template) — raw HTML is not supported",
      };
    }
    if (args.attachments && args.attachments.length) {
      return {
        ok: false,
        status: 400,
        provider: "platform",
        error:
          "platform provider does not support attachments — pin this send to provider: 'resend'",
      };
    }
    const url = Deno.env.get("SUPABASE_URL");
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !svc) {
      return {
        ok: false,
        status: 500,
        provider: "platform",
        error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured",
      };
    }
    // Platform templates that don't fix `to` use the first recipient.
    const recipient = Array.isArray(args.to) ? args.to[0] : args.to;
    try {
      const res = await fetch(`${url}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${svc}`,
          apikey: svc,
        },
        body: JSON.stringify({
          templateName: args.templateName,
          recipientEmail: recipient,
          idempotencyKey: args.idempotencyKey,
          templateData: args.templateData ?? {},
        }),
      });
      let raw: any = null;
      try { raw = await res.json(); } catch { /* ignore */ }
      if (!res.ok) {
        const msg =
          (raw && (raw.error || raw.message)) || `HTTP ${res.status}`;
        return {
          ok: false,
          status: res.status,
          provider: "platform",
          error: String(msg).slice(0, 500),
          raw,
        };
      }
      return {
        ok: true,
        status: res.status,
        provider: "platform",
        raw,
      };
    } catch (err: any) {
      return {
        ok: false,
        status: 0,
        provider: "platform",
        error: err?.message || String(err),
      };
    }
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
