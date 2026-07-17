import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_orders",
  title: "List orders",
  description: "List recent sales orders visible to the signed-in user.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum number of orders to return."),
    status: z.string().optional().describe("Filter by order status, e.g. 'po_received' or 'delivery_done'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_company, product_name, product_category, status, total_sales_amount, amount_paid, payment_status, order_date, sales_person_name",
      )
      .order("order_date", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }] };
  },
});
