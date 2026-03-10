import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Tool definitions for querying different modules
const DATA_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "query_orders",
      description: "Search orders by customer name, order number, status, product, or date range. Returns order details including amounts, payment status, and delivery info.",
      parameters: {
        type: "object" as const,
        properties: {
          search: { type: "string" as const, description: "Search term (customer name, order number, product)" },
          status: { type: "string" as const, description: "Filter by status: pending, confirmed, dispatched, delivered, cancelled" },
          payment_status: { type: "string" as const, description: "Filter by payment: pending, partial, paid" },
          date_from: { type: "string" as const, description: "Start date filter (ISO format YYYY-MM-DD)" },
          date_to: { type: "string" as const, description: "End date filter (ISO format YYYY-MM-DD)" },
          limit: { type: "number" as const, description: "Max results (default 20)" },
        },
        required: [] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_enquiries",
      description: "Search sales enquiries/leads by customer, product, status, salesperson, or date range. Returns lead details, temperature, and conversion info.",
      parameters: {
        type: "object" as const,
        properties: {
          search: { type: "string" as const, description: "Search term (customer name, company, product)" },
          status: { type: "string" as const, description: "Filter by status: new, responded, converted, closed" },
          lead_temperature: { type: "string" as const, description: "Filter: hot, warm, cold" },
          date_from: { type: "string" as const, description: "Start date filter (ISO format YYYY-MM-DD)" },
          date_to: { type: "string" as const, description: "End date filter (ISO format YYYY-MM-DD)" },
          limit: { type: "number" as const, description: "Max results (default 20)" },
        },
        required: [] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_pipeline",
      description: "Search pipeline orders (deals in progress) by customer, product, stage, salesperson, or date range.",
      parameters: {
        type: "object" as const,
        properties: {
          search: { type: "string" as const, description: "Search term" },
          status: { type: "string" as const, description: "Filter: active, won, lost, stalled" },
          date_from: { type: "string" as const, description: "Start date filter (ISO format YYYY-MM-DD)" },
          date_to: { type: "string" as const, description: "End date filter (ISO format YYYY-MM-DD)" },
          limit: { type: "number" as const, description: "Max results (default 20)" },
        },
        required: [] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_inventory",
      description: "Search inventory/stock levels by product name, category, or availability status.",
      parameters: {
        type: "object" as const,
        properties: {
          search: { type: "string" as const, description: "Product name or category" },
          low_stock_only: { type: "boolean" as const, description: "Only show low stock items" },
          limit: { type: "number" as const, description: "Max results (default 20)" },
        },
        required: [] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_employees",
      description: "Search employees by name, department, or status. Returns employee info, department, and attendance summary.",
      parameters: {
        type: "object" as const,
        properties: {
          search: { type: "string" as const, description: "Employee name or department" },
          department: { type: "string" as const, description: "Filter by department" },
          limit: { type: "number" as const, description: "Max results (default 20)" },
        },
        required: [] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_tasks",
      description: "Search tasks by title, assignee, status, type, or date range.",
      parameters: {
        type: "object" as const,
        properties: {
          search: { type: "string" as const, description: "Task title or description" },
          status: { type: "string" as const, description: "Filter: pending, in_progress, completed" },
          assigned_to_name: { type: "string" as const, description: "Filter by assignee name" },
          date_from: { type: "string" as const, description: "Start date filter (ISO format YYYY-MM-DD)" },
          date_to: { type: "string" as const, description: "End date filter (ISO format YYYY-MM-DD)" },
          limit: { type: "number" as const, description: "Max results (default 20)" },
        },
        required: [] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_tickets",
      description: "Search IT support tickets by title, status, priority, assignee, or date range.",
      parameters: {
        type: "object" as const,
        properties: {
          search: { type: "string" as const, description: "Ticket title or number" },
          status: { type: "string" as const, description: "Filter: open, in_progress, resolved, closed" },
          priority: { type: "string" as const, description: "Filter: low, medium, high, critical" },
          date_from: { type: "string" as const, description: "Start date filter (ISO format YYYY-MM-DD)" },
          date_to: { type: "string" as const, description: "End date filter (ISO format YYYY-MM-DD)" },
          limit: { type: "number" as const, description: "Max results (default 20)" },
        },
        required: [] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_procurements",
      description: "Search procurement orders by product, supplier, payment status, or date range.",
      parameters: {
        type: "object" as const,
        properties: {
          search: { type: "string" as const, description: "Product name, supplier, or procurement number" },
          payment_status: { type: "string" as const, description: "Filter: pending, partial, paid" },
          date_from: { type: "string" as const, description: "Start date filter (ISO format YYYY-MM-DD)" },
          date_to: { type: "string" as const, description: "End date filter (ISO format YYYY-MM-DD)" },
          limit: { type: "number" as const, description: "Max results (default 20)" },
        },
        required: [] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_suppliers",
      description: "Search suppliers by name, category, or status.",
      parameters: {
        type: "object" as const,
        properties: {
          search: { type: "string" as const, description: "Supplier name or category" },
          limit: { type: "number" as const, description: "Max results (default 20)" },
        },
        required: [] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_expenses",
      description: "Search expenses by description, category, approval status, or date range.",
      parameters: {
        type: "object" as const,
        properties: {
          search: { type: "string" as const, description: "Expense description or category" },
          status: { type: "string" as const, description: "Filter: pending, approved, rejected" },
          date_from: { type: "string" as const, description: "Start date filter (ISO format YYYY-MM-DD)" },
          date_to: { type: "string" as const, description: "End date filter (ISO format YYYY-MM-DD)" },
          limit: { type: "number" as const, description: "Max results (default 20)" },
        },
        required: [] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_repairs",
      description: "Search repair orders by customer, drone model, status, or date range.",
      parameters: {
        type: "object" as const,
        properties: {
          search: { type: "string" as const, description: "Customer name, drone model, or repair number" },
          status: { type: "string" as const, description: "Filter: received, diagnosing, repairing, completed, delivered" },
          date_from: { type: "string" as const, description: "Start date filter (ISO format YYYY-MM-DD)" },
          date_to: { type: "string" as const, description: "End date filter (ISO format YYYY-MM-DD)" },
          limit: { type: "number" as const, description: "Max results (default 20)" },
        },
        required: [] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_dashboard_stats",
      description: "Get overall dashboard statistics including counts and summaries. Optionally filter by date range for time-specific stats.",
      parameters: {
        type: "object" as const,
        properties: {
          date_from: { type: "string" as const, description: "Start date filter (ISO format YYYY-MM-DD)" },
          date_to: { type: "string" as const, description: "End date filter (ISO format YYYY-MM-DD)" },
        },
        required: [] as string[],
        additionalProperties: false,
      },
    },
  },
];

// Role-based module access map
const ROLE_MODULE_ACCESS: Record<string, string[]> = {
  admin: ["query_orders", "query_enquiries", "query_pipeline", "query_inventory", "query_employees", "query_tasks", "query_tickets", "query_procurements", "query_suppliers", "query_expenses", "query_repairs", "get_dashboard_stats"],
  sales: ["query_orders", "query_enquiries", "query_pipeline", "query_tasks", "get_dashboard_stats"],
  sales_manager: ["query_orders", "query_enquiries", "query_pipeline", "query_tasks", "get_dashboard_stats"],
  supply_chain: ["query_orders", "query_inventory", "query_procurements", "query_suppliers", "query_tasks", "get_dashboard_stats"],
  finance: ["query_orders", "query_expenses", "query_procurements", "query_tasks", "get_dashboard_stats"],
  hr: ["query_employees", "query_tasks", "query_tickets", "get_dashboard_stats"],
  it: ["query_tickets", "query_tasks", "get_dashboard_stats"],
  marketing: ["query_enquiries", "query_pipeline", "query_tasks", "get_dashboard_stats"],
  employee: ["query_tasks", "query_tickets", "get_dashboard_stats"],
};

async function executeToolCall(
  client: ReturnType<typeof createClient>,
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
  roles: string[]
): Promise<string> {
  const limit = Math.min(Number(args.limit) || 20, 50);
  const isAdmin = roles.includes("admin");
  const isSalesManager = roles.includes("sales_manager");
  const isSales = roles.includes("sales");

  try {
    switch (toolName) {
      case "query_orders": {
        let query = client.from("orders").select("id, order_number, customer_name, customer_company, product_name, quantity, total_sales_amount, amount_paid, discount_amount, payment_status, status, sales_person_name, created_at, payment_due_date, shipping_address_state").order("created_at", { ascending: false }).limit(limit);
        if (isSales && !isAdmin && !isSalesManager) query = query.eq("sales_person_id", userId);
        if (args.search) query = query.or(`customer_name.ilike.%${args.search}%,order_number.ilike.%${args.search}%,product_name.ilike.%${args.search}%,customer_company.ilike.%${args.search}%`);
        if (args.status) query = query.eq("status", args.status);
        if (args.payment_status) query = query.eq("payment_status", args.payment_status);
        if (args.date_from) query = query.gte("created_at", `${args.date_from}T00:00:00`);
        if (args.date_to) query = query.lte("created_at", `${args.date_to}T23:59:59`);
        const { data, error } = await query;
        if (error) throw error;
        return JSON.stringify({ count: data?.length || 0, records: data || [] });
      }

      case "query_enquiries": {
        let query = client.from("enquiries").select("id, customer_name, customer_company, product_name, quantity, status, lead_temperature, urgency, sales_person_name, created_at, is_mega_deal, ai_score").order("created_at", { ascending: false }).limit(limit);
        if (isSales && !isAdmin && !isSalesManager) query = query.eq("sales_person_id", userId);
        if (args.search) query = query.or(`customer_name.ilike.%${args.search}%,customer_company.ilike.%${args.search}%,product_name.ilike.%${args.search}%`);
        if (args.status) query = query.eq("status", args.status);
        if (args.lead_temperature) query = query.eq("lead_temperature", args.lead_temperature);
        if (args.date_from) query = query.gte("created_at", `${args.date_from}T00:00:00`);
        if (args.date_to) query = query.lte("created_at", `${args.date_to}T23:59:59`);
        const { data, error } = await query;
        if (error) throw error;
        return JSON.stringify({ count: data?.length || 0, records: data || [] });
      }

      case "query_pipeline": {
        let query = client.from("pipeline_orders").select("id, customer_name, customer_company, product_name, expected_price, status, stage, probability, sales_person_name, created_at, expected_close_date").order("created_at", { ascending: false }).limit(limit);
        if (isSales && !isAdmin && !isSalesManager) query = query.eq("sales_person_id", userId);
        if (args.search) query = query.or(`customer_name.ilike.%${args.search}%,customer_company.ilike.%${args.search}%,product_name.ilike.%${args.search}%`);
        if (args.status) query = query.eq("status", args.status);
        if (args.date_from) query = query.gte("created_at", `${args.date_from}T00:00:00`);
        if (args.date_to) query = query.lte("created_at", `${args.date_to}T23:59:59`);
        const { data, error } = await query;
        if (error) throw error;
        return JSON.stringify({ count: data?.length || 0, records: data || [] });
      }

      case "query_inventory": {
        let query = client.from("inventory").select("id, product_name, product_category, current_stock, reorder_point, safety_stock, last_restocked_at").order("product_name").limit(limit);
        if (args.search) query = query.or(`product_name.ilike.%${args.search}%,product_category.ilike.%${args.search}%`);
        if (args.low_stock_only) query = query.lte("current_stock", 10);
        const { data, error } = await query;
        if (error) throw error;
        return JSON.stringify(data || []);
      }

      case "query_employees": {
        if (!isAdmin && !roles.includes("hr")) {
          return JSON.stringify({ error: "You don't have permission to view employee data" });
        }
        let query = client.from("employees").select("id, name, department, designation, employment_status, joining_date, is_active, work_location, shift_type").order("name").limit(limit);
        if (args.search) query = query.or(`name.ilike.%${args.search}%,department.ilike.%${args.search}%`);
        if (args.department) query = query.eq("department", args.department);
        const { data, error } = await query;
        if (error) throw error;
        return JSON.stringify(data || []);
      }

      case "query_tasks": {
        let query = client.from("tasks").select("id, title, task_type, status, priority, assigned_to_name, due_date, created_at, completed_at").order("created_at", { ascending: false }).limit(limit);
        if (!isAdmin && !isSalesManager && !roles.includes("hr")) query = query.eq("assigned_to", userId);
        if (args.search) query = query.or(`title.ilike.%${args.search}%`);
        if (args.status) query = query.eq("status", args.status);
        if (args.assigned_to_name) query = query.ilike("assigned_to_name", `%${args.assigned_to_name}%`);
        if (args.date_from) query = query.gte("created_at", `${args.date_from}T00:00:00`);
        if (args.date_to) query = query.lte("created_at", `${args.date_to}T23:59:59`);
        const { data, error } = await query;
        if (error) throw error;
        return JSON.stringify({ count: data?.length || 0, records: data || [] });
      }

      case "query_tickets": {
        let query = client.from("tickets").select("id, ticket_number, title, status, priority, category, assigned_to_name, created_by_name, created_at, resolved_at").order("created_at", { ascending: false }).limit(limit);
        if (!isAdmin && !roles.includes("it")) query = query.eq("created_by", userId);
        if (args.search) query = query.or(`title.ilike.%${args.search}%,ticket_number.ilike.%${args.search}%`);
        if (args.status) query = query.eq("status", args.status);
        if (args.priority) query = query.eq("priority", args.priority);
        if (args.date_from) query = query.gte("created_at", `${args.date_from}T00:00:00`);
        if (args.date_to) query = query.lte("created_at", `${args.date_to}T23:59:59`);
        const { data, error } = await query;
        if (error) throw error;
        return JSON.stringify({ count: data?.length || 0, records: data || [] });
      }

      case "query_procurements": {
        let query = client.from("inventory_procurements").select("id, procurement_number, product_name, product_category, quantity, supplier_name, payment_status, total_cost, procurement_date, status").order("created_at", { ascending: false }).limit(limit);
        if (args.search) query = query.or(`product_name.ilike.%${args.search}%,supplier_name.ilike.%${args.search}%,procurement_number.ilike.%${args.search}%`);
        if (args.payment_status) query = query.eq("payment_status", args.payment_status);
        if (args.date_from) query = query.gte("created_at", `${args.date_from}T00:00:00`);
        if (args.date_to) query = query.lte("created_at", `${args.date_to}T23:59:59`);
        const { data, error } = await query;
        if (error) throw error;
        return JSON.stringify({ count: data?.length || 0, records: data || [] });
      }

      case "query_suppliers": {
        let query = client.from("suppliers").select("id, name, company, email, phone, category, is_verified, reliability_score").order("name").limit(limit);
        if (args.search) query = query.or(`name.ilike.%${args.search}%,company.ilike.%${args.search}%`);
        const { data, error } = await query;
        if (error) throw error;
        return JSON.stringify(data || []);
      }

      case "query_expenses": {
        let query = client.from("expenses").select("id, description, amount, category, payment_mode, status, created_by_name, created_at, approved_by_name").order("created_at", { ascending: false }).limit(limit);
        if (!isAdmin && !roles.includes("finance")) query = query.eq("created_by", userId);
        if (args.search) query = query.or(`description.ilike.%${args.search}%,vendor_name.ilike.%${args.search}%`);
        if (args.status) query = query.eq("status", args.status);
        if (args.date_from) query = query.gte("created_at", `${args.date_from}T00:00:00`);
        if (args.date_to) query = query.lte("created_at", `${args.date_to}T23:59:59`);
        const { data, error } = await query;
        if (error) throw error;
        return JSON.stringify({ count: data?.length || 0, records: data || [] });
      }

      case "query_repairs": {
        let query = client.from("repairs").select("id, repair_number, customer_name, customer_phone, drone_model, issue_description, status, repair_cost, created_at").order("created_at", { ascending: false }).limit(limit);
        if (args.search) query = query.or(`customer_name.ilike.%${args.search}%,drone_model.ilike.%${args.search}%,repair_number.ilike.%${args.search}%`);
        if (args.status) query = query.eq("status", args.status);
        if (args.date_from) query = query.gte("created_at", `${args.date_from}T00:00:00`);
        if (args.date_to) query = query.lte("created_at", `${args.date_to}T23:59:59`);
        const { data, error } = await query;
        if (error) throw error;
        return JSON.stringify({ count: data?.length || 0, records: data || [] });
      }

      case "get_dashboard_stats": {
        const stats: Record<string, unknown> = {};

        // Orders summary
        const ordersQuery = isAdmin || isSalesManager
          ? client.from("orders").select("id, total_sales_amount, amount_paid, payment_status, status", { count: "exact" })
          : client.from("orders").select("id, total_sales_amount, amount_paid, payment_status, status", { count: "exact" }).eq("sales_person_id", userId);
        const { data: orders, count: orderCount } = await ordersQuery;
        
        if (orders) {
          stats.total_orders = orderCount;
          stats.total_revenue = orders.reduce((s, o) => s + (o.total_sales_amount || 0), 0);
          stats.total_collected = orders.reduce((s, o) => s + (o.amount_paid || 0), 0);
          stats.pending_payments = orders.filter(o => o.payment_status !== "paid").length;
        }

        // Enquiries
        const enqQuery = isAdmin || isSalesManager
          ? client.from("enquiries").select("id, status, lead_temperature", { count: "exact" })
          : client.from("enquiries").select("id, status, lead_temperature", { count: "exact" }).eq("sales_person_id", userId);
        const { data: enquiries, count: enqCount } = await enqQuery;
        if (enquiries) {
          stats.total_enquiries = enqCount;
          stats.hot_leads = enquiries.filter(e => e.lead_temperature === "hot").length;
          stats.new_enquiries = enquiries.filter(e => e.status === "new").length;
        }

        // Inventory
        if (isAdmin || roles.includes("supply_chain")) {
          const { data: inv } = await client.from("inventory").select("id, current_stock, reorder_point");
          if (inv) {
            stats.total_products = inv.length;
            stats.low_stock_items = inv.filter(i => i.current_stock <= (i.reorder_point || 0)).length;
          }
        }

        // Tasks
        const { data: tasks } = await (isAdmin
          ? client.from("tasks").select("id, status")
          : client.from("tasks").select("id, status").eq("assigned_to", userId));
        if (tasks) {
          stats.total_tasks = tasks.length;
          stats.pending_tasks = tasks.filter(t => t.status === "pending").length;
          stats.in_progress_tasks = tasks.filter(t => t.status === "in_progress").length;
        }

        return JSON.stringify(stats);
      }

      default:
        return JSON.stringify({ error: "Unknown tool" });
    }
  } catch (err) {
    console.error(`Tool ${toolName} error:`, err);
    return JSON.stringify({ error: `Failed to query ${toolName}` });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Server configuration missing");
    }

    // Verify JWT
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      console.error("JWT validation failed:", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user roles
    const { data: userRoles } = await serviceClient.from("user_roles").select("role").eq("user_id", userId);
    const roles = userRoles?.map(r => r.role) || ["employee"];

    // Get user name
    const { data: profile } = await serviceClient.from("profiles").select("name").eq("user_id", userId).single();
    const userName = profile?.name || "User";

    const { messages } = await req.json() as { messages: Message[] };

    // Filter tools based on role
    const primaryRole = roles[0] || "employee";
    const allowedTools = ROLE_MODULE_ACCESS[primaryRole] || ROLE_MODULE_ACCESS.employee;
    // Merge all roles' allowed tools
    const allAllowedTools = new Set<string>();
    for (const role of roles) {
      for (const tool of (ROLE_MODULE_ACCESS[role] || [])) {
        allAllowedTools.add(tool);
      }
    }
    const filteredTools = DATA_TOOLS.filter(t => allAllowedTools.has(t.function.name));

    const systemPrompt = `You are XBoom AI Assistant, an intelligent helper for the XBoom Workflow portal — an internal operations platform for a drone/UAV business.

User: ${userName}
Roles: ${roles.join(", ")}

You can query the system's data using the available tools. When the user asks about data, use the appropriate tool to fetch it, then present the results clearly.

Guidelines:
- Be concise and professional
- Format prices with ₹ symbol for Indian Rupees
- Present data in clean tables or bullet points when showing multiple records
- If results are empty, say so clearly
- For dashboard/summary questions, use get_dashboard_stats
- For specific searches, use the appropriate query tool
- Never fabricate data — only use what the tools return
- If the user asks about something outside your tools, explain what modules you can help with
- Respect that data is filtered based on the user's role

Available modules based on your role: ${Array.from(allAllowedTools).map(t => t.replace("query_", "").replace("get_", "")).join(", ")}`;

    // Step 1: Send to AI with tools (non-streaming to get tool calls)
    const step1Response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools: filteredTools,
        tool_choice: "auto",
        stream: false,
      }),
    });

    if (!step1Response.ok) {
      if (step1Response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (step1Response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await step1Response.text();
      console.error("AI step1 error:", step1Response.status, errText);
      return new Response(JSON.stringify({ error: "AI assistant unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const step1Data = await step1Response.json();
    const assistantMessage = step1Data.choices?.[0]?.message;
    const finishReason = step1Data.choices?.[0]?.finish_reason;

    // Handle malformed function calls or errors from the AI
    if (finishReason === "error" || !assistantMessage) {
      console.error("AI step1 finish_reason:", finishReason, JSON.stringify(step1Data.choices?.[0]));
      // Retry without tools — just answer directly via streaming
      const retryResponse = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
           model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt + "\n\nIMPORTANT: Answer the user's question directly based on your knowledge of the system. Do not attempt to call any tools." },
            ...messages,
          ],
          stream: true,
        }),
      });

      if (!retryResponse.ok) {
        return new Response(JSON.stringify({ error: "AI assistant unavailable" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(retryResponse.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // If no tool calls, stream the response directly
    if (!assistantMessage?.tool_calls || assistantMessage.tool_calls.length === 0) {
      // If there's already content, stream it as a simple response
      if (assistantMessage?.content) {
        const encoder = new TextEncoder();
        const sseData = `data: ${JSON.stringify({
          choices: [{ delta: { content: assistantMessage.content, role: "assistant" }, finish_reason: "stop" }]
        })}\n\ndata: [DONE]\n\n`;
        return new Response(encoder.encode(sseData), {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }
      
      // Otherwise re-request as streaming
      const streamResponse = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
           model: "google/gemini-2.5-flash",
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          stream: true,
        }),
      });

      if (!streamResponse.ok) {
        return new Response(JSON.stringify({ error: "AI assistant unavailable" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(streamResponse.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Step 2: Execute tool calls
    const toolResults: { role: string; tool_call_id: string; content: string }[] = [];
    
    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      
      // Security: verify tool is allowed for this user
      if (!allAllowedTools.has(toolName)) {
        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: "Access denied for this module" }),
        });
        continue;
      }

      let toolArgs: Record<string, unknown> = {};
      try {
        toolArgs = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        toolArgs = {};
      }

      const result = await executeToolCall(serviceClient, toolName, toolArgs, userId, roles);
      toolResults.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    // Step 3: Send tool results back to AI for final streaming response
    const step3Messages = [
      { role: "system", content: systemPrompt },
      ...messages,
      assistantMessage,
      ...toolResults,
    ];

    const finalResponse = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: step3Messages,
        stream: true,
      }),
    });

    if (!finalResponse.ok) {
      const errText = await finalResponse.text();
      console.error("AI step3 error:", finalResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI assistant unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(finalResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    console.error("Portal assistant error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
