import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const guessMimeType = (fileName: string) => {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "csv") return "text/csv";
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "xls") return "application/vnd.ms-excel";
  return "application/octet-stream";
};

const sanitizeFileName = (fileName: string) => fileName.replace(/[^a-zA-Z0-9._() -]/g, "_");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    return respond({ error: "Server configuration error" }, 500);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const userId = claimsData.claims.sub;
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const allowedRoles = new Set((roles || []).map((role: { role: string }) => role.role));

    if (!allowedRoles.has("admin") && !allowedRoles.has("finance")) {
      return respond({ error: "Access denied" }, 403);
    }

    const body = await req.json().catch(() => null);
    const uploadId = typeof body?.upload_id === "string" ? body.upload_id.trim() : "";

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId)) {
      return respond({ error: "Invalid upload id" }, 400);
    }

    const { data: upload, error: uploadError } = await admin
      .from("statement_uploads")
      .select("id, uploaded_by, file_url, file_name")
      .eq("id", uploadId)
      .single();

    if (uploadError || !upload?.file_url) {
      return respond({ error: "Statement file not found" }, 404);
    }

    if (upload.uploaded_by !== userId) {
      return respond({ error: "Access denied" }, 403);
    }

    const { data: fileData, error: downloadError } = await admin.storage
      .from("cc-statements")
      .download(upload.file_url);

    if (downloadError || !fileData) {
      return respond({ error: "Could not load statement file" }, 500);
    }

    const fileName = sanitizeFileName(upload.file_name || "statement");

    return new Response(fileData, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": guessMimeType(fileName),
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("view-credit-card-statement error", error);
    return respond({ error: "Internal server error" }, 500);
  }
});
