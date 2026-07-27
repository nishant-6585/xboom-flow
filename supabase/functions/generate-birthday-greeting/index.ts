// Draft a personalized birthday greeting (email content) for an employee.
//
// POST /functions/v1/generate-birthday-greeting
// Body: { employee_id: string, nickname?: string, about?: string, tone?: string }
//
// HR/admin only. Loads the employee's name and department, asks the Lovable AI
// gateway for a short, warm birthday email message and returns it as plain
// text ({ greeting }). The caller edits/saves it to birthday_cards — nothing
// is persisted here.

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

const TONES = ["Warm & heartfelt", "Fun & playful", "Formal & professional"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY is not configured" }, 500);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roles = new Set((roleRows || []).map((r: { role: string }) => r.role));
    if (!roles.has("hr") && !roles.has("admin")) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null);
    const employeeId: string | undefined = body?.employee_id;
    if (!employeeId) return json({ error: "employee_id is required" }, 400);
    const nickname = String(body?.nickname || "").slice(0, 100);
    const about = String(body?.about || "").slice(0, 1000);
    const tone = TONES.includes(body?.tone) ? body.tone : TONES[0];

    const { data: employee, error: empError } = await admin
      .from("employees")
      .select("id, name, department, designation")
      .eq("id", employeeId)
      .maybeSingle();
    if (empError || !employee) return json({ error: "Employee not found" }, 404);

    const systemPrompt = `You write short birthday greeting emails sent by the HR team of XBoom, a drone technology company, to an employee on their birthday.

Rules:
- Write ONLY the email body text, 3-5 short sentences (60-120 words).
- Address the employee by name (or nickname if given). Warm and genuine, never cheesy corporate-speak.
- Weave in the personal details naturally when provided; never invent facts.
- No subject line, no placeholders, no markdown, no emojis at the start of lines (one or two emojis inside the text are fine).
- Sign off as "Team XBoom".
Return plain text only.`;

    const userPrompt = `Employee name: ${employee.name}
Nickname: ${nickname || "not given"}
Department: ${employee.department || "not given"}
Designation: ${employee.designation || "not given"}
Personal details from HR: ${about || "none"}
Tone: ${tone}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return json({ error: "Rate limit exceeded. Please try again in a moment." }, 429);
      }
      if (response.status === 402) {
        return json({ error: "AI credits exhausted. Please add credits in workspace settings." }, 402);
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return json({ error: "AI greeting generation failed" }, 500);
    }

    const data = await response.json();
    const greeting = data.choices?.[0]?.message?.content?.trim();
    if (!greeting) return json({ error: "No response from AI" }, 500);

    return json({ greeting });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[generate-birthday-greeting] ${message}`);
    return json({ error: message }, 500);
  }
});
