import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SUBJECT_ALLOWLIST = ["[XBOOM contact]", "[XBOOM popup]"];

function parseXboomFormBody(bodyText: string): Record<string, string> | null {
  if (!bodyText) return null;

  const knownKeys = [
    "intent", "name", "company", "email", "phone",
    "location", "city", "timeline", "message", "product", "quantity",
  ];

  const result: Record<string, string> = {};
  let currentKey: string | null = null;

  for (const rawLine of bodyText.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^([A-Za-z][A-Za-z _-]{0,30}):\s*(.*)$/);
    if (match) {
      const key = match[1].trim().toLowerCase().replace(/\s+/g, "_");
      if (knownKeys.includes(key)) {
        currentKey = key;
        result[key] = match[2].trim();
        continue;
      }
    }

    if (currentKey === "message" && line) {
      result[currentKey] = (result[currentKey] ? result[currentKey] + "\n" : "") + line;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function extractPhone(text: string): string | null {
  if (!text) return null;
  const match = text.match(/(?:\+?\d[\d\s-]{7,}\d)|(?:\b\d{10,15}\b)/);
  return match ? match[0].replace(/[^\d+]/g, "") : null;
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const cleaned = extractPhone(phone);
  return cleaned || null;
}

function deriveSubject(subject: string | null, notes: string | null): string | null {
  const trimmedSubject = subject?.trim() || "";
  if (trimmedSubject && SUBJECT_ALLOWLIST.some((token) => trimmedSubject.toLowerCase().includes(token.toLowerCase()))) {
    return trimmedSubject;
  }

  const noteSubject = notes?.match(/^Subject:\s*(.+)$/im)?.[1]?.trim() || "";
  if (noteSubject && SUBJECT_ALLOWLIST.some((token) => noteSubject.toLowerCase().includes(token.toLowerCase()))) {
    return noteSubject;
  }

  return trimmedSubject || noteSubject || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedCronSecret = Deno.env.get("CRON_SECRET");

    if (!authHeader && (!cronSecret || cronSecret !== expectedCronSecret)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userError } = await serviceClient.auth.getUser(token);

      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: roles } = await serviceClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const allowedRoles = ["admin", "sales_manager"];
      const hasAccess = (roles || []).some((entry: { role: string }) => allowedRoles.includes(entry.role));
      if (!hasAccess) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const limit = Math.min(Math.max(Number(body?.limit) || 500, 1), 2000);

    const { data: leads, error: fetchError } = await serviceClient
      .from("email_leads")
      .select("id, mail_source, phone_number, subject, notes, body_text")
      .eq("mail_source", "gmail:contact@xboom.in")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (fetchError) {
      throw fetchError;
    }

    let scanned = 0;
    let updated = 0;
    const changes: Array<{ id: string; phone_before: string | null; phone_after: string | null; subject_before: string | null; subject_after: string | null }> = [];

    for (const lead of leads || []) {
      scanned += 1;
      const parsed = parseXboomFormBody(lead.body_text || "");
      const nextPhone = normalizePhone(parsed?.phone || lead.phone_number || lead.body_text || lead.notes || null);
      const nextSubject = deriveSubject(lead.subject, lead.notes);

      const phoneBefore = lead.phone_number || null;
      const subjectBefore = lead.subject || null;
      const phoneChanged = (phoneBefore || null) !== (nextPhone || null);
      const subjectChanged = (subjectBefore || null) !== (nextSubject || null);

      if (!phoneChanged && !subjectChanged) continue;

      changes.push({
        id: lead.id,
        phone_before: phoneBefore,
        phone_after: nextPhone,
        subject_before: subjectBefore,
        subject_after: nextSubject,
      });

      if (!dryRun) {
        const { error: updateError } = await serviceClient
          .from("email_leads")
          .update({
            phone_number: nextPhone,
            subject: nextSubject,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lead.id);

        if (updateError) {
          throw updateError;
        }
      }

      updated += 1;
    }

    return new Response(JSON.stringify({
      success: true,
      dry_run: dryRun,
      scanned,
      updated,
      sample_changes: changes.slice(0, 20),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("backfill-contact-email-leads error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});