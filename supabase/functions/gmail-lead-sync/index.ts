import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Only filter out truly automated/system emails
const HARD_BLOCK_SENDERS = ["mailer-daemon", "postmaster", "noreply", "no-reply"];
const SPAM_SUBJECT_INDICATORS = ["unsubscribe", "newsletter", "you have been removed"];

// Bulk sender threshold: if a sender sends more than this many emails per day, flag as bulk
const BULK_SENDER_THRESHOLD = 10;

// Per-mailbox subject allowlists. If a mailbox has an entry here, ONLY emails whose subject
// contains one of the listed substrings (case-insensitive) will be ingested as leads.
// Other emails for these mailboxes are skipped silently (logged as dropped).
const SUBJECT_ALLOWLIST_BY_MAILBOX: Record<string, string[]> = {
  "contact@xboom.in": ["[XBOOM contact]", "[XBOOM popup]"],
};

function passesSubjectAllowlist(mailbox: string, subject: string): boolean {
  const allow = SUBJECT_ALLOWLIST_BY_MAILBOX[mailbox.toLowerCase()];
  if (!allow || allow.length === 0) return true; // no filter configured
  const subjLower = (subject || "").toLowerCase();
  return allow.some((token) => subjLower.includes(token.toLowerCase()));
}

interface GmailMessage {
  id: string;
  threadId: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ mimeType: string; body?: { data?: string } }>;
  };
}

