import { createClient } from "npm:@supabase/supabase-js@2";
import { isAuthorizedCron } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUFFER_WINDOW_MINUTES = 10; // #1: Buffer window to avoid missed leads
const MIN_LOOKBACK_DAYS = 7;      // Always look back at least 7 days to catch late-arriving leads
const MAX_RETRIES = 3;            // #3: Retry attempts
const LOCK_DURATION_MINUTES = 4;  // #7: Cron lock duration

interface GoogleAdsLead {
  lead_id: string;
  campaign_id: string;
  campaign_name?: string;
  ad_group_id?: string;
  submission_data: { column_name: string; string_value: string }[];
  created_at: string;
}

// Detect if all column_names are "unknown" — if so, use heuristic parsing
function parseSubmissionFields(data: { column_name: string; string_value: string }[]): {
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  extras: Record<string, string>;
} {
  const allUnknown = data.every(d => d.column_name.toLowerCase() === "unknown" || !d.column_name);
  
  if (allUnknown) {
    // Heuristic: classify each value by pattern
    let name: string | null = null;
    let email: string | null = null;
    let phone: string | null = null;
    let city: string | null = null;
    const extras: Record<string, string> = {};

    for (const field of data) {
      const val = field.string_value?.trim();
      if (!val) continue;
      
      if (!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        email = val;
      } else if (!phone && /^[\+]?\d[\d\s\-\(\)]{6,}$/.test(val.replace(/\s/g, ''))) {
        phone = val;
      } else if (!name) {
        // First non-email, non-phone value is likely the name
        name = val;
      } else if (!city) {
        // Next unmatched value is likely city/location
        city = val;
      } else {
        extras[`field_${Object.keys(extras).length + 1}`] = val;
      }
    }
    return { name, email, phone, city, extras };
  }

  // Standard extraction when column names are known
  return {
    name: extractField(data, "FULL_NAME", "NAME", "FIRST_NAME"),
    email: extractField(data, "EMAIL", "EMAIL_ADDRESS", "WORK_EMAIL"),
    phone: extractField(data, "PHONE_NUMBER", "PHONE", "MOBILE", "CONTACT_NUMBER"),
    city: extractField(data, "CITY", "LOCATION", "AREA", "REGION"),
    extras: {},
  };
}

function extractField(data: { column_name: string; string_value: string }[], ...names: string[]): string | null {
  for (const name of names) {
    const found = data.find(
      (d) => d.column_name.toUpperCase() === name.toUpperCase()
    );
    if (found?.string_value) return found.string_value;
  }
  return null;
}

// #4: Robust name extraction using parseSubmissionFields
function extractLeadName(data: { column_name: string; string_value: string }[]): string {
  const parsed = parseSubmissionFields(data);
  if (parsed.name) return parsed.name;
  if (parsed.email) return parsed.email.split("@")[0];
  return "Google Ads Lead";
}

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const json = await res.json();
  return json.access_token;
}

