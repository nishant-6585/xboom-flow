import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_leads",
  title: "List leads",
  description: "List recent leads from the unified lead feed visible to the signed-in user.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum number of leads to return."),
    source: z.string().optional().describe("Filter by lead source, e.g. 'website', 'google_ads', 'facebook'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, source }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("unified_lead_feed")
      .select(
        "source, source_row_id, name, phone, email, company, product_name, status, sales_person_name, created_at, disposition",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (source) q = q.eq("source", source);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }] };
  },
});