function decodeBase64Url(data: string): string {
  try {
    const padded = data.replace(/-/g, "+").replace(/_/g, "/");
    return decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch {
    return "";
  }
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function extractBodyParts(payload: GmailMessage["payload"]): { text: string; html: string } {
  let text = "";
  let html = "";
  if (payload.body?.data) {
    text = decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) text = decodeBase64Url(textPart.body.data);
    const htmlPart = payload.parts.find((p) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) html = decodeBase64Url(htmlPart.body.data);
  }
  if (!text && html) {
    text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  return { text, html };
}

function extractPhone(text: string): string | null {
  const patterns = [
    /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/,
    /(?:\+91[\s-]?)?\d{5}[\s-]?\d{5}/,
    /\b\d{10}\b/,
  ];
  for (const p of patterns) {
    const match = text.match(p);
    if (match) return match[0].replace(/[\s-]/g, "");
  }
  return null;
}

function extractEmail(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

function extractName(fromHeader: string): string {
  const match = fromHeader.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  const emailMatch = fromHeader.match(/([^@]+)@/);
  return emailMatch ? emailMatch[1].replace(/[._-]/g, " ").trim() : "Unknown";
}

function extractProduct(text: string): string | null {
  const patterns = [
    /(?:interested in|enquiry for|quote for|need|want|looking for|require)\s+(?:a\s+)?(.+?)(?:\.|,|\n|$)/i,
    /(?:drone|product|model)[\s:]+(.+?)(?:\.|,|\n|$)/i,
  ];
  for (const p of patterns) {
    const match = text.match(p);
    if (match) return match[1].trim().substring(0, 100);
  }
  return null;
}

function isHardBlocked(from: string, subject: string): { blocked: boolean; reason: string } {
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();

  for (const blocked of HARD_BLOCK_SENDERS) {
    if (fromLower.includes(blocked + "@") || fromLower.includes(`<${blocked}@`)) {
      return { blocked: true, reason: `sender_blocked:${blocked}` };
    }
  }

  for (const indicator of SPAM_SUBJECT_INDICATORS) {
    if (subjectLower.includes(indicator)) {
      return { blocked: true, reason: `subject_spam:${indicator}` };
    }
  }

  return { blocked: false, reason: "" };
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GMAIL_CLIENT_ID,
        client_secret: GMAIL_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Track sender frequency and detect bulk senders
 */
async function trackSenderFrequency(
  supabase: ReturnType<typeof createClient>,
  senderEmail: string
): Promise<boolean> {
  // Upsert sender frequency
  const { data } = await supabase
    .from("email_sender_frequency")
    .upsert(
      {
        sender_email: senderEmail.toLowerCase(),
        message_count: 1,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "sender_email" }
    )
    .select("message_count, is_bulk_sender")
    .single();

  if (!data) {
    // If upsert didn't return, do increment manually
    await supabase.rpc("increment_sender_count_safe", { p_email: senderEmail.toLowerCase() }).catch(() => {
      // Fallback: manual update
      supabase
        .from("email_sender_frequency")
        .update({
          message_count: (data as any)?.message_count ? (data as any).message_count + 1 : 1,
          last_seen_at: new Date().toISOString(),
        })
        .eq("sender_email", senderEmail.toLowerCase());
    });
    return false;
  }

  // Increment count
  const newCount = (data.message_count || 0) + 1;
  const isBulk = newCount >= BULK_SENDER_THRESHOLD;

  await supabase
    .from("email_sender_frequency")
    .update({
      message_count: newCount,
      last_seen_at: new Date().toISOString(),
      is_bulk_sender: isBulk,
    })
    .eq("sender_email", senderEmail.toLowerCase());

  return data.is_bulk_sender || isBulk;
}

/**
 * Update pipeline stats for today
 */
async function updatePipelineStats(
  supabase: ReturnType<typeof createClient>,
  stats: { ingested: number; blocked: number; duplicates: number }
) {
  const today = new Date().toISOString().split("T")[0];
  
  // Upsert today's stats
  const { data: existing } = await supabase
    .from("email_lead_pipeline_stats")
    .select("*")
    .eq("stat_date", today)
    .single();

  if (existing) {
    await supabase
      .from("email_lead_pipeline_stats")
      .update({
        total_ingested: (existing.total_ingested || 0) + stats.ingested,
        spam_detected: (existing.spam_detected || 0) + stats.blocked,
      })
      .eq("stat_date", today);
  } else {
    await supabase.from("email_lead_pipeline_stats").insert({
      stat_date: today,
      total_ingested: stats.ingested,
      spam_detected: stats.blocked,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedCronSecret = Deno.env.get("CRON_SECRET");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let requestUserId: string | null = null;
    let requestUserRoles: string[] = [];

    if (cronSecret && cronSecret === expectedCronSecret) {
      // Cron-triggered
    } else if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      requestUserId = user.id;

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      requestUserRoles = (roles || []).map((r: any) => r.role);
      if (!requestUserRoles.includes("admin") && !requestUserRoles.includes("sales_manager")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const integrationId = body.integration_id;

    let query = supabase.from("gmail_integrations").select("*").eq("is_active", true);
    if (integrationId) query = query.eq("id", integrationId);

    const { data: integrations, error: intError } = await query;
    if (intError || !integrations?.length) {
      console.log("[Gmail Sync] No active integrations resolved", {
        integrationId: integrationId || null,
        requestUserId,
        requestUserRoles,
        queryError: intError?.message || null,
      });

      return new Response(JSON.stringify({ message: "No active Gmail integrations found", synced: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const integration of integrations) {
      let accessToken = integration.access_token;
      let emailsFetched = 0;
      let leadsCreated = 0;
      let blocked = 0;
      let duplicates = 0;
      let threadUpdated = 0;
      let bulkSenderBlocked = 0;
      let errors = "";
      const dropLog: Array<{ gmail_id: string; sender: string; subject: string; reason: string }> = [];

      // Check token expiry and refresh if needed
      if (integration.token_expiry && new Date(integration.token_expiry) <= new Date()) {
        const refreshed = await refreshAccessToken(integration.refresh_token);
        if (refreshed) {
          accessToken = refreshed.access_token;
          await supabase
            .from("gmail_integrations")
            .update({
              access_token: refreshed.access_token,
              token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
            })
            .eq("id", integration.id);
        } else {
          errors = "Token refresh failed";
          await supabase.from("gmail_sync_logs").insert({
            integration_id: integration.id,
            emails_fetched: 0,
            leads_created: 0,
            errors,
          });
          results.push({ email: integration.email, error: errors });
          continue;
        }
      }

      const searchQuery = "newer_than:1d is:inbox -category:promotions -category:social -category:updates -category:forums";
      const listUrl = `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=50`;

      try {
        const listRes = await fetch(listUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!listRes.ok) {
          const errBody = await listRes.text();
          errors = `Gmail API error: ${listRes.status}`;
          console.error(`[Gmail Sync] API error for ${integration.email}:`, errBody);
          await supabase.from("gmail_sync_logs").insert({
            integration_id: integration.id,
            emails_fetched: 0,
            leads_created: 0,
            errors,
          });
          results.push({ email: integration.email, error: errors });
          continue;
        }

        const listData = await listRes.json();
        const messageIds: string[] = (listData.messages || []).map((m: any) => m.id);
        emailsFetched = messageIds.length;

        for (const msgId of messageIds) {
          try {
            const msgRes = await fetch(
              `https://www.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!msgRes.ok) continue;

            const msg: GmailMessage = await msgRes.json();
            const from = getHeader(msg.payload.headers, "From");
            const subject = getHeader(msg.payload.headers, "Subject");
            const messageIdHeader = getHeader(msg.payload.headers, "Message-ID") || msgId;
            const threadId = msg.threadId;
            const { text: bodyText, html: bodyHtml } = extractBodyParts(msg.payload);
            const senderEmail = extractEmail(from) || "";
            const ingestTimestamp = new Date().toISOString();

            // ---- Hard block system senders ----
            const blockCheck = isHardBlocked(from, subject);
            if (blockCheck.blocked) {
              blocked++;
              dropLog.push({ gmail_id: msgId, sender: senderEmail, subject, reason: blockCheck.reason });
              continue;
            }

            // ---- Sender frequency check: detect bulk senders ----
            if (senderEmail) {
              const isBulkSender = await trackSenderFrequency(supabase, senderEmail);
              if (isBulkSender) {
                bulkSenderBlocked++;
                dropLog.push({ gmail_id: msgId, sender: senderEmail, subject, reason: "bulk_sender_detected" });
                continue;
              }
            }

            // ---- Deduplicate using Message-ID (gmail message id) ----
            const emailLeadId = `gmail_${msgId}`;

            // ---- Thread-based dedup: check if another message in same thread exists ----
            if (threadId) {
              const { data: threadExisting } = await supabase
                .from("email_leads")
                .select("id, thread_id")
                .eq("thread_id", threadId)
                .limit(1);

              if (threadExisting && threadExisting.length > 0) {
                // Update existing lead with latest thread message info
                await supabase.from("email_leads").update({
                  body_text: bodyText ? bodyText.substring(0, 10000) : undefined,
                  body_html: bodyHtml ? bodyHtml.substring(0, 50000) : undefined,
                  subject: subject || undefined,
                  notes: `[Thread Updated] Subject: ${subject}\n\n${bodyText.substring(0, 500)}`,
                  updated_at: new Date().toISOString(),
                }).eq("id", threadExisting[0].id);

                threadUpdated++;
                continue;
              }
            }

            // ---- Check exact message dedup ----
            const { data: existing } = await supabase
              .from("email_leads")
              .select("id")
              .eq("email_lead_id", emailLeadId)
              .limit(1);

            if (existing && existing.length > 0) {
              duplicates++;
              continue;
            }

            // Extract lead data
            const name = extractName(from);
            const phone = extractPhone(bodyText);
            const product = extractProduct(`${subject} ${bodyText}`);

            // ---- INSERT with thread_id and ingested_at ----
            const { error: insertError } = await supabase.from("email_leads").insert({
              customer_name: name,
              email: senderEmail,
              phone_number: phone,
              product_name: product,
              mail_source: `gmail:${integration.email}`,
              lead_source: "gmail",
              subject: subject || null,
              body_text: bodyText ? bodyText.substring(0, 10000) : null,
              body_html: bodyHtml ? bodyHtml.substring(0, 50000) : null,
              notes: `Subject: ${subject}\n\n${bodyText.substring(0, 500)}`,
              status: "pending",
              processing_status: "pending",
              ai_processed: false,
              email_lead_id: emailLeadId,
              thread_id: threadId || null,
              ingested_at: ingestTimestamp,
            });

            if (!insertError) {
              leadsCreated++;
            } else {
              if (insertError.code === "23505") {
                duplicates++;
              } else {
                console.error("[Gmail Sync] Insert error:", insertError.message);
                dropLog.push({ gmail_id: msgId, sender: senderEmail, subject, reason: `insert_error:${insertError.message}` });
              }
            }
          } catch (msgErr) {
            console.error("[Gmail Sync] Error processing message:", msgErr);
          }
        }
      } catch (fetchErr) {
        errors = `Fetch error: ${String(fetchErr)}`;
        console.error(errors);
      }

      // Update pipeline stats
      await updatePipelineStats(supabase, {
        ingested: leadsCreated,
        blocked: blocked + bulkSenderBlocked,
        duplicates,
      });

      // Structured sync summary log
      console.log(JSON.stringify({
        event: "gmail_sync_complete",
        integration_email: integration.email,
        emails_fetched: emailsFetched,
        leads_created: leadsCreated,
        blocked,
        bulk_sender_blocked: bulkSenderBlocked,
        thread_updated: threadUpdated,
        duplicates,
        drops: dropLog,
        errors: errors || null,
      }));

      // Update last synced
      await supabase
        .from("gmail_integrations")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", integration.id);

      // Log sync
      await supabase.from("gmail_sync_logs").insert({
        integration_id: integration.id,
        emails_fetched: emailsFetched,
        leads_created: leadsCreated,
        errors: errors || null,
      });

      results.push({
        email: integration.email,
        emails_fetched: emailsFetched,
        leads_created: leadsCreated,
        blocked,
        bulk_sender_blocked: bulkSenderBlocked,
        thread_updated: threadUpdated,
        duplicates,
        drops: dropLog.length,
        errors: errors || null,
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Gmail sync error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
