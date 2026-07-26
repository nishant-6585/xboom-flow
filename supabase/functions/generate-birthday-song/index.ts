// Generate a personalized birthday song with ElevenLabs Music and tag it to
// an employee. HR/admin only.
//
// POST /functions/v1/generate-birthday-song
// Body: {
//   employee_id: string,
//   nickname?: string,
//   about?: string,        // hobbies, traits, fun facts from HR
//   style?: string,        // e.g. "Upbeat Pop", "Bollywood"
//   language?: string,     // e.g. "English", "Hindi", "Hinglish"
//   length_seconds?: number
// }
// Stores the MP3 in the private birthday-songs bucket, upserts the
// birthday_songs row (replacing any previous song) and returns a signed
// preview URL.

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

function buildPrompt(opts: {
  name: string;
  nickname?: string;
  about?: string;
  style?: string;
  language?: string;
}): string {
  const callName = opts.nickname?.trim() || opts.name.split(/\s+/)[0];
  const parts = [
    `A joyful, celebratory happy-birthday song for ${opts.name}${
      opts.nickname?.trim() ? ` (everyone calls them "${opts.nickname.trim()}")` : ""
    }.`,
    `The song must clearly sing the name "${callName}" several times and wish them a happy birthday.`,
  ];
  if (opts.about?.trim()) {
    parts.push(`Weave in these personal details about them: ${opts.about.trim()}.`);
  }
  parts.push(`Musical style: ${opts.style?.trim() || "upbeat feel-good pop"}.`);
  parts.push(`Language of the lyrics: ${opts.language?.trim() || "English"}.`);
  parts.push(
    "Keep it warm, fun and office-friendly — this plays on the company dashboard for the whole team.",
  );
  return parts.join(" ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: valid JWT with hr or admin role
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: roleRows } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roles = (roleRows || []).map((r: { role: string }) => r.role);
    if (!roles.includes("hr") && !roles.includes("admin")) {
      return json({ error: "Forbidden: HR or admin role required" }, 403);
    }

    const body = await req.json().catch(() => null);
    const employeeId: string | undefined = body?.employee_id;
    if (!employeeId) return json({ error: "employee_id is required" }, 400);

    const lengthSeconds = Math.min(180, Math.max(15, Number(body?.length_seconds) || 60));

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: employee, error: empError } = await admin
      .from("employees")
      .select("id, name")
      .eq("id", employeeId)
      .maybeSingle();
    if (empError || !employee) return json({ error: "Employee not found" }, 404);

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return json({ error: "ELEVENLABS_API_KEY not configured in project secrets" }, 500);
    }

    const prompt = buildPrompt({
      name: employee.name,
      nickname: body?.nickname,
      about: body?.about,
      style: body?.style,
      language: body?.language,
    });

    console.log(`[generate-birthday-song] employee=${employeeId} length=${lengthSeconds}s`);

    const elRes = await fetch(
      "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128",
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, music_length_ms: lengthSeconds * 1000 }),
      },
    );

    if (!elRes.ok) {
      const detail = await elRes.text().catch(() => "");
      console.error(`[generate-birthday-song] ElevenLabs ${elRes.status}: ${detail}`);
      return json(
        { error: `ElevenLabs music generation failed (${elRes.status})`, detail: detail.slice(0, 500) },
        502,
      );
    }

    const audio = new Uint8Array(await elRes.arrayBuffer());
    if (audio.byteLength === 0) {
      return json({ error: "ElevenLabs returned an empty audio file" }, 502);
    }

    // Remember the previous file so we can clean it up after a successful swap.
    const { data: existing } = await admin
      .from("birthday_songs")
      .select("file_path")
      .eq("employee_id", employeeId)
      .maybeSingle();

    const filePath = `${employeeId}/generated-${Date.now()}.mp3`;
    const { error: uploadError } = await admin.storage
      .from("birthday-songs")
      .upload(filePath, audio, { contentType: "audio/mpeg", upsert: true });
    if (uploadError) {
      console.error(`[generate-birthday-song] upload failed: ${uploadError.message}`);
      return json({ error: `Failed to store generated song: ${uploadError.message}` }, 500);
    }

    const title = `AI birthday song for ${employee.name}`;
    const { error: upsertError } = await admin
      .from("birthday_songs")
      .upsert(
        {
          employee_id: employeeId,
          file_path: filePath,
          title,
          source: "elevenlabs",
          generation_prompt: prompt,
          uploaded_by: user.id,
        },
        { onConflict: "employee_id" },
      );
    if (upsertError) {
      console.error(`[generate-birthday-song] upsert failed: ${upsertError.message}`);
      await admin.storage.from("birthday-songs").remove([filePath]);
      return json({ error: `Failed to tag song: ${upsertError.message}` }, 500);
    }

    if (existing?.file_path && existing.file_path !== filePath) {
      await admin.storage.from("birthday-songs").remove([existing.file_path]);
    }

    const { data: signed } = await admin.storage
      .from("birthday-songs")
      .createSignedUrl(filePath, 3600);

    return json({
      success: true,
      file_path: filePath,
      title,
      signed_url: signed?.signedUrl ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[generate-birthday-song] ${message}`);
    return json({ error: message }, 500);
  }
});
