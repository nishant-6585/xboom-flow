import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INTERAKT_API_URL = "https://api.interakt.ai/v1/public/apis/users/";
const PAGE_LIMIT = 100;

function normalizePhone(phone: string, countryCode?: string): string {
  // Strip all non-digit characters
  let digits = phone.replace(/\D/g, "");

  // If starts with 0, remove it
  if (digits.startsWith("0")) {
    digits = digits.substring(1);
  }

  // If already has country code (e.g. 91XXXXXXXXXX), keep last 10 digits
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }

  // Default country code to +91
  const code = countryCode?.replace(/\D/g, "") || "91";
  return `+${code}${digits}`;
}

interface InteraktUser {
  id?: string;
  userId?: string;
  phoneNumber?: string;
  phone_number?: string;
  fullPhoneNumber?: string;
  full_phone_number?: string;
  countryCode?: string;
  country_code?: string;
  traits?: Record<string, unknown>;
  created_at?: string;
  created_at_utc?: string;
  createdAt?: string;
}

function extractContactsFromResponse(payload: unknown): InteraktUser[] {
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  const nestedData =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : undefined;

  const candidates = [
    record.users,
    record.results,
    record.contacts,
    nestedData?.users,
    nestedData?.results,
    nestedData?.contacts,
    nestedData?.customers,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as InteraktUser[];
    }
  }

  return [];
}

