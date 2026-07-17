import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_order",
  title: "Get order details",
  description: "Fetch detailed information about a specific order by its ID or order number.",
  inputSchema: {
    id: z.string().optional().describe("Order UUID."),
    order_number: z.string().optional().describe("Human-readable order number."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, order_number }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx).from("orders").select("*").limit(1);
    if (id) q = q.eq("id", id);
    else if (order_number) q = q.eq("order_number", order_number);
    else return { content: [{ type: "text", text: "Provide id or order_number" }], isError: true };
    const { data, error } = await q.maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Order not found" }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
});
