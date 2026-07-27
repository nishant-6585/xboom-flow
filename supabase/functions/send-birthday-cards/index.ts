// Daily birthday-card dispatch: emails every employee whose birthday is today.
//
// POST /functions/v1/send-birthday-cards
// Invoked by pg_cron each morning (x-cron-secret), or manually by HR/admin
// (Authorization JWT) to re-run today's batch.
//
// For each active employee whose birthday is today (IST, Feb-29 falls on
// Feb-28 in non-leap years): resolve their email, sign 7-day URLs for the
// tagged song and card photo, and send the birthday-song template with HR's
// greeting message. Employees with no song AND no card still get the email —
// the template falls back to a generic birthday wish.
//
// Duplicate safety: skips anyone who already has a birthday-song email logged
// today (covers cron re-runs and manual sends from the HR panel).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SIGNED_URL_TTL_SECONDS = 7 * 24 * 3600;

// IST "today" as YYYY-MM-DD.
function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

// Mirrors public.is_birthday_today(): month matches, and today's day equals
// min(dob day, last day of the current month) so Feb-29 birthdays are
// celebrated on Feb-28 in non-leap years.
export function isBirthdayOn(dobIso: string, todayIso: string): boolean {
  const [ty, tm, td] = todayIso.split("-").map(Number);
  const [, dm, dd] = dobIso.split("-").map(Number);
  if (dm !== tm) return false;
  const lastDayOfMonth = new Date(ty, tm, 0).getDate();
  return td === Math.min(dd, lastDayOfMonth);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET");

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Auth: cron secret, or an HR/admin JWT for manual re-runs.
    const cronHeader = req.headers.get("x-cron-secret");
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;
    if (!isCron) {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) return json({ error: "Unauthorized" }, 401);
      const { data: roleRows } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const roles = new Set((roleRows || []).map((r: { role: string }) => r.role));
      if (!roles.has("hr") && !roles.has("admin")) return json({ error: "Forbidden" }, 403);
    }

    const today = istToday();

    const { data: employees, error: empError } = await admin
      .from("employees")
      .select("id, name, personal_email, profile_id, date_of_birth")
      .eq("is_active", true)
      .not("date_of_birth", "is", null);
    if (empError) return json({ error: empError.message }, 500);

    const celebrants = (employees || []).filter((e) => isBirthdayOn(e.date_of_birth!, today));
    if (celebrants.length === 0) {
      return json({ ok: true, date: today, sent: [], skipped: [], failed: [] });
    }

    const sent: string[] = [];
    const skipped: { name: string; reason: string }[] = [];
    const failed: { name: string; reason: string }[] = [];

    for (const employee of celebrants) {
      try {
        // Resolve recipient email
        let recipient: string | null = employee.personal_email || null;
        if (!recipient && employee.profile_id) {
          const { data: prof } = await admin
            .from("profiles")
            .select("email")
            .eq("id", employee.profile_id)
            .maybeSingle();
          recipient = prof?.email || null;
        }
        if (!recipient) {
          skipped.push({ name: employee.name, reason: "no email on file" });
          continue;
        }

        // Already emailed today? (cron re-run, or HR sent manually)
        const idempotencyKey = `birthday-song-${employee.id}-${today}`;
        const { data: priorLog } = await admin
          .from("email_send_log")
          .select("id")
          .eq("template_name", "birthday-song")
          .contains("metadata", { idempotency_key: idempotencyKey })
          .limit(1);
        if (priorLog && priorLog.length > 0) {
          skipped.push({ name: employee.name, reason: "already sent today" });
          continue;
        }

        // Load song + card
        const [{ data: song }, { data: card }] = await Promise.all([
          admin
            .from("birthday_songs")
            .select("file_path, title")
            .eq("employee_id", employee.id)
            .maybeSingle(),
          admin
            .from("birthday_cards")
            .select("photo_path, greeting_message")
            .eq("employee_id", employee.id)
            .maybeSingle(),
        ]);

        let songUrl: string | null = null;
        let songTitle: string | null = null;
        if (song) {
          const safeName = (song.title || `birthday-song-${employee.name}`)
            .replace(/[^\w\s.-]+/g, "")
            .replace(/\s+/g, "-") + ".mp3";
          const { data: signed } = await admin.storage
            .from("birthday-songs")
            .createSignedUrl(song.file_path, SIGNED_URL_TTL_SECONDS, { download: safeName });
          if (signed?.signedUrl) {
            songUrl = signed.signedUrl;
            songTitle = song.title;
          }
        }

        let photoUrl: string | null = null;
        if (card?.photo_path) {
          const { data: signedPhoto } = await admin.storage
            .from("birthday-cards")
            .createSignedUrl(card.photo_path, SIGNED_URL_TTL_SECONDS);
          photoUrl = signedPhoto?.signedUrl ?? null;
        }

        const { error: sendError } = await admin.functions.invoke(
          "send-transactional-email",
          {
            body: {
              templateName: "birthday-song",
              recipientEmail: recipient,
              idempotencyKey,
              templateData: {
                name: employee.name.split(/\s+/)[0],
                song_url: songUrl,
                song_title: songUrl ? (songTitle || `Birthday song for ${employee.name}`) : null,
                photo_url: photoUrl,
                greeting_message: card?.greeting_message || null,
                expires_hint: "This link works for the next 7 days.",
                site_url: "https://xboomflow.com",
              },
            },
          },
        );
        if (sendError) throw new Error(sendError.message);

        sent.push(employee.name);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[send-birthday-cards] ${employee.name}: ${reason}`);
        failed.push({ name: employee.name, reason });
      }
    }

    // Summary notification for HR when anything was sent or failed.
    if (sent.length > 0 || failed.length > 0) {
      const parts = [];
      if (sent.length > 0) parts.push(`Sent to ${sent.join(", ")}.`);
      if (failed.length > 0) {
        parts.push(`Failed for ${failed.map((f) => `${f.name} (${f.reason})`).join(", ")}.`);
      }
      await admin.from("notifications").insert({
        type: "birthday_cards",
        title: "🎂 Birthday card emails",
        message: parts.join(" ").slice(0, 900),
        target_role: "hr",
      });
    }

    return json({ ok: true, date: today, sent, skipped, failed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[send-birthday-cards] ${message}`);
    return json({ error: message }, 500);
  }
});
