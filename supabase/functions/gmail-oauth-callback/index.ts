import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// HMAC helpers for signed OAuth state (prevents forging user_id linkage).
function htmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacKey(): Promise<CryptoKey> {
  // Use the service-role key as HMAC secret — it's stable, secret, and always available.
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SUPABASE_SERVICE_ROLE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signState(payloadObj: Record<string, unknown>): Promise<string> {
  const payload = JSON.stringify(payloadObj);
  const key = await hmacKey();
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  );
  return `${b64urlEncode(new TextEncoder().encode(payload))}.${b64urlEncode(sig)}`;
}

async function verifyState(
  stateParam: string,
): Promise<{ user_id: string; redirect_uri: string; nonce: string } | null> {
  const [payloadB64, sigB64] = stateParam.split(".");
  if (!payloadB64 || !sigB64) return null;
  try {
    const pad = (s: string) => s + "=".repeat((4 - (s.length % 4)) % 4);
    const fromB64Url = (s: string) =>
      Uint8Array.from(atob(pad(s.replace(/-/g, "+").replace(/_/g, "/"))), (c) => c.charCodeAt(0));
    const payloadBytes = fromB64Url(payloadB64);
    const sigBytes = fromB64Url(sigB64);
    const key = await hmacKey();
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, payloadBytes);
    if (!ok) return null;
    const parsed = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (typeof parsed?.user_id !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // ─── Step 1: Generate OAuth URL ───
    if (req.method === "POST") {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check role
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const userRoles = (roles || []).map((r: any) => r.role);
      if (!userRoles.includes("admin") && !userRoles.includes("sales_manager")) {
        return new Response(JSON.stringify({ error: "Forbidden: admin or sales_manager role required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.json().catch(() => ({}));
      const redirectUri = body.redirect_uri;
      if (!redirectUri) {
        return new Response(JSON.stringify({ error: "redirect_uri is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const callbackUrl = `${SUPABASE_URL}/functions/v1/gmail-oauth-callback`;
      const state = await signState({
        user_id: user.id,
        redirect_uri: redirectUri,
        nonce: crypto.randomUUID(),
      });

      const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      oauthUrl.searchParams.set("client_id", GMAIL_CLIENT_ID);
      oauthUrl.searchParams.set("redirect_uri", callbackUrl);
      oauthUrl.searchParams.set("response_type", "code");
      oauthUrl.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.readonly");
      oauthUrl.searchParams.set("access_type", "offline");
      oauthUrl.searchParams.set("prompt", "consent");
      oauthUrl.searchParams.set("state", state);

      const finalUrl = oauthUrl.toString();
      console.log("[Gmail OAuth] Generated URL:", finalUrl);
      console.log("[Gmail OAuth] Callback URL:", callbackUrl);
      console.log("[Gmail OAuth] Client ID:", GMAIL_CLIENT_ID?.substring(0, 20) + "...");
      console.log("[Gmail OAuth] Frontend redirect:", redirectUri);

      return new Response(JSON.stringify({ url: finalUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Step 2: Handle OAuth Callback (GET) ───
    if (req.method === "GET") {
      const code = url.searchParams.get("code");
      const stateParam = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        return new Response(`<html><body><h2>Authorization failed: ${htmlEscape(error)}</h2><script>window.close();</script></body></html>`, {
          headers: { "Content-Type": "text/html" },
        });
      }

      if (!code || !stateParam) {
        return new Response(`<html><body><h2>Missing authorization code</h2></body></html>`, {
          headers: { "Content-Type": "text/html" },
        });
      }

      const state = await verifyState(stateParam);
      if (!state) {
        return new Response(`<html><body><h2>Invalid state parameter</h2></body></html>`, {
          status: 400,
          headers: { "Content-Type": "text/html" },
        });
      }

      const callbackUrl = `${SUPABASE_URL}/functions/v1/gmail-oauth-callback`;

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GMAIL_CLIENT_ID,
          client_secret: GMAIL_CLIENT_SECRET,
          redirect_uri: callbackUrl,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        console.error("Token exchange failed:", tokenData.error);
        return new Response(`<html><body><h2>Token exchange failed</h2><script>setTimeout(()=>window.close(),3000);</script></body></html>`, {
          headers: { "Content-Type": "text/html" },
        });
      }

      // Get user email from Gmail
      const profileRes = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = await profileRes.json();
      const gmailEmail = profile.emailAddress || "unknown";

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Upsert integration
      const { error: upsertError } = await supabase
        .from("gmail_integrations")
        .upsert(
          {
            user_id: state.user_id,
            email: gmailEmail,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || "",
            token_expiry: tokenData.expires_in
              ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
              : null,
            is_active: true,
          },
          { onConflict: "user_id,email", ignoreDuplicates: false }
        );

      if (upsertError) {
        // If upsert fails due to no unique constraint, try insert/update manually
        const { data: existing } = await supabase
          .from("gmail_integrations")
          .select("id")
          .eq("user_id", state.user_id)
          .eq("email", gmailEmail)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("gmail_integrations")
            .update({
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token || existing.id, // keep old if not returned
              token_expiry: tokenData.expires_in
                ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
                : null,
              is_active: true,
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("gmail_integrations").insert({
            user_id: state.user_id,
            email: gmailEmail,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || "",
            token_expiry: tokenData.expires_in
              ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
              : null,
            is_active: true,
          });
        }
      }

      // Redirect back to the app
      const ALLOWED_ORIGINS = new Set([
        "https://xboom-flow.lovable.app",
        "https://xboomflow.com",
        "https://id-preview--873edcab-6e1e-46b0-9171-0a25ebe4e73c.lovable.app",
        "http://localhost:5173",
      ]);
      const DEFAULT_PATH = "/sales/leads/emails";
      let redirectUrl = DEFAULT_PATH;
      const candidate = typeof state.redirect_uri === "string" ? state.redirect_uri : "";
      if (candidate.startsWith("/") && !candidate.startsWith("//")) {
        redirectUrl = candidate;
      } else if (candidate) {
        try {
          const parsed = new URL(candidate);
          if (ALLOWED_ORIGINS.has(parsed.origin)) {
            redirectUrl = parsed.toString();
          }
        } catch {
          // fall through to default
        }
      }
      return new Response(null, {
        status: 302,
        headers: { Location: `${redirectUrl}?gmail_connected=true` },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Gmail OAuth error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
