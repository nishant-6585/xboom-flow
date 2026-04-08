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

// Only filter out truly automated/system emails — NOT generic inboxes like hello@, info@, contact@
const HARD_BLOCK_SENDERS = ["mailer-daemon", "postmaster", "noreply", "no-reply"];
const SPAM_SUBJECT_INDICATORS = ["unsubscribe", "newsletter", "you have been removed"];

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

/**
 * Only block truly automated/system senders.
 * Generic inboxes like hello@, info@, contact@, support@ are ALLOWED.
 */
function isHardBlocked(from: string, subject: string): { blocked: boolean; reason: string } {
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();

  // Check sender against hard-block list (system emails only)
  for (const blocked of HARD_BLOCK_SENDERS) {
    if (fromLower.includes(blocked + "@") || fromLower.includes(`<${blocked}@`)) {
      return { blocked: true, reason: `sender_blocked:${blocked}` };
    }
  }

  // Check subject for obvious spam indicators
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - either JWT or cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedCronSecret = Deno.env.get("CRON_SECRET");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let requestUserId: string | null = null;
    let requestUserRoles: string[] = [];

    if (cronSecret && cronSecret === expectedCronSecret) {
      // Cron-triggered, process all active integrations
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

      // Check role
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

    // Get body for optional integration_id filter
    const body = await req.json().catch(() => ({}));
    const integrationId = body.integration_id;

    // Fetch active integrations
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

    console.log("[Gmail Sync] Processing integrations", {
      integrationId: integrationId || null,
      requestUserId,
      requestUserRoles,
      integrations: integrations.map((integration) => ({
        id: integration.id,
        user_id: integration.user_id,
        email: integration.email,
      })),
    });

    const results = [];

    for (const integration of integrations) {
      let accessToken = integration.access_token;
      let emailsFetched = 0;
      let leadsCreated = 0;
      let blocked = 0;
      let duplicates = 0;
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

      // Search Gmail — broad query, let AI processor handle classification
      const searchQuery = "newer_than:1d is:inbox -category:promotions -category:social -category:updates -category:forums";
      const listUrl = `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=50`;

      try {
        console.log(`[Gmail Sync] Fetching emails for ${integration.email} with query: ${searchQuery}`);
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
        console.log(`[Gmail Sync] Found ${emailsFetched} emails for ${integration.email}`);

        for (const msgId of messageIds) {
          try {
            // Fetch full message
            const msgRes = await fetch(
              `https://www.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!msgRes.ok) continue;

            const msg: GmailMessage = await msgRes.json();
            const from = getHeader(msg.payload.headers, "From");
            const subject = getHeader(msg.payload.headers, "Subject");
            const messageIdHeader = getHeader(msg.payload.headers, "Message-ID") || msgId;
            const dateStr = getHeader(msg.payload.headers, "Date");
            const { text: bodyText, html: bodyHtml } = extractBodyParts(msg.payload);
            const senderEmail = extractEmail(from) || "";

            // ---- ONLY block truly automated system senders ----
            const blockCheck = isHardBlocked(from, subject);
            if (blockCheck.blocked) {
              blocked++;
              dropLog.push({ gmail_id: msgId, sender: senderEmail, subject, reason: blockCheck.reason });
              continue;
            }

            // ---- Deduplicate using Message-ID header (not sender email) ----
            // This prevents dropping different emails from the same sender
            const emailLeadId = `gmail_${msgId}`;
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

            // ---- INSERT ALL non-blocked emails — let AI processor classify ----
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
            });

            if (!insertError) {
              leadsCreated++;
            } else {
              // If unique constraint violation, it's a duplicate — not an error
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

      // Structured sync summary log
      console.log(JSON.stringify({
        event: "gmail_sync_complete",
        integration_email: integration.email,
        emails_fetched: emailsFetched,
        leads_created: leadsCreated,
        blocked,
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