function extractHasNextPage(payload: unknown, currentBatchSize: number): boolean {
  if (!payload || typeof payload !== "object") {
    return currentBatchSize === PAGE_LIMIT;
  }

  const record = payload as Record<string, unknown>;
  const directFlag = record.has_next_page;
  const nestedFlag = (record.data as Record<string, unknown> | undefined)?.has_next_page;

  if (typeof directFlag === "boolean") return directFlag;
  if (typeof nestedFlag === "boolean") return nestedFlag;

  return currentBatchSize === PAGE_LIMIT;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const interaktApiKey = Deno.env.get("INTERAKT_API_KEY");

    if (!interaktApiKey) {
      return new Response(
        JSON.stringify({ error: "Interakt API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Determine if this is a cron (automated) call or a user-initiated call
    let syncedByUserId: string | null = null;
    const authHeader = req.headers.get("Authorization");

    if (authHeader && !authHeader.includes(Deno.env.get("SUPABASE_ANON_KEY")!.slice(-20))) {
      // User-initiated call — verify JWT
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: authError } = await userClient.auth.getUser();
      if (authError || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      syncedByUserId = userData.user.id;

      // Use service client for DB operations
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

      // Check user has appropriate role
      const { data: roles } = await serviceClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id);

      const allowedRoles = ["admin", "sales_manager", "sales"];
      const hasAccess = roles?.some((r: { role: string }) => allowedRoles.includes(r.role));
      if (!hasAccess) {
        return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Use service client for DB operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Interakt requires a non-empty filters array.
    // For full syncs, use a broad created_at_utc lower bound instead of sending [] or omitting filters.
    let filters: Array<Record<string, string>> = [
      { trait: "created_at_utc", op: "gt", val: "1970-01-01T00:00:00.000Z" },
    ];
    let bodyLastSynced: string | null = null;
    try {
      const body = await req.json();
      if (body?.last_synced_at) {
        bodyLastSynced = body.last_synced_at;
      }
    } catch {
      // No body or invalid JSON - use default full-sync filter
    }

    // Auto-incremental: if caller did not supply last_synced_at, derive it from the
    // most recent interakt_created_at already in the DB. This prevents the sync
    // from re-paginating through old contacts and hitting the 1000-row safety cap
    // before any new leads are reached.
    const serviceClientForLookup = createClient(supabaseUrl, supabaseServiceKey);
    let effectiveLastSynced = bodyLastSynced;
    if (!effectiveLastSynced) {
      const { data: latest } = await serviceClientForLookup
        .from("interakt_leads")
        .select("interakt_created_at")
        .not("interakt_created_at", "is", null)
        .order("interakt_created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest?.interakt_created_at) {
        // Subtract 1 minute to handle clock skew / boundary inserts
        const t = new Date(latest.interakt_created_at).getTime() - 60_000;
        effectiveLastSynced = new Date(t).toISOString();
      }
    }
    if (effectiveLastSynced) {
      filters = [{ trait: "created_at_utc", op: "gt", val: effectiveLastSynced }];
    }
    console.log(JSON.stringify({ event: "interakt_sync_start", effectiveLastSynced }));

    // Fetch contacts from Interakt with pagination
    let offset = 0;
    let hasNextPage = true;
    const allContacts: InteraktUser[] = [];

    while (hasNextPage) {
      const interaktRes = await fetch(
        `${INTERAKT_API_URL}?offset=${offset}&limit=${PAGE_LIMIT}`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${interaktApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ filters }),
        }
      );

      if (!interaktRes.ok) {
        const errText = await interaktRes.text();
        console.error(`Interakt API error [${interaktRes.status}]:`, errText);

        let interaktMessage = "Failed to fetch contacts from Interakt";
        try {
          const parsed = JSON.parse(errText);
          interaktMessage =
            parsed?.message || parsed?.error || parsed?.errors?.[0]?.message || interaktMessage;
        } catch {
          if (errText?.trim()) interaktMessage = errText.trim();
        }

        return new Response(
          JSON.stringify({ error: interaktMessage }),
          {
            status: interaktRes.status >= 400 && interaktRes.status < 500 ? 400 : 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const data = await interaktRes.json();
      const users = extractContactsFromResponse(data);
      allContacts.push(...users);

      console.log(
        JSON.stringify({
          event: "interakt_sync_page",
          offset,
          batch_size: users.length,
          has_next_page: extractHasNextPage(data, users.length),
          response_keys: data && typeof data === "object" ? Object.keys(data as Record<string, unknown>) : [],
          nested_data_keys:
            data &&
            typeof data === "object" &&
            (data as Record<string, unknown>).data &&
            typeof (data as Record<string, unknown>).data === "object"
              ? Object.keys((data as Record<string, unknown>).data as Record<string, unknown>)
              : [],
        })
      );

      hasNextPage = extractHasNextPage(data, users.length);
      offset += PAGE_LIMIT;

      // Safety: max 10 pages (1000 contacts per sync)
      if (offset >= 1000) break;
    }

    if (allContacts.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No new contacts found",
          created: 0,
          skipped: 0,
          total_fetched: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get existing leads for duplicate detection and date repair
    const { data: existingLeads } = await serviceClient
      .from("interakt_leads")
      .select("phone_number, interakt_created_at");

    const existingLeadMap = new Map(
      (existingLeads || []).map((lead: { phone_number: string; interakt_created_at: string | null }) => [
        lead.phone_number,
        lead.interakt_created_at,
      ])
    );
    const existingPhones = new Set(existingLeadMap.keys());

    // Prepare batch insert
    let created = 0;
    let skipped = 0;
    const newLeads: Array<Record<string, unknown>> = [];
    const leadsToRepair: Array<{ phone: string; created_at: string }> = [];

    // Current sync timestamp — still useful as the sync event time fallback
    const syncTimestamp = new Date().toISOString();

    for (const contact of allContacts) {
      const rawPhone =
        contact.phoneNumber ||
        contact.phone_number ||
        contact.fullPhoneNumber ||
        contact.full_phone_number ||
        "";
      if (!rawPhone) {
        skipped++;
        continue;
      }

      const countryCode = contact.countryCode || contact.country_code || "+91";
      const normalizedPhone = normalizePhone(rawPhone, countryCode);
      const actualCreatedAt = contact.created_at_utc || contact.created_at || contact.createdAt || syncTimestamp;

      if (existingPhones.has(normalizedPhone)) {
        const existingCreatedAt = existingLeadMap.get(normalizedPhone);

        if (!existingCreatedAt || new Date(existingCreatedAt).getTime() > new Date(actualCreatedAt).getTime()) {
          leadsToRepair.push({
            phone: normalizedPhone,
            created_at: actualCreatedAt,
          });
        }

        skipped++;
        continue;
      }

      const traits = contact.traits || {};
      const name =
        (traits.name as string) ||
        (traits.Name as string) ||
        `Contact ${normalizedPhone}`;
      const email =
        (traits.email as string) || (traits.Email as string) || null;
      const city =
        (traits.city as string) || (traits.City as string) || (traits.location as string) || null;
      const productName =
        (traits.product as string) || (traits.Product as string) || (traits.product_name as string) || null;
      const company =
        (traits.company as string) || (traits.Company as string) || (traits.organization as string) || null;

      newLeads.push({
        customer_name: name,
        phone_number: normalizedPhone,
        country_code: countryCode.startsWith("+") ? countryCode : `+${countryCode}`,
        email,
        city,
        product_name: productName,
        company,
        source: "Interakt",
        status: "new",
        interakt_user_id: contact.id || contact.userId || null,
        interakt_traits: traits,
        interakt_created_at: actualCreatedAt,
        synced_by: syncedByUserId,
      });

      existingPhones.add(normalizedPhone);
      existingLeadMap.set(normalizedPhone, actualCreatedAt);
      created++;
    }

    // Batch insert in chunks of 50
    const CHUNK_SIZE = 50;
    for (let i = 0; i < newLeads.length; i += CHUNK_SIZE) {
      const chunk = newLeads.slice(i, i + CHUNK_SIZE);
      const { error: insertError } = await serviceClient
        .from("interakt_leads")
        .insert(chunk);

      if (insertError) {
        console.error("Insert error for chunk:", insertError.message);
      }
    }

    // Repair incorrect/missing interakt_created_at values on existing leads
    let backfilled = 0;
    for (const item of leadsToRepair) {
      const { error: updateError } = await serviceClient
        .from("interakt_leads")
        .update({ interakt_created_at: item.created_at })
        .eq("phone_number", item.phone);

      if (!updateError) backfilled++;
    }

    console.log(
      `Interakt sync complete: ${created} created, ${skipped} skipped, ${allContacts.length} fetched`
    );

    return new Response(
      JSON.stringify({
        success: true,
        created,
        skipped,
        total_fetched: allContacts.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
