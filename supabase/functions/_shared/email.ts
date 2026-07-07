// Central email seam. All app outbound email flows through sendEmail(...).
//
// Provider selection is controlled by EMAIL_PROVIDER (default: 'platform').
// All live callers now pass provider explicitly (send-invoice-email pins
// 'resend' for PDF attachments; process-email-queue DLQ alert pins
// 'resend'; every other production caller passes 'platform'). The default
// flipped to 'platform' so any future caller that omits provider stays on
// the queued path rather than silently falling back to Resend.
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
  /**
   * Interactive send — a human just clicked "Send" (KYC invite/resend,
   * invoice email, confirmation request). The platform branch forwards
   * this to `send-transactional-email`, which nudges the queue worker
   * immediately after enqueue so the row flips to `sent` within seconds
   * instead of on the next cron tick. Retries/dedup/logging are unchanged.
   * Resend branch ignores it.
   */
  interactive?: boolean;
}

export interface SendEmailResult {
  ok: boolean;
  status: number;
  provider: EmailProvider;
  id?: string;
  error?: string;
  raw?: unknown;
}

// Resend-verified sender. NOTE: only xboom.in is verified in the Resend
// account. The notify.xboomflow.com delegated subdomain is verified for
// the platform (Lovable/pgmq) path but NOT for Resend — sending from that
// domain via Resend returns 403 validation_error. Any change here must be
// preceded by verifying the new domain in the Resend dashboard.
export const DEFAULT_FROM =
  "Xboom <notifications@xboom.in>";
export const DEFAULT_REPLY_TO = "no-reply@xboomflow.com";

function resolveProvider(explicit?: EmailProvider): EmailProvider {
  if (explicit) return explicit;
  const env = (Deno.env.get("EMAIL_PROVIDER") || "").toLowerCase();
  return env === "resend" ? "resend" : "platform";
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
    // Platform templates are enqueued per-recipient. When multiple `to`
    // addresses are provided the seam loops and calls
    // `send-transactional-email` once per address so admin-list emails
    // (sync-health, data-quality, attention alerts) actually deliver to
    // everyone — the legacy implementation silently kept only the first
    // recipient. Idempotency is derived per-recipient as
    // `${idempotencyKey}:${recipient}` when a base key is supplied, so a
    // retry of the same enqueue collapses but each address gets its own
    // dedup slot.
    const recipients = (Array.isArray(args.to) ? args.to : [args.to])
      .map((r) => String(r || "").trim())
      .filter((r) => r.length > 0);
    if (recipients.length === 0) {
      return {
        ok: false,
        status: 400,
        provider: "platform",
        error: "no recipients supplied",
      };
    }
    const perRecipient: Array<{ recipient: string; ok: boolean; status: number; error?: string; raw?: unknown }> = [];
    for (const recipient of recipients) {
      const recipientKey = args.idempotencyKey
        ? (recipients.length === 1
            ? args.idempotencyKey
            : `${args.idempotencyKey}:${recipient}`)
        : undefined;
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
            idempotencyKey: recipientKey,
            templateData: args.templateData ?? {},
          interactive: args.interactive === true,
          }),
        });
        let raw: any = null;
        try { raw = await res.json(); } catch { /* ignore */ }
        if (!res.ok) {
          const msg = (raw && (raw.error || raw.message)) || `HTTP ${res.status}`;
          perRecipient.push({ recipient, ok: false, status: res.status, error: String(msg).slice(0, 500), raw });
        } else {
          perRecipient.push({ recipient, ok: true, status: res.status, raw });
        }
      } catch (err: any) {
        perRecipient.push({ recipient, ok: false, status: 0, error: err?.message || String(err) });
      }
    }
    const allOk = perRecipient.every((r) => r.ok);
    const anyOk = perRecipient.some((r) => r.ok);
    const worstStatus = perRecipient.reduce((s, r) => (r.ok ? s : Math.max(s, r.status || 500)), 0) || 200;
    if (allOk) {
      return {
        ok: true,
        status: 200,
        provider: "platform",
        raw: { recipients: perRecipient },
      };
    }
    const firstErr = perRecipient.find((r) => !r.ok);
    return {
      ok: false,
      status: worstStatus,
      provider: "platform",
      error: `${perRecipient.filter((r) => !r.ok).length}/${perRecipient.length} recipients failed${firstErr ? `: ${firstErr.error}` : ""}${anyOk ? " (partial)" : ""}`.slice(0, 500),
      raw: { recipients: perRecipient },
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