// #3: Fetch with retry + exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status === 400 || res.status === 401 || res.status === 403) {
        return res; // Don't retry client errors
      }
      lastError = new Error(`HTTP ${res.status}: ${await res.text()}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    // Exponential backoff: 1s, 2s, 4s
    if (attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastError || new Error("Fetch failed after retries");
}

async function fetchGoogleAdsLeads(
  accessToken: string,
  developerToken: string,
  customerId: string,
  lastSyncedAt: string | null
): Promise<GoogleAdsLead[]> {
  // #1: Buffer window — go back from last sync to catch delayed data.
  // Google Ads can deliver lead-form submissions with multi-day latency, so we always
  // look back at least MIN_LOOKBACK_DAYS regardless of last_synced_at.
  const minLookback = new Date(Date.now() - MIN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const fromLastSync = lastSyncedAt
    ? new Date(new Date(lastSyncedAt).getTime() - BUFFER_WINDOW_MINUTES * 60 * 1000)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const baselineTime = fromLastSync < minLookback ? fromLastSync : minLookback;

  // GAQL expects DATE literal in filters for this field (YYYY-MM-DD)
  const startDateFormatted = baselineTime.toISOString().slice(0, 10);

  // Use only supported lead_form_submission_data fields for v23
  const query = `SELECT lead_form_submission_data.id, lead_form_submission_data.submission_date_time, lead_form_submission_data.campaign, lead_form_submission_data.ad_group, lead_form_submission_data.asset, lead_form_submission_data.lead_form_submission_fields FROM lead_form_submission_data WHERE lead_form_submission_data.submission_date_time >= '${startDateFormatted}' ORDER BY lead_form_submission_data.submission_date_time DESC`;

  console.log("[GAQL] Final query:", query);

  // Ensure customer ID is a direct account ID (digits only), not MCC format
  const customIdFormatted = customerId.replace(/\D/g, "");
  if (!customIdFormatted) {
    throw new Error("Invalid GOOGLE_ADS_CUSTOMER_ID: must contain digits only");
  }

  console.log("[Google Ads] Using customer ID:", customIdFormatted);

  const apiUrl = `https://googleads.googleapis.com/v23/customers/${customIdFormatted}/googleAds:searchStream`;
  console.log("[Google Ads] API URL:", apiUrl);

  // #3: Use retry wrapper
  const res = await fetchWithRetry(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[Google Ads API] Full error response:", errText);
    throw new Error(`Google Ads API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const leads: GoogleAdsLead[] = [];

  // searchStream returns an array of result batches; empty means no leads
  const batches = Array.isArray(data) ? data : [data];
  for (const batch of batches) {
    const results = batch.results || [];
    for (const result of results) {
      const sub = result.leadFormSubmissionData;
      if (!sub) continue;

      const submissionFields = (sub.leadFormSubmissionFields || [])
        .map((f: { fieldName?: string; fieldValue?: string; columnName?: string; stringValue?: string }) => ({
          column_name: f.fieldName || f.columnName || "unknown",
          string_value: f.fieldValue || f.stringValue || "",
        }))
        .filter((f: { column_name: string; string_value: string }) => f.column_name && f.string_value);

      const campaignResource = sub.campaign || "";
      const adGroupResource = sub.adGroup || "";

      leads.push({
        lead_id: sub.id || sub.resourceName || "",
        campaign_id: campaignResource ? campaignResource.split("/").pop() || "" : "",
        campaign_name: "",
        ad_group_id: adGroupResource ? adGroupResource.split("/").pop() || "" : "",
        submission_data: submissionFields,
        created_at: sub.submissionDateTime || new Date().toISOString(),
      });
    }
  }

  console.log(`[Google Ads] Fetched ${leads.length} leads from API`);
  return leads;
}

// #6: Send Slack alert on failures
async function sendFailureAlert(
  supabaseAdmin: ReturnType<typeof createClient>,
  errorMessage: string,
  failedCount: number
) {
  try {
    // Check if Slack is configured for notifications
    const { data: slackSettings } = await supabaseAdmin
      .from("slack_settings")
      .select("is_enabled")
      .limit(1)
      .maybeSingle();

    if (!slackSettings?.is_enabled) return;

    // Use the existing send-slack-notification function via internal HTTP
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    await fetch(`${supabaseUrl}/functions/v1/send-slack-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        type: "new_order", // Reuse channel; message makes it clear it's a sync alert
        data: {
          customer_name: "⚠️ Google Ads Sync Alert",
          product_name: `${failedCount} consecutive failure(s)`,
          notes: errorMessage.substring(0, 200),
        },
      }),
    });
  } catch (e) {
    console.error("Failed to send Slack alert:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Auth: accept cron secret OR valid admin JWT
  const authHeader = req.headers.get("authorization");
  let isAuthorized = false;

  if (await isAuthorizedCron(req)) {
    isAuthorized = true;
  } else if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) {
      const { data: roleData } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "supply_chain"])
        .maybeSingle();
      if (roleData) isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // #7: Cron lock — prevent overlapping runs
  const { data: activeLock } = await supabaseAdmin
    .from("google_ads_sync_log")
    .select("id, sync_locked_until")
    .not("sync_locked_until", "is", null)
    .gt("sync_locked_until", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (activeLock) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Sync already in progress. Skipping this run.",
        locked_until: activeLock.sync_locked_until,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Acquire lock by inserting a log entry with lock
  const lockUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000).toISOString();
  const { data: lockEntry } = await supabaseAdmin
    .from("google_ads_sync_log")
    .insert({
      last_synced_at: new Date().toISOString(),
      leads_fetched: 0,
      leads_inserted: 0,
      leads_skipped: 0,
      status: "running",
      sync_locked_until: lockUntil,
    })
    .select("id")
    .single();

  const lockId = lockEntry?.id;

  try {
    // Get Google Ads credentials
    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    const clientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET");
    const refreshToken = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN");
    const customerId = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID");

    if (!developerToken || !clientId || !clientSecret || !refreshToken || !customerId) {
      // Release lock + update log
      if (lockId) {
        await supabaseAdmin.from("google_ads_sync_log").update({
          status: "error",
          errors: ["Missing Google Ads credentials"],
          sync_locked_until: null,
          sync_duration_ms: Date.now() - startTime,
        }).eq("id", lockId);
      }
      return new Response(
        JSON.stringify({
          error: "Google Ads credentials not configured",
          missing: [
            !developerToken && "GOOGLE_ADS_DEVELOPER_TOKEN",
            !clientId && "GOOGLE_ADS_CLIENT_ID",
            !clientSecret && "GOOGLE_ADS_CLIENT_SECRET",
            !refreshToken && "GOOGLE_ADS_REFRESH_TOKEN",
            !customerId && "GOOGLE_ADS_CUSTOMER_ID",
          ].filter(Boolean),
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get last successful sync timestamp
    const { data: lastSync } = await supabaseAdmin
      .from("google_ads_sync_log")
      .select("last_synced_at")
      .eq("status", "success")
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastSyncedAt = lastSync?.last_synced_at || null;

    // Refresh OAuth token
    const accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken);

    // Fetch leads from Google Ads (with retry built in)
    const leads = await fetchGoogleAdsLeads(accessToken, developerToken, customerId, lastSyncedAt);

    let inserted = 0;
    let skipped = 0;
    let duplicatesSkipped = 0;
    const errors: string[] = [];

    // Round-robin assignment between Arjav, Suman, Narsimha & Mushtaq
    const roundRobinAssignees = [
      { user_id: 'e05f9afe-0160-4956-bb1f-496028386062', name: 'Arjav chauhan' },
      { user_id: '456e91f8-34cc-4f92-a1c1-a092f2bbed39', name: 'suman das' },
      { user_id: 'a790b58d-8e3d-4333-b6d6-08be631c865d', name: 'Narasimha' },
      { user_id: '457fc2d5-9fc5-439a-938e-5b998549b811', name: 'mohammed musthak' },
    ];

    // Determine round-robin start index from last assigned Google Ads lead
    const { data: lastAssigned } = await supabaseAdmin
      .from('google_ads_leads')
      .select('sales_person_id')
      .not('sales_person_id', 'is', null)
      .in('sales_person_id', roundRobinAssignees.map(a => a.user_id))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let rrIndex = 0;
    if (lastAssigned?.sales_person_id) {
      const lastIdx = roundRobinAssignees.findIndex(a => a.user_id === lastAssigned.sales_person_id);
      if (lastIdx >= 0) rrIndex = (lastIdx + 1) % roundRobinAssignees.length;
    }

    for (const lead of leads) {
      try {
        // #2: Pre-check duplicate in code before insert attempt
        if (lead.lead_id) {
          const { data: existing } = await supabaseAdmin
            .from("google_ads_leads")
            .select("id")
            .eq("google_lead_id", lead.lead_id)
            .maybeSingle();
          if (existing) {
            duplicatesSkipped++;
            skipped++;
            console.log(`[DEDUP] Skipped duplicate lead: ${lead.lead_id}`);
            continue;
          }
        }

        // #4: Use heuristic parser for "unknown" column names
        const parsed = parseSubmissionFields(lead.submission_data);
        const name = parsed.name || extractLeadName(lead.submission_data);
        const phone = parsed.phone;
        const email = parsed.email;
        const company = extractField(lead.submission_data, "COMPANY_NAME", "COMPANY", "ORGANIZATION") || null;
        const city = parsed.city;
        const productInterest = extractField(lead.submission_data, "PRODUCT", "PRODUCT_TYPE", "WHAT_ARE_YOU_LOOKING_FOR", "INTERESTED_IN", "MODEL");

        // Pick the next assignee in round-robin
        const assignee = roundRobinAssignees[rrIndex % roundRobinAssignees.length];
        rrIndex++;

        const { error: insertError } = await supabaseAdmin.from("google_ads_leads").insert({
          customer_name: name,
          customer_company: company,
          product_name: productInterest || "Google Ads Enquiry",
          product_code: phone || "N/A",
          product_category: "Consumer Drones",
          quantity: 1,
          urgency: "medium",
          email: email,
          phone: phone,
          city: city,
          sales_person_id: assignee.user_id,
          sales_person_name: assignee.name,
          status: "pending",
          lead_temperature: "warm",
          notes: [
            email ? `Email: ${email}` : null,
            phone ? `Phone: ${phone}` : null,
            city ? `City: ${city}` : null,
            `Source: Google Ads`,
            lead.campaign_name ? `Campaign: ${lead.campaign_name}` : null,
            lead.campaign_id ? `Campaign ID: ${lead.campaign_id}` : null,
            lead.ad_group_id ? `Ad Group: ${lead.ad_group_id}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          lead_source: "google_ads",
          google_lead_id: lead.lead_id,
          campaign_id: lead.campaign_id,
          campaign_name: lead.campaign_name || null,
          ad_group_id: lead.ad_group_id || null,
          raw_google_payload: lead as unknown as Record<string, unknown>,
        });

        if (insertError) {
          if (insertError.code === "23505") {
            duplicatesSkipped++;
            skipped++;
            console.log(`[DEDUP-DB] Constraint caught duplicate: ${lead.lead_id}`);
          } else {
            errors.push(`Lead ${lead.lead_id}: ${insertError.message}`);
          }
        } else {
          inserted++;
        }
      } catch (leadErr) {
        errors.push(`Lead ${lead.lead_id}: ${String(leadErr)}`);
      }
    }

    const duration = Date.now() - startTime;
    const finalStatus = errors.length > 0 && inserted === 0 ? "error" : "success";

    // Update the lock entry with final results
    if (lockId) {
      await supabaseAdmin.from("google_ads_sync_log").update({
        last_synced_at: new Date().toISOString(),
        leads_fetched: leads.length,
        leads_inserted: inserted,
        leads_skipped: skipped,
        duplicates_skipped: duplicatesSkipped,
        errors: errors.length > 0 ? errors : [],
        status: finalStatus,
        sync_duration_ms: duration,
        sync_locked_until: null, // Release lock
      }).eq("id", lockId);
    }

    // --- Fetch campaign spend data from Google Ads Reporting API ---
    try {
      const spendQuery = `SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, segments.date FROM campaign WHERE segments.date DURING LAST_30_DAYS ORDER BY segments.date DESC`;
      console.log("[Google Ads] Fetching campaign spend data...");

      const customIdFormatted = customerId.replace(/\D/g, "");
      const spendUrl = `https://googleads.googleapis.com/v23/customers/${customIdFormatted}/googleAds:searchStream`;
      const spendRes = await fetchWithRetry(spendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: spendQuery }),
      });

      if (spendRes.ok) {
        const spendData = await spendRes.json();
        const spendBatches = Array.isArray(spendData) ? spendData : [spendData];
        let spendUpserted = 0;

        for (const batch of spendBatches) {
          for (const result of (batch.results || [])) {
            const camp = result.campaign;
            const metrics = result.metrics;
            const segDate = result.segments?.date;
            if (!camp?.id || !segDate) continue;

            const spendAmount = (metrics?.costMicros ? Number(metrics.costMicros) / 1000000 : 0);

            const { error: spendErr } = await supabaseAdmin
              .from("campaign_spend")
              .upsert({
                campaign_id: String(camp.id),
                campaign_name: camp.name || null,
                spend: spendAmount,
                impressions: metrics?.impressions ? Number(metrics.impressions) : 0,
                clicks: metrics?.clicks ? Number(metrics.clicks) : 0,
                date: segDate,
              }, { onConflict: "campaign_id,date" });

            if (!spendErr) spendUpserted++;
          }
        }
        console.log(`[Google Ads] Upserted ${spendUpserted} campaign spend records`);
      } else {
        console.error("[Google Ads] Failed to fetch spend data:", await spendRes.text());
      }
    } catch (spendErr) {
      console.error("[Google Ads] Spend fetch error (non-fatal):", spendErr);
    }

    // #6: Alert on errors
    if (finalStatus === "error") {
      const { data: recentLogs } = await supabaseAdmin
        .from("google_ads_sync_log")
        .select("status")
        .order("created_at", { ascending: false })
        .limit(3);

      const consecutiveFailures = recentLogs?.filter((l) => l.status === "error").length || 0;
      if (consecutiveFailures >= 2) {
        await sendFailureAlert(supabaseAdmin, errors.join("; "), consecutiveFailures);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        fetched: leads.length,
        inserted,
        skipped,
        duplicates_skipped: duplicatesSkipped,
        errors: errors.length,
        duration_ms: duration,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Release lock + log failure
    if (lockId) {
      await supabaseAdmin.from("google_ads_sync_log").update({
        leads_fetched: 0,
        leads_inserted: 0,
        leads_skipped: 0,
        errors: [errorMessage],
        status: "error",
        sync_duration_ms: duration,
        sync_locked_until: null,
      }).eq("id", lockId);
    }

    // #6: Check for consecutive failures and alert
    const { data: recentLogs } = await supabaseAdmin
      .from("google_ads_sync_log")
      .select("status")
      .order("created_at", { ascending: false })
      .limit(3);

    const consecutiveFailures = recentLogs?.filter((l) => l.status === "error").length || 0;
    if (consecutiveFailures >= 2) {
      await sendFailureAlert(supabaseAdmin, errorMessage, consecutiveFailures);
    }

    console.error("Google Ads sync error:", errorMessage);
    return new Response(
      JSON.stringify({ error: "Sync failed", details: errorMessage.substring(0, 200) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
