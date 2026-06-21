import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ZOHO_ACCOUNTS_BASE = "https://accounts.zoho.com";

function htmlResponse(title: string, message: string, ok: boolean) {
  const color = ok ? "#16a34a" : "#dc2626";
  const body = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:32px 40px;max-width:480px;text-align:center}
h1{margin:0 0 12px;color:${color};font-size:20px}
p{margin:0;line-height:1.5;color:#cbd5e1}
button{margin-top:20px;padding:8px 18px;background:#3b82f6;color:#fff;border:0;border-radius:6px;cursor:pointer;font-size:14px}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p>
<button onclick="window.close()">Close window</button></div></body></html>`;
  return new Response(body, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");
    const location = url.searchParams.get("location"); // e.g. "us", "in"
    const accountsServer = url.searchParams.get("accounts-server");

    if (errorParam) {
      return htmlResponse("Zoho authorization failed", `Zoho returned: ${errorParam}`, false);
    }
    if (!code || !state) {
      return htmlResponse("Invalid callback", "Missing code or state parameter.", false);
    }

    const clientId = Deno.env.get("ZOHO_CLIENT_ID");
    const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!clientId || !clientSecret) {
      return htmlResponse("Configuration error", "Zoho client credentials not configured.", false);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Validate state
    const { data: stateRow, error: stateErr } = await supabase
      .from("zoho_oauth_states")
      .select("user_id, expires_at")
      .eq("state", state)
      .maybeSingle();
    if (stateErr || !stateRow) {
      return htmlResponse("Invalid state", "OAuth state token not recognized or expired.", false);
    }
    if (new Date(stateRow.expires_at).getTime() < Date.now()) {
      await supabase.from("zoho_oauth_states").delete().eq("state", state);
      return htmlResponse("Expired", "Authorization request expired. Please try again.", false);
    }

    // Consume state
    await supabase.from("zoho_oauth_states").delete().eq("state", state);

    // Exchange code for tokens
    const tokenBase = accountsServer || ZOHO_ACCOUNTS_BASE;
    const redirectUri = `${supabaseUrl}/functions/v1/zoho-oauth-callback`;
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });
    const tokenResp = await fetch(`${tokenBase}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });
    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || tokenData.error) {
      console.error("zoho token exchange failed", tokenData);
      return htmlResponse(
        "Token exchange failed",
        `Zoho rejected the authorization code: ${tokenData.error || tokenResp.status}`,
        false,
      );
    }

    const accessToken: string = tokenData.access_token;
    const refreshToken: string = tokenData.refresh_token;
    const expiresIn: number = tokenData.expires_in ?? 3600;
    const scope: string = tokenData.scope ?? "";
    const apiDomain: string =
      tokenData.api_domain ||
      (location === "in"
        ? "https://www.zohoapis.in"
        : location === "eu"
          ? "https://www.zohoapis.eu"
          : "https://www.zohoapis.com");

    if (!refreshToken) {
      return htmlResponse(
        "No refresh token",
        "Zoho did not return a refresh token. Re-authorize with prompt=consent.",
        false,
      );
    }

    // Fetch first organization ID
    let organizationId: string | null = null;
    try {
      const orgResp = await fetch(`${apiDomain}/books/v3/organizations`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      });
      const orgData = await orgResp.json();
      organizationId = orgData?.organizations?.[0]?.organization_id ?? null;
    } catch (e) {
      console.warn("Could not fetch zoho organizations:", e);
    }

    const expiresAt = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();

    const { error: upsertErr } = await supabase.from("zoho_tokens").upsert({
      provider: "zoho_books",
      access_token: accessToken,
      refresh_token: refreshToken,
      api_domain: apiDomain,
      organization_id: organizationId,
      scope,
      expires_at: expiresAt,
      connected_by: stateRow.user_id,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (upsertErr) {
      console.error("token upsert error", upsertErr);
      return htmlResponse("Storage failed", "Could not save Zoho tokens.", false);
    }

    return htmlResponse(
      "Zoho Books connected ✓",
      `Connected${organizationId ? ` to org ${organizationId}` : ""}. You can close this window and return to the app.`,
      true,
    );
  } catch (e) {
    console.error("zoho-oauth-callback error:", e);
    return htmlResponse("Unexpected error", String(e), false);
  }
});