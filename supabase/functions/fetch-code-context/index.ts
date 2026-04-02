import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// Module → relevant file paths mapping
const MODULE_FILE_MAP: Record<string, string[]> = {
  tickets: [
    "src/components/tickets/",
    "src/hooks/useTicket",
    "src/hooks/useTicketAi.ts",
    "supabase/functions/resolve-ticket-ai/index.ts",
    "supabase/functions/analyze-ticket/index.ts",
    "supabase/functions/check-sla-risk/index.ts",
  ],
  technical_support: [
    "src/components/tickets/",
    "src/hooks/useTicket",
    "src/hooks/useTicketAi.ts",
    "supabase/functions/resolve-ticket-ai/index.ts",
  ],
  orders: [
    "src/components/orders/",
    "src/hooks/useOrders",
    "supabase/functions/shopify-order-processor/index.ts",
    "supabase/functions/send-order-notification/index.ts",
  ],
  inventory: [
    "src/components/inventory/",
    "src/hooks/useInventory",
    "supabase/functions/low-stock-alerts/index.ts",
    "supabase/functions/demand-forecast/index.ts",
  ],
  attendance: [
    "src/components/attendance/",
    "src/hooks/useAttendance",
    "supabase/functions/auto-checkout/index.ts",
    "supabase/functions/attendance-nudge/index.ts",
  ],
  leads: [
    "src/components/leads/",
    "src/components/enquiries/",
    "src/hooks/useEnquiries",
    "supabase/functions/ai-lead-scoring/index.ts",
  ],
  hr: [
    "src/components/hr/",
    "src/hooks/useEmployees",
    "supabase/functions/approve-invitation/index.ts",
  ],
  general: [
    "src/hooks/useAuth",
    "src/App.tsx",
  ],
};

// Keyword-based file discovery
const KEYWORD_FILE_MAP: Record<string, string[]> = {
  auth: ["src/hooks/useAuth", "src/components/auth/"],
  login: ["src/hooks/useAuth", "src/components/auth/"],
  edge_function: ["supabase/functions/"],
  shopify: ["supabase/functions/shopify-webhook/index.ts", "supabase/functions/shopify-order-processor/index.ts"],
  slack: ["supabase/functions/send-slack-notification/index.ts"],
  email: ["supabase/functions/send-ticket-email/index.ts", "supabase/functions/send-order-notification/index.ts"],
  payment: ["src/components/orders/", "supabase/functions/payment-risk-scoring/index.ts"],
};

const GITHUB_REPO = "AmanSagar0607/XBoom-Flow"; // Update if repo name differs
const MAX_FILES = 15;
const MAX_LINES_PER_FILE = 200;

// In-memory cache (lives for function invocation warm period ~5-60 min)
const fileCache = new Map<string, { content: string; fetchedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchGithubFile(path: string): Promise<string | null> {
  if (!GITHUB_TOKEN) return null;

  // Check in-memory cache
  const cached = fileCache.get(path);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.content;
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3.raw",
          "User-Agent": "XboomFlow-AI",
        },
      }
    );

    if (!res.ok) {
      if (res.status === 403) {
        console.warn("GitHub rate limit hit");
      }
      await res.text(); // consume body
      return null;
    }

    const content = await res.text();
    fileCache.set(path, { content, fetchedAt: Date.now() });
    return content;
  } catch (e) {
    console.warn(`Failed to fetch ${path}:`, e);
    return null;
  }
}

async function fetchGithubDirectory(dirPath: string): Promise<string[]> {
  if (!GITHUB_TOKEN) return [];

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${dirPath}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "XboomFlow-AI",
        },
      }
    );

    if (!res.ok) {
      await res.text();
      return [];
    }

    const items = await res.json();
    if (!Array.isArray(items)) return [];

    return items
      .filter((item: { type: string; name: string }) =>
        item.type === "file" &&
        (item.name.endsWith(".ts") || item.name.endsWith(".tsx"))
      )
      .map((item: { path: string }) => item.path)
      .slice(0, 5); // Max 5 files per directory
  } catch {
    return [];
  }
}

function stripComments(code: string): string {
  return code
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== "" && !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .slice(0, MAX_LINES_PER_FILE)
    .join("\n");
}

function extractKeywords(text: string): string[] {
  const keywords: string[] = [];
  const lower = text.toLowerCase();
  for (const kw of Object.keys(KEYWORD_FILE_MAP)) {
    if (lower.includes(kw)) {
      keywords.push(kw);
    }
  }
  return keywords;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const { data: { user }, error: authError } = await createClient(
      SUPABASE_URL,
      anonKey
    ).auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { category, description } = await req.json();

    if (!GITHUB_TOKEN) {
      return new Response(
        JSON.stringify({ context: "", message: "GitHub token not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine files to fetch
    const filePaths = new Set<string>();

    // Category-based files
    const categoryPaths = MODULE_FILE_MAP[category] || MODULE_FILE_MAP["general"];
    for (const p of categoryPaths) {
      filePaths.add(p);
    }

    // Keyword-based files from description
    if (description) {
      const keywords = extractKeywords(description);
      for (const kw of keywords) {
        for (const p of KEYWORD_FILE_MAP[kw] || []) {
          filePaths.add(p);
        }
      }
    }

    // Resolve directories and fetch files
    const resolvedFiles: string[] = [];
    for (const p of filePaths) {
      if (resolvedFiles.length >= MAX_FILES) break;

      if (p.endsWith("/")) {
        // It's a directory — list files
        const dirFiles = await fetchGithubDirectory(p);
        for (const f of dirFiles) {
          if (resolvedFiles.length >= MAX_FILES) break;
          resolvedFiles.push(f);
        }
      } else {
        resolvedFiles.push(p);
      }
    }

    // Fetch file contents in parallel (batches of 5)
    const snippets: string[] = [];
    for (let i = 0; i < resolvedFiles.length; i += 5) {
      const batch = resolvedFiles.slice(i, i + 5);
      const results = await Promise.all(batch.map(fetchGithubFile));
      for (let j = 0; j < batch.length; j++) {
        if (results[j]) {
          const stripped = stripComments(results[j]!);
          if (stripped.length > 50) {
            snippets.push(`--- FILE: ${batch[j]} ---\n${stripped}`);
          }
        }
      }
    }

    const context = snippets.join("\n\n");

    return new Response(
      JSON.stringify({
        context,
        files_fetched: resolvedFiles.length,
        files_with_content: snippets.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-code-context error:", error);
    return new Response(
      JSON.stringify({ context: "", error: "Internal server error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
