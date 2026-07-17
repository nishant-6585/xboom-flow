import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_inventory",
  title: "Search inventory",
  description: "Search inventory items by product name or category.",
  inputSchema: {
    query: z.string().optional().describe("Search term for product name."),
    category: z.string().optional().describe("Filter by product category."),
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum results to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, category, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("inventory")
      .select("id, product_name, product_category, current_stock, min_stock_level, notes, updated_at")
      .order("product_name", { ascending: true })
      .limit(limit);
    if (query) q = q.ilike("product_name", `%${query}%`);
    if (category) q = q.eq("product_category", category);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }] };
  },
});
