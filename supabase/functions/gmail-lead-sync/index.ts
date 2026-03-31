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

const LEAD_KEYWORDS = ["enquiry", "quote", "interested", "price", "buy", "order", "purchase", "requirement", "drone", "bulk"];
const SPAM_INDICATORS = ["unsubscribe", "newsletter", "no-reply", "noreply", "mailer-daemon", "postmaster"];

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

function extractBody(payload: GmailMessage["payload"]): string {
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
    const htmlPart = payload.parts.find((p) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) {
      const html = decodeBase64Url(htmlPart.body.data);
      return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }
  }
  return "";
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

function isSpam(from: string, subject: string, body: string): boolean {
  const combined = `${from} ${subject} ${body}`.toLowerCase();
  return SPAM_INDICATORS.some((s) => combined.includes(s));
}

function isLeadEmail(subject: string, body: string): boolean {
  const combined = `${subject} ${body}`.toLowerCase();
  return LEAD_KEYWORDS.some((k) => combined.includes(k));
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
      const userRoles = (roles || []).map((r: any) => r.role);
      if (!userRoles.includes("admin") && !userRoles.includes("marketing")) {
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
    if (requestUserId) query = query.eq("user_id", requestUserId);

    const { data: integrations, error: intError } = await query;
    if (intError || !integrations?.length) {
      return new Response(JSON.stringify({ message: "No active Gmail integrations found", synced: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const integration of integrations) {
      let accessToken = integration.access_token;
      let emailsFetched = 0;
      let leadsCreated = 0;
      let errors = "";

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

      // Search Gmail for potential lead emails
      const searchQuery = "newer_than:1d (subject:(enquiry OR quote OR interested OR price OR drone) OR \"need quote\" OR \"interested in\" OR \"want to buy\")";
      const listUrl = `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=20`;

      try {
        const listRes = await fetch(listUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!listRes.ok) {
          const errBody = await listRes.text();
          errors = `Gmail API error: ${listRes.status}`;
          console.error("Gmail API error:", errBody);
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
            // Fetch full message
            const msgRes = await fetch(
              `https://www.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!msgRes.ok) continue;

            const msg: GmailMessage = await msgRes.json();
            const from = getHeader(msg.payload.headers, "From");
            const subject = getHeader(msg.payload.headers, "Subject");
            const dateStr = getHeader(msg.payload.headers, "Date");
            const bodyText = extractBody(msg.payload);

            // Skip spam/newsletter
            if (isSpam(from, subject, bodyText)) continue;

            // Check if it's a lead
            if (!isLeadEmail(subject, bodyText)) continue;

            // Extract lead data
            const senderEmail = extractEmail(from) || "";
            const name = extractName(from);
            const phone = extractPhone(bodyText);
            const product = extractProduct(`${subject} ${bodyText}`);

            // Duplicate check: same email in last 7 days
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const { data: existing } = await supabase
              .from("email_leads")
              .select("id")
              .eq("email", senderEmail)
              .gte("created_at", sevenDaysAgo)
              .limit(1);

            if (existing && existing.length > 0) continue;

            // Insert into email_leads
            const { error: insertError } = await supabase.from("email_leads").insert({
              customer_name: name,
              email: senderEmail,
              phone_number: phone,
              product_name: product,
              mail_source: `gmail:${integration.email}`,
              lead_source: "gmail",
              notes: `Subject: ${subject}\n\n${bodyText.substring(0, 500)}`,
              status: "pending",
              processing_status: "pending",
              ai_processed: false,
            });

            if (!insertError) {
              leadsCreated++;
            } else {
              console.error("Insert error:", insertError.message);
            }
          } catch (msgErr) {
            console.error("Error processing message:", msgErr);
          }
        }
      } catch (fetchErr) {
        errors = `Fetch error: ${String(fetchErr)}`;
        console.error(errors);
      }

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
