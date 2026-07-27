// Email a birthday song to an employee.
//
// POST /functions/v1/email-birthday-song
// Body: { employee_id: string }
//
// Authorized callers:
//   - HR or admin (may email any employee)
//   - The employee themself, on the day of their birthday
//
// Resolves the recipient email server-side (employees.personal_email or the
// linked profile's email), creates 7-day signed URLs for the tagged birthday
// song and the birthday-card photo, and invokes send-transactional-email with
// the birthday-song template (song link + photo + HR's greeting message).
// Sends as long as the employee has a song OR a card (photo/greeting).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Signed URL lifetime for the emailed link. 7 days keeps things simple and
// comfortably outlasts the birthday.
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 3600;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const employeeId: string | undefined = body?.employee_id;
    if (!employeeId) return json({ error: "employee_id is required" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Load caller role(s)
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roles = new Set((roleRows || []).map((r: { role: string }) => r.role));
    const isPrivileged = roles.has("hr") || roles.has("admin");

    // Load employee + linked profile email
    const { data: employee, error: empError } = await admin
      .from("employees")
      .select("id, name, personal_email, xboom_email, user_id, date_of_birth")
      .eq("id", employeeId)
      .maybeSingle();
    if (empError || !employee) return json({ error: "Employee not found" }, 404);

    // If caller is not HR/admin, they must be the employee themself AND it
    // must be their birthday today (IST). We match on user_id.
    if (!isPrivileged) {
      if (!employee.user_id || employee.user_id !== user.id) {
        return json({ error: "Forbidden" }, 403);
      }
      // Birthday-today check in IST
      const dob = employee.date_of_birth as string | null;
      if (!dob) return json({ error: "Forbidden" }, 403);
      const istToday = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date()); // YYYY-MM-DD IST
      const [, mm, dd] = istToday.split("-");
      const [, dobMm, dobDd] = dob.split("-");
      if (mm !== dobMm || dd !== dobDd) {
        return json({ error: "You can only email your song on your birthday" }, 403);
      }
    }

    // Resolve recipient email: personal → linked profile → work email
    let recipient: string | null = employee.personal_email || null;
    if (!recipient && employee.user_id) {
      const { data: prof } = await admin
        .from("profiles")
        .select("email")
        .eq("user_id", employee.user_id)
        .maybeSingle();
      recipient = prof?.email || null;
    }
    if (!recipient) recipient = employee.xboom_email || null;
    if (!recipient) {
      return json({ error: "No email on file for this employee" }, 400);
    }

    // Load the tagged song and the birthday card (photo + greeting)
    const [{ data: song }, { data: card }] = await Promise.all([
      admin
        .from("birthday_songs")
        .select("file_path, title")
        .eq("employee_id", employeeId)
        .maybeSingle(),
      admin
        .from("birthday_cards")
        .select("photo_path, greeting_message")
        .eq("employee_id", employeeId)
        .maybeSingle(),
    ]);
    if (!song && !card?.photo_path && !card?.greeting_message) {
      return json({ error: "No birthday song or card set up for this employee yet" }, 404);
    }

    // Create a longer-lived signed URL with download disposition
    let songUrl: string | null = null;
    let songTitle: string | null = null;
    if (song) {
      const safeName = (song.title || `birthday-song-${employee.name}`)
        .replace(/[^\w\s.-]+/g, "")
        .replace(/\s+/g, "-") + ".mp3";
      const { data: signed, error: signError } = await admin.storage
        .from("birthday-songs")
        .createSignedUrl(song.file_path, SIGNED_URL_TTL_SECONDS, { download: safeName });
      if (signError || !signed?.signedUrl) {
        return json({ error: `Couldn't build download link: ${signError?.message}` }, 500);
      }
      songUrl = signed.signedUrl;
      songTitle = song.title;
    }

    // Signed URL for the card photo (inline display, not download)
    let photoUrl: string | null = null;
    if (card?.photo_path) {
      const { data: signedPhoto, error: photoError } = await admin.storage
        .from("birthday-cards")
        .createSignedUrl(card.photo_path, SIGNED_URL_TTL_SECONDS);
      if (photoError || !signedPhoto?.signedUrl) {
        console.error(`[email-birthday-song] photo sign failed: ${photoError?.message}`);
      } else {
        photoUrl = signedPhoto.signedUrl;
      }
    }

    // Send via the transactional email pipeline
    const { error: sendError } = await admin.functions.invoke(
      "send-transactional-email",
      {
        body: {
          templateName: "birthday-song",
          recipientEmail: recipient,
          idempotencyKey: `birthday-song-${employeeId}-${new Date().toISOString().slice(0, 10)}`,
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
    if (sendError) {
      console.error(`[email-birthday-song] send failed: ${sendError.message}`);
      return json({ error: `Failed to send email: ${sendError.message}` }, 500);
    }

    return json({ success: true, recipient });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email-birthday-song] ${message}`);
    return json({ error: message }, 500);
  }
});