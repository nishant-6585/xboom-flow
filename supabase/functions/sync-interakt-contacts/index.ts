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
  phoneNumber?: string;
  phone_number?: string;
  countryCode?: string;
  country_code?: string;
  traits?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Verify user with their JWT
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

    // Parse optional body for last_synced_at filter
    let filters: Array<Record<string, string>> = [];
    try {
      const body = await req.json();
      if (body?.last_synced_at) {
        filters = [
          { trait: "created_at_utc", op: "gt", val: body.last_synced_at },
        ];
      }
    } catch {
      // No body or invalid JSON - fetch all
    }

    // Fetch contacts from Interakt with pagination
    let offset = 0;
    let hasNextPage = true;
    const allContacts: InteraktUser[] = [];

    while (hasNextPage) {
      const requestBody: Record<string, unknown> = {};
      if (filters.length > 0) {
        requestBody.filters = filters;
      }

      const interaktRes = await fetch(
        `${INTERAKT_API_URL}?offset=${offset}&limit=${PAGE_LIMIT}`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${interaktApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
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
      const users = data?.users || data?.results || [];
      allContacts.push(...users);

      hasNextPage = data?.has_next_page === true;
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

    // Get existing phone numbers for duplicate detection
    const { data: existingLeads } = await serviceClient
      .from("interakt_leads")
      .select("phone_number");

    const existingPhones = new Set(
      (existingLeads || []).map((l: { phone_number: string }) => l.phone_number)
    );

    // Prepare batch insert
    let created = 0;
    let skipped = 0;
    const newLeads: Array<Record<string, unknown>> = [];

    for (const contact of allContacts) {
      const rawPhone = contact.phoneNumber || contact.phone_number || "";
      if (!rawPhone) {
        skipped++;
        continue;
      }

      const countryCode = contact.countryCode || contact.country_code || "+91";
      const normalizedPhone = normalizePhone(rawPhone, countryCode);

      if (existingPhones.has(normalizedPhone)) {
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

      newLeads.push({
        customer_name: name,
        phone_number: normalizedPhone,
        country_code: countryCode.startsWith("+") ? countryCode : `+${countryCode}`,
        email,
        source: "Interakt",
        status: "new",
        interakt_user_id: contact.id || null,
        interakt_traits: traits,
        synced_by: userData.user.id,
      });

      existingPhones.add(normalizedPhone);
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
        // Continue with remaining chunks
      }
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
