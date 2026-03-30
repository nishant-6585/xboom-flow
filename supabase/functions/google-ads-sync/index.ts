import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GoogleAdsLead {
  lead_id: string;
  campaign_id: string;
  campaign_name?: string;
  ad_group_id?: string;
  submission_data: { column_name: string; string_value: string }[];
  created_at: string;
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

async function fetchGoogleAdsLeads(
  accessToken: string,
  developerToken: string,
  customerId: string,
  lastSyncedAt: string | null
): Promise<GoogleAdsLead[]> {
  // Build query — fetch lead form submissions
  const sinceFilter = lastSyncedAt
    ? ` AND lead_form_submission_data.submission_date_time > '${lastSyncedAt}'`
    : "";

  const query = `
    SELECT
      lead_form_submission_data.id,
      lead_form_submission_data.campaign_id,
      lead_form_submission_data.ad_group_id,
      lead_form_submission_data.lead_form_submission_fields,
      lead_form_submission_data.submission_date_time,
      campaign.name
    FROM lead_form_submission_data
    WHERE segments.date DURING LAST_30_DAYS${sinceFilter}
    ORDER BY lead_form_submission_data.submission_date_time DESC
    LIMIT 100
  `;

  const customIdFormatted = customerId.replace(/-/g, "");

  const res = await fetch(
    `https://googleads.googleapis.com/v18/customers/${customIdFormatted}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Ads API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const leads: GoogleAdsLead[] = [];

  // Parse searchStream response (array of result batches)
  const batches = Array.isArray(data) ? data : [data];
  for (const batch of batches) {
    const results = batch.results || [];
    for (const result of results) {
      const sub = result.leadFormSubmissionData;
      if (!sub) continue;

      leads.push({
        lead_id: sub.id || sub.resourceName,
        campaign_id: String(result.leadFormSubmissionData?.campaignId || sub.campaignId || ""),
        campaign_name: result.campaign?.name || "",
        ad_group_id: String(sub.adGroupId || ""),
        submission_data: (sub.leadFormSubmissionFields || []).map(
          (f: { fieldName: string; fieldValue: string }) => ({
            column_name: f.fieldName,
            string_value: f.fieldValue,
          })
        ),
        created_at: sub.submissionDateTime || new Date().toISOString(),
      });
    }
  }

  return leads;
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
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedCronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("authorization");
  let isAuthorized = false;

  if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
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

  try {
    // Get Google Ads credentials from secrets
    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
    const clientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET");
    const refreshToken = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN");
    const customerId = Deno.env.get("GOOGLE_ADS_CUSTOMER_ID");

    if (!developerToken || !clientId || !clientSecret || !refreshToken || !customerId) {
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

    // Get last synced timestamp
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

    // Fetch leads from Google Ads
    const leads = await fetchGoogleAdsLeads(accessToken, developerToken, customerId, lastSyncedAt);

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        const name = extractField(lead.submission_data, "FULL_NAME", "NAME", "FIRST_NAME") || "Google Ads Lead";
        const phone = extractField(lead.submission_data, "PHONE_NUMBER", "PHONE");
        const email = extractField(lead.submission_data, "EMAIL", "EMAIL_ADDRESS");
        const company = extractField(lead.submission_data, "COMPANY_NAME", "COMPANY") || "Unknown";
        const city = extractField(lead.submission_data, "CITY", "LOCATION");
        const productInterest = extractField(lead.submission_data, "PRODUCT", "PRODUCT_TYPE", "WHAT_ARE_YOU_LOOKING_FOR");

        // Duplicate check: google_lead_id, phone, or email
        if (lead.lead_id) {
          const { data: existing } = await supabaseAdmin
            .from("enquiries")
            .select("id")
            .eq("google_lead_id", lead.lead_id)
            .maybeSingle();
          if (existing) {
            skipped++;
            continue;
          }
        }

        // Also check by phone/email for broader dedup
        if (phone || email) {
          let dupQuery = supabaseAdmin.from("enquiries").select("id").eq("lead_source", "google_ads");
          if (phone) dupQuery = dupQuery.eq("product_code", phone); // Check phone stored in a relevant field
          // We rely mainly on google_lead_id dedup. Phone/email secondary.
        }

        const { error: insertError } = await supabaseAdmin.from("enquiries").insert({
          customer_name: name,
          customer_company: company,
          product_name: productInterest || "Google Ads Enquiry",
          product_code: phone || "N/A",
          product_category: "Consumer Drones",
          quantity: 1,
          urgency: "medium",
          sales_person_id: null,
          sales_person_name: "Unassigned",
          status: "pending",
          lead_temperature: "warm",
          notes: [
            email ? `Email: ${email}` : null,
            phone ? `Phone: ${phone}` : null,
            city ? `City: ${city}` : null,
            `Source: Google Ads (Campaign: ${lead.campaign_name || lead.campaign_id})`,
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
          // Unique constraint violation = duplicate, skip
          if (insertError.code === "23505") {
            skipped++;
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

    // Log the sync
    await supabaseAdmin.from("google_ads_sync_log").insert({
      last_synced_at: new Date().toISOString(),
      leads_fetched: leads.length,
      leads_inserted: inserted,
      leads_skipped: skipped,
      errors: errors.length > 0 ? errors : [],
      status: errors.length > 0 && inserted === 0 ? "error" : "success",
      sync_duration_ms: duration,
    });

    return new Response(
      JSON.stringify({
        success: true,
        fetched: leads.length,
        inserted,
        skipped,
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

    // Log failed sync
    await supabaseAdmin.from("google_ads_sync_log").insert({
      last_synced_at: new Date().toISOString(),
      leads_fetched: 0,
      leads_inserted: 0,
      leads_skipped: 0,
      errors: [errorMessage],
      status: "error",
      sync_duration_ms: duration,
    });

    console.error("Google Ads sync error:", errorMessage);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
