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
      description: "Search orders by customer name, order number, status, product, or date range. Returns order details including amounts, payment status, and delivery info. Use higher limits (100-500) for aggregation/analytics queries.",
      parameters: {
        type: "object" as const,
        properties: {
          search: { type: "string" as const, description: "Search term (customer name, order number, product)" },
          status: { type: "string" as const, description: "Filter by order status: po_received, procurement_to_plan, in_transit, delivery_done, payment_received, partial_payment_received, cancelled" },
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
      description: "Search sales enquiries/leads by customer, product, status, salesperson, or date range. Returns lead details, temperature, and conversion info. 'Hot leads' means probability_to_close >= 70. 'Mega deals' means is_mega_deal = true.",
      parameters: {
        type: "object" as const,
        properties: {
          search: { type: "string" as const, description: "Search term (customer name, company, product)" },
          status: { type: "string" as const, description: "Filter by status: new, responded, converted, closed" },
          lead_temperature: { type: "string" as const, description: "Filter: hot, warm, cold" },
          hot_leads_only: { type: "boolean" as const, description: "If true, filters enquiries with probability_to_close >= 70 (hot leads)" },
          mega_deals_only: { type: "boolean" as const, description: "If true, filters enquiries where is_mega_deal = true" },
          date_from: { type: "string" as const, description: "Start date filter (ISO format YYYY-MM-DD)" },
          date_to: { type: "string" as const, description: "End date filter (ISO format YYYY-MM-DD)" },
          limit: { type: "number" as const, description: "Max results (default 50)" },
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
      description: "Search IT support tickets by subject, status, priority, assignee, or date range.",
      parameters: {
        type: "object" as const,
        properties: {
          search: { type: "string" as const, description: "Ticket subject or number" },
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
      name: "query_attendance",
      description: "Query attendance logs. Shows check-in/out times, working hours, late arrivals, and status. Filter by date, employee, or department.",
      parameters: {
        type: "object" as const,
        properties: {
          employee_name: { type: "string" as const, description: "Filter by employee name" },
          department: { type: "string" as const, description: "Filter by department" },
          status: { type: "string" as const, description: "Filter: present, absent, on_leave, half_day, late" },
          date_from: { type: "string" as const, description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string" as const, description: "End date (YYYY-MM-DD)" },
          late_only: { type: "boolean" as const, description: "Show only late check-ins (after 09:30 AM)" },
          absent_only: { type: "boolean" as const, description: "Show only absent employees for a date" },
          limit: { type: "number" as const, description: "Max results (default 50)" },
        },
        required: [] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_leave_requests",
      description: "Query leave requests and balances. Shows leave type, status, dates, and approval info.",
      parameters: {
        type: "object" as const,
        properties: {
          employee_name: { type: "string" as const, description: "Filter by employee name" },
          status: { type: "string" as const, description: "Filter: pending, approved, rejected" },
          leave_type: { type: "string" as const, description: "Filter: EL, SL, WFH, unpaid" },
          date_from: { type: "string" as const, description: "Start date filter" },
          date_to: { type: "string" as const, description: "End date filter" },
          limit: { type: "number" as const, description: "Max results (default 50)" },
        },
        required: [] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_leave_balances",
      description: "Query employee leave balances. Shows current EL and SL balances for employees.",
      parameters: {
        type: "object" as const,
        properties: {
          employee_name: { type: "string" as const, description: "Filter by employee name" },
          department: { type: "string" as const, description: "Filter by department" },
          limit: { type: "number" as const, description: "Max results (default 50)" },
        },
        required: [] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_salary_sheets",
      description: "Query salary/payroll sheets by month, year, or status.",
      parameters: {
        type: "object" as const,
        properties: {
          month: { type: "number" as const, description: "Month number (1-12)" },
          year: { type: "number" as const, description: "Year (e.g., 2026)" },
          status: { type: "string" as const, description: "Filter: draft, finalized, paid" },
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
      name: "query_expected_payments",
      description: "Query expected/scheduled payments with amounts and due dates. Useful for cashflow analysis.",
      parameters: {
        type: "object" as const,
        properties: {
          status: { type: "string" as const, description: "Filter: pending, received, overdue" },
          date_from: { type: "string" as const, description: "Start date" },
          date_to: { type: "string" as const, description: "End date" },
          limit: { type: "number" as const, description: "Max results (default 50)" },
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
  // --- ACTIONABLE COMMANDS ---
  {
    type: "function" as const,
    function: {
      name: "update_order_status",
      description: "Update the status of an order. Use when the user asks to change an order's status (e.g., 'mark order ORD2500012 as dispatched').",
      parameters: {
        type: "object" as const,
        properties: {
          order_number: { type: "string" as const, description: "The order number (e.g., ORD2500012)" },
          new_status: { type: "string" as const, description: "New status: confirmed, dispatched, delivered, cancelled" },
        },
        required: ["order_number", "new_status"] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_enquiry_status",
      description: "Update the status of an enquiry/lead. Use when the user asks to change a lead's status (e.g., 'mark this enquiry as responded').",
      parameters: {
        type: "object" as const,
        properties: {
          enquiry_id: { type: "string" as const, description: "The enquiry UUID" },
          new_status: { type: "string" as const, description: "New status: new, responded, on_hold, moved_to_pipeline, order_won, order_lost" },
        },
        required: ["enquiry_id", "new_status"] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_task_status",
      description: "Update the status of a task. Use when the user asks to complete or update a task.",
      parameters: {
        type: "object" as const,
        properties: {
          task_id: { type: "string" as const, description: "The task UUID" },
          new_status: { type: "string" as const, description: "New status: pending, in_progress, completed" },
        },
        required: ["task_id", "new_status"] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: "Create a new task. Use when the user asks to create a task, follow-up, or action item for someone.",
      parameters: {
        type: "object" as const,
        properties: {
          title: { type: "string" as const, description: "Task title" },
          description: { type: "string" as const, description: "Task description" },
          assigned_to_name: { type: "string" as const, description: "Name of the person to assign the task to" },
          priority: { type: "number" as const, description: "Priority: 1 (highest) to 3 (lowest)" },
          due_date: { type: "string" as const, description: "Due date in ISO format" },
        },
        required: ["title", "assigned_to_name"] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_payment_followup",
      description: "Create a payment follow-up task for an order with pending payment. Use when user asks to follow up on payments.",
      parameters: {
        type: "object" as const,
        properties: {
          order_number: { type: "string" as const, description: "The order number (e.g., ORD2500012)" },
        },
        required: ["order_number"] as string[],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_daily_briefing",
      description: "Get a comprehensive role-specific daily briefing. HR gets attendance/leave data, Sales gets leads/pipeline, Finance gets payment/cashflow data, Operations gets procurement/inventory data. Use when user asks for a briefing or morning summary.",
      parameters: {
        type: "object" as const,
        properties: {},
        required: [] as string[],
        additionalProperties: false,
      },
    },
  },
];

// Role-based module access map
const ROLE_MODULE_ACCESS: Record<string, string[]> = {
  admin: ["query_orders", "query_enquiries", "query_pipeline", "query_inventory", "query_employees", "query_tasks", "query_tickets", "query_procurements", "query_suppliers", "query_expenses", "query_repairs", "query_attendance", "query_leave_requests", "query_leave_balances", "query_salary_sheets", "query_expected_payments", "get_dashboard_stats", "update_order_status", "update_enquiry_status", "update_task_status", "create_task", "create_payment_followup", "get_daily_briefing"],
  sales: ["query_orders", "query_enquiries", "query_pipeline", "query_tasks", "get_dashboard_stats", "update_enquiry_status", "update_task_status", "create_task", "get_daily_briefing"],
  sales_manager: ["query_orders", "query_enquiries", "query_pipeline", "query_tasks", "get_dashboard_stats", "update_order_status", "update_enquiry_status", "update_task_status", "create_task", "create_payment_followup", "get_daily_briefing"],
  supply_chain: ["query_orders", "query_inventory", "query_procurements", "query_suppliers", "query_tasks", "get_dashboard_stats", "update_order_status", "update_task_status", "create_task", "get_daily_briefing"],
  finance: ["query_orders", "query_expenses", "query_procurements", "query_tasks", "query_expected_payments", "get_dashboard_stats", "update_task_status", "create_task", "create_payment_followup", "get_daily_briefing"],
  hr: ["query_employees", "query_tasks", "query_tickets", "query_attendance", "query_leave_requests", "query_leave_balances", "query_salary_sheets", "get_dashboard_stats", "update_task_status", "create_task", "get_daily_briefing"],
  it: ["query_tickets", "query_tasks", "get_dashboard_stats", "update_task_status", "create_task", "get_daily_briefing"],
  marketing: ["query_enquiries", "query_pipeline", "query_tasks", "get_dashboard_stats", "update_task_status", "create_task", "get_daily_briefing"],
  employee: ["query_tasks", "query_tickets", "get_dashboard_stats", "update_task_status", "create_task", "get_daily_briefing"],
};

// Role-specific system prompt personalities
function getRolePersonality(roles: string[]): string {
  const isAdmin = roles.includes("admin");
  if (isAdmin) {
    return `You are the EXECUTIVE COMMAND CENTER assistant. You have full visibility across all departments — Sales, Finance, HR, Operations, IT. You provide strategic oversight, cross-department intelligence, and help the admin make data-driven decisions. Surface anomalies, risks, and opportunities proactively.`;
  }
  if (roles.includes("hr")) {
    return `You are a PEOPLE OPERATIONS assistant specialized in HR management. Your primary focus is workforce analytics — attendance patterns, leave management, employee engagement, payroll status, and hiring pipeline. You help HR make informed decisions about people, identify attendance anomalies, and track workforce health. You do NOT have access to financial data (revenue, order amounts, cost prices) or sales pipeline details. Focus on employee well-being and operational efficiency.`;
  }
  if (roles.includes("finance")) {
    return `You are a CASHFLOW & RECOVERY assistant specialized in financial operations. Your primary focus is payment tracking, overdue recovery, expense management, cashflow forecasting, and financial risk assessment. You help Finance teams prioritize collections, identify payment risks, and manage cash positions. You do NOT have access to HR personal data (salaries, attendance, leave details) or detailed employee information. Focus on revenue realization and financial health.`;
  }
  if (roles.includes("sales_manager")) {
    return `You are a REVENUE INTELLIGENCE assistant for sales leadership. Your focus is team performance, pipeline health, conversion analytics, and deal velocity. You help sales managers monitor their team's performance, identify coaching opportunities, and forecast revenue. You have visibility into all sales team members' data.`;
  }
  if (roles.includes("sales")) {
    return `You are a DEAL CLOSING assistant for the sales team. Your focus is personal pipeline management, lead prioritization, follow-up scheduling, and closing strategies. You help individual salespeople stay on top of their deals, identify hot leads, and never miss a follow-up. You can only see your own leads and orders.`;
  }
  if (roles.includes("supply_chain")) {
    return `You are a SUPPLY CHAIN INTELLIGENCE assistant. Your focus is procurement optimization, inventory management, supplier performance, and order fulfillment. You help operations teams maintain optimal stock levels, track supplier reliability, and prevent stockouts. Focus on operational efficiency and supply chain health.`;
  }
  if (roles.includes("it")) {
    return `You are an IT OPERATIONS assistant. Your focus is ticket management, system health, and technical issue resolution. You help the IT team prioritize tickets, track SLA compliance, and identify recurring issues.`;
  }
  if (roles.includes("marketing")) {
    return `You are a MARKET INTELLIGENCE assistant. Your focus is lead quality analysis, campaign effectiveness, and market trends from enquiry data. You help marketing teams understand which channels and products generate the most interest.`;
  }
  return `You are a helpful workspace assistant. You can help with tasks and basic queries.`;
}

// Role-specific title for the AI panel
function getRoleTitle(roles: string[]): string {
  if (roles.includes("admin")) return "Command Center";
  if (roles.includes("hr")) return "People Insights";
  if (roles.includes("finance")) return "Cashflow Insights";
  if (roles.includes("sales_manager") || roles.includes("sales")) return "Revenue Insights";
  if (roles.includes("supply_chain")) return "Supply Insights";
  if (roles.includes("it")) return "IT Operations";
  if (roles.includes("marketing")) return "Market Insights";
  return "XBoom AI";
}

async function executeToolCall(
  client: ReturnType<typeof createClient>,
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
  roles: string[]
): Promise<string> {
  const limit = Math.min(Number(args.limit) || 50, 500);
  const isAdmin = roles.includes("admin");
  const isSalesManager = roles.includes("sales_manager");
  const isSales = roles.includes("sales");
  const isHR = roles.includes("hr");
  const isFinance = roles.includes("finance");

  try {
    switch (toolName) {
      case "query_orders": {
        let query = client.from("orders").select("id, order_number, customer_name, customer_company, product_name, product_code, product_category, quantity, total_sales_amount, amount_paid, discount_amount, payment_status, status, sales_person_name, created_at, payment_due_date, shipping_address").order("created_at", { ascending: false }).limit(limit);
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
        let query = client.from("enquiries").select("id, customer_name, customer_company, product_name, product_category, quantity, status, lead_temperature, urgency, sales_person_name, created_at, is_mega_deal, ai_score, probability_to_close, customer_state").order("created_at", { ascending: false }).limit(limit);
        if (isSales && !isAdmin && !isSalesManager) query = query.eq("sales_person_id", userId);
        if (args.search) query = query.or(`customer_name.ilike.%${args.search}%,customer_company.ilike.%${args.search}%,product_name.ilike.%${args.search}%`);
        if (args.status) query = query.eq("status", args.status);
        if (args.lead_temperature) query = query.eq("lead_temperature", args.lead_temperature);
        if (args.hot_leads_only) query = query.gte("probability_to_close", 70);
        if (args.mega_deals_only) query = query.eq("is_mega_deal", true);
        if (args.date_from) query = query.gte("created_at", `${args.date_from}T00:00:00`);
        if (args.date_to) query = query.lte("created_at", `${args.date_to}T23:59:59`);
        const { data, error } = await query;
        if (error) throw error;
        return JSON.stringify({ count: data?.length || 0, records: data || [] });
      }

      case "query_pipeline": {
        let query = client.from("pipeline_orders").select("id, customer_name, customer_company, product_name, expected_price, status, probability, sales_person_name, created_at, expected_closure_date").order("created_at", { ascending: false }).limit(limit);
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
        if (!isAdmin && !isHR) {
          return JSON.stringify({ error: "You don't have permission to view employee data" });
        }
        let query = client.from("employees").select("id, name, department, designation, employment_status, joining_date, is_active, work_location, shift_type").order("name").limit(limit);
        if (args.search) query = query.or(`name.ilike.%${args.search}%,department.ilike.%${args.search}%`);
        if (args.department) query = query.eq("department", args.department);
        const { data, error } = await query;
        if (error) throw error;
        return JSON.stringify(data || []);
      }

      case "query_attendance": {
        if (!isAdmin && !isHR) {
          return JSON.stringify({ error: "You don't have permission to view attendance data" });
        }
        let query = client.from("attendance_logs").select("id, employee_id, date, check_in_time, check_out_time, working_hours, status, source, notes, total_break_minutes, auto_checkout_applied, checkout_missing").order("date", { ascending: false }).limit(limit);
        
        // Join with employee name if filtering
        if (args.employee_name) {
          const { data: empMatch } = await client.from("employees").select("id").ilike("name", `%${args.employee_name}%`);
          if (empMatch?.length) {
            query = query.in("employee_id", empMatch.map(e => e.id));
          } else {
            return JSON.stringify({ count: 0, records: [], message: "No employee found with that name" });
          }
        }
        if (args.department) {
          const { data: deptEmps } = await client.from("employees").select("id").eq("department", args.department);
          if (deptEmps?.length) {
            query = query.in("employee_id", deptEmps.map(e => e.id));
          }
        }
        if (args.status) query = query.eq("status", args.status);
        if (args.date_from) query = query.gte("date", args.date_from);
        if (args.date_to) query = query.lte("date", args.date_to);
        if (args.late_only) {
          query = query.gt("check_in_time", `${args.date_from || new Date().toISOString().split("T")[0]}T09:30:00`);
        }
        if (args.absent_only) {
          query = query.eq("status", "absent");
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        // Enrich with employee names
        if (data?.length) {
          const empIds = [...new Set(data.map(d => d.employee_id))];
          const { data: emps } = await client.from("employees").select("id, name, department").in("id", empIds);
          const empMap = Object.fromEntries((emps || []).map(e => [e.id, e]));
          const enriched = data.map(d => ({
            ...d,
            employee_name: empMap[d.employee_id]?.name || "Unknown",
            department: empMap[d.employee_id]?.department || "Unknown",
          }));
          return JSON.stringify({ count: enriched.length, records: enriched });
        }
        return JSON.stringify({ count: 0, records: [] });
      }

      case "query_leave_requests": {
        if (!isAdmin && !isHR) {
          return JSON.stringify({ error: "You don't have permission to view leave data" });
        }
        let query = client.from("leave_requests").select("id, employee_id, leave_type, start_date, end_date, total_days, reason, status, applied_by_name, approved_by_name, created_at").order("created_at", { ascending: false }).limit(limit);
        
        if (args.employee_name) {
          const { data: empMatch } = await client.from("employees").select("id").ilike("name", `%${args.employee_name}%`);
          if (empMatch?.length) {
            query = query.in("employee_id", empMatch.map(e => e.id));
          } else {
            return JSON.stringify({ count: 0, records: [] });
          }
        }
        if (args.status) query = query.eq("status", args.status);
        if (args.leave_type) query = query.eq("leave_type", args.leave_type);
        if (args.date_from) query = query.gte("start_date", args.date_from);
        if (args.date_to) query = query.lte("start_date", args.date_to);
        
        const { data, error } = await query;
        if (error) throw error;
        
        // Enrich with employee names
        if (data?.length) {
          const empIds = [...new Set(data.map(d => d.employee_id))];
          const { data: emps } = await client.from("employees").select("id, name, department").in("id", empIds);
          const empMap = Object.fromEntries((emps || []).map(e => [e.id, e]));
          const enriched = data.map(d => ({
            ...d,
            employee_name: empMap[d.employee_id]?.name || "Unknown",
            department: empMap[d.employee_id]?.department || "Unknown",
          }));
          return JSON.stringify({ count: enriched.length, records: enriched });
        }
        return JSON.stringify({ count: 0, records: [] });
      }

      case "query_leave_balances": {
        if (!isAdmin && !isHR) {
          return JSON.stringify({ error: "You don't have permission to view leave balance data" });
        }
        let empQuery = client.from("employees").select("id, name, department").eq("is_active", true).order("name").limit(limit);
        if (args.employee_name) empQuery = empQuery.ilike("name", `%${args.employee_name}%`);
        if (args.department) empQuery = empQuery.eq("department", args.department);
        
        const { data: emps, error: empErr } = await empQuery;
        if (empErr) throw empErr;
        if (!emps?.length) return JSON.stringify({ count: 0, records: [] });
        
        const empIds = emps.map(e => e.id);
        const currentYear = new Date().getFullYear();
        const { data: balances } = await client.from("leave_balances").select("employee_id, leave_type, balance, year").in("employee_id", empIds).eq("year", currentYear);
        
        const balMap: Record<string, Record<string, number>> = {};
        (balances || []).forEach(b => {
          if (!balMap[b.employee_id]) balMap[b.employee_id] = {};
          balMap[b.employee_id][b.leave_type] = b.balance;
        });
        
        const records = emps.map(e => ({
          employee_name: e.name,
          department: e.department,
          el_balance: balMap[e.id]?.["EL"] ?? 0,
          sl_balance: balMap[e.id]?.["SL"] ?? 0,
        }));
        
        return JSON.stringify({ count: records.length, records });
      }

      case "query_salary_sheets": {
        if (!isAdmin && !isHR) {
          return JSON.stringify({ error: "You don't have permission to view payroll data" });
        }
        let query = client.from("salary_sheets").select("id, month, year, status, total_employees, total_gross, total_net, total_deductions, created_at").order("created_at", { ascending: false }).limit(limit);
        if (args.month) query = query.eq("month", args.month);
        if (args.year) query = query.eq("year", args.year);
        if (args.status) query = query.eq("status", args.status);
        const { data, error } = await query;
        if (error) throw error;
        return JSON.stringify({ count: data?.length || 0, records: data || [] });
      }

      case "query_expected_payments": {
        if (!isAdmin && !isFinance) {
          return JSON.stringify({ error: "You don't have permission to view payment data" });
        }
        let query = client.from("expected_payments").select("id, customer_name, customer_company, amount, expected_date, status, order_number, source_type, notes, actual_received_date").order("expected_date", { ascending: true }).limit(limit);
        if (args.status) query = query.eq("status", args.status);
        if (args.date_from) query = query.gte("expected_date", args.date_from);
        if (args.date_to) query = query.lte("expected_date", args.date_to);
        const { data, error } = await query;
        if (error) throw error;
        return JSON.stringify({ count: data?.length || 0, records: data || [] });
      }

      case "query_tasks": {
        let query = client.from("tasks").select("id, title, task_type, status, priority, assigned_to_name, due_date, created_at, completed_at").order("created_at", { ascending: false }).limit(limit);
        if (!isAdmin && !isSalesManager && !isHR) query = query.eq("assigned_to", userId);
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
        let query = client.from("tickets").select("id, ticket_number, subject, description, status, priority, category, assigned_to_name, raised_by_name, created_at, resolved_at").order("created_at", { ascending: false }).limit(limit);
        if (!isAdmin && !roles.includes("it")) query = query.eq("raised_by", userId);
        if (args.search) query = query.or(`subject.ilike.%${args.search}%,ticket_number.ilike.%${args.search}%`);
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
        if (!isAdmin && !isFinance) query = query.eq("created_by", userId);
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
        const dateFrom = args.date_from as string | undefined;
        const dateTo = args.date_to as string | undefined;

        // Orders summary (sales, finance, admin)
        if (isAdmin || isSalesManager || isSales || isFinance) {
          let ordersQuery = isAdmin || isSalesManager || isFinance
            ? client.from("orders").select("id, total_sales_amount, amount_paid, payment_status, status", { count: "exact" })
            : client.from("orders").select("id, total_sales_amount, amount_paid, payment_status, status", { count: "exact" }).eq("sales_person_id", userId);
          if (dateFrom) ordersQuery = ordersQuery.gte("created_at", `${dateFrom}T00:00:00`);
          if (dateTo) ordersQuery = ordersQuery.lte("created_at", `${dateTo}T23:59:59`);
          const { data: orders, count: orderCount } = await ordersQuery;
          
          if (orders) {
            stats.total_orders = orderCount;
            stats.total_revenue = orders.reduce((s, o) => s + (o.total_sales_amount || 0), 0);
            stats.total_collected = orders.reduce((s, o) => s + (o.amount_paid || 0), 0);
            stats.pending_payments = orders.filter(o => o.payment_status !== "paid").length;
          }
        }

        // Enquiries (sales, marketing, admin)
        if (isAdmin || isSalesManager || isSales || roles.includes("marketing")) {
          let enqQuery = isAdmin || isSalesManager
            ? client.from("enquiries").select("id, status, lead_temperature", { count: "exact" })
            : client.from("enquiries").select("id, status, lead_temperature", { count: "exact" }).eq("sales_person_id", userId);
          if (dateFrom) enqQuery = enqQuery.gte("created_at", `${dateFrom}T00:00:00`);
          if (dateTo) enqQuery = enqQuery.lte("created_at", `${dateTo}T23:59:59`);
          const { data: enquiries, count: enqCount } = await enqQuery;
          if (enquiries) {
            stats.total_enquiries = enqCount;
            stats.hot_leads = enquiries.filter(e => e.lead_temperature === "hot").length;
            stats.new_enquiries = enquiries.filter(e => e.status === "new").length;
          }
        }

        // Inventory (admin, supply_chain)
        if (isAdmin || roles.includes("supply_chain")) {
          const { data: inv } = await client.from("inventory").select("id, current_stock, reorder_point");
          if (inv) {
            stats.total_products = inv.length;
            stats.low_stock_items = inv.filter(i => i.current_stock <= (i.reorder_point || 0)).length;
          }
        }

        // HR stats (admin, hr)
        if (isAdmin || isHR) {
          const today = new Date().toISOString().split("T")[0];
          const { data: todayAttendance } = await client.from("attendance_logs").select("id, status, check_in_time").eq("date", today);
          const { data: activeEmps } = await client.from("employees").select("id").eq("is_active", true);
          if (todayAttendance && activeEmps) {
            stats.total_active_employees = activeEmps.length;
            stats.checked_in_today = todayAttendance.length;
            stats.absent_today = activeEmps.length - todayAttendance.length;
            stats.late_arrivals_today = todayAttendance.filter(a => a.check_in_time && a.check_in_time > `${today}T09:30:00`).length;
          }
          const { data: pendingLeaves } = await client.from("leave_requests").select("id", { count: "exact" }).eq("status", "pending");
          stats.pending_leave_requests = pendingLeaves?.length || 0;
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

      // --- ACTIONABLE COMMANDS ---
      case "update_order_status": {
        const orderNum = args.order_number as string;
        const newStatus = args.new_status as string;
        const validStatuses = ["confirmed", "dispatched", "delivered", "cancelled"];
        if (!validStatuses.includes(newStatus)) {
          return JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
        }
        const { data: orderMatch } = await client.from("orders").select("id, order_number, status").ilike("order_number", orderNum).limit(1);
        if (!orderMatch?.length) return JSON.stringify({ error: `Order ${orderNum} not found` });
        if (isSales && !isAdmin && !isSalesManager) {
          const { data: ownOrder } = await client.from("orders").select("id").eq("id", orderMatch[0].id).eq("sales_person_id", userId);
          if (!ownOrder?.length) return JSON.stringify({ error: "You don't have permission to update this order" });
        }
        const { error: updateErr } = await client.from("orders").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", orderMatch[0].id);
        if (updateErr) throw updateErr;
        await client.from("ai_action_logs").insert({ user_id: userId, action_type: "update_order_status", payload: { order_number: orderNum, old_status: orderMatch[0].status, new_status: newStatus }, status: "executed" }).catch(() => {});
        return JSON.stringify({ success: true, message: `Order ${orderNum} status updated from "${orderMatch[0].status}" to "${newStatus}"` });
      }

      case "update_enquiry_status": {
        const enquiryId = args.enquiry_id as string;
        const newStatus = args.new_status as string;
        const validStatuses = ["new", "responded", "on_hold", "moved_to_pipeline", "order_won", "order_lost"];
        if (!validStatuses.includes(newStatus)) {
          return JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
        }
        const { data: enqMatch } = await client.from("enquiries").select("id, status").eq("id", enquiryId).limit(1);
        if (!enqMatch?.length) return JSON.stringify({ error: "Enquiry not found" });
        if (isSales && !isAdmin && !isSalesManager) {
          const { data: ownEnq } = await client.from("enquiries").select("id").eq("id", enquiryId).eq("sales_person_id", userId);
          if (!ownEnq?.length) return JSON.stringify({ error: "You don't have permission to update this enquiry" });
        }
        const { error: updateErr } = await client.from("enquiries").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", enquiryId);
        if (updateErr) throw updateErr;
        await client.from("ai_action_logs").insert({ user_id: userId, action_type: "update_enquiry_status", payload: { enquiry_id: enquiryId, old_status: enqMatch[0].status, new_status: newStatus }, status: "executed" }).catch(() => {});
        return JSON.stringify({ success: true, message: `Enquiry status updated from "${enqMatch[0].status}" to "${newStatus}"` });
      }

      case "update_task_status": {
        const taskId = args.task_id as string;
        const newStatus = args.new_status as string;
        const validStatuses = ["pending", "in_progress", "completed"];
        if (!validStatuses.includes(newStatus)) {
          return JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
        }
        const { data: taskMatch } = await client.from("tasks").select("id, status, title").eq("id", taskId).limit(1);
        if (!taskMatch?.length) return JSON.stringify({ error: "Task not found" });
        if (!isAdmin && !isSalesManager) {
          const { data: ownTask } = await client.from("tasks").select("id").eq("id", taskId).eq("assigned_to", userId);
          if (!ownTask?.length) return JSON.stringify({ error: "You can only update tasks assigned to you" });
        }
        const updateData: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() };
        if (newStatus === "completed") updateData.completed_at = new Date().toISOString();
        const { error: updateErr } = await client.from("tasks").update(updateData).eq("id", taskId);
        if (updateErr) throw updateErr;
        await client.from("ai_action_logs").insert({ user_id: userId, action_type: "update_task_status", payload: { task_id: taskId, old_status: taskMatch[0].status, new_status: newStatus, task_title: taskMatch[0].title }, status: "executed" }).catch(() => {});
        return JSON.stringify({ success: true, message: `Task "${taskMatch[0].title}" updated to "${newStatus}"` });
      }

      case "create_task": {
        const title = args.title as string;
        const description = (args.description as string) || "";
        const assignedToName = args.assigned_to_name as string;
        const priority = (args.priority as number) || 2;
        const dueDate = (args.due_date as string) || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        const { data: assignee } = await client.from("profiles")
          .select("user_id, name")
          .ilike("name", `%${assignedToName}%`)
          .limit(1)
          .single();

        const { data: task, error: taskErr } = await client.from("tasks").insert({
          title,
          description,
          task_type: "sales_followup",
          assigned_to: assignee?.user_id || userId,
          assigned_to_name: assignee?.name || assignedToName,
          assigned_role: "sales",
          priority,
          due_date: dueDate,
          created_by: userId,
          created_by_name: (await client.from("profiles").select("name").eq("user_id", userId).single()).data?.name || "AI",
          status: "new",
        }).select("id, title").single();

        if (taskErr) throw taskErr;

        await client.from("ai_action_logs").insert({
          user_id: userId,
          action_type: "create_task",
          payload: { title, assigned_to_name: assignedToName, priority, due_date: dueDate },
          status: "executed",
          result: { task_id: task?.id },
        });

        return JSON.stringify({ success: true, message: `✅ Task "${title}" created and assigned to ${assignee?.name || assignedToName}`, task_id: task?.id });
      }

      case "create_payment_followup": {
        const orderNum = args.order_number as string;
        const { data: orderMatch } = await client.from("orders")
          .select("id, order_number, customer_name, total_sales_amount, amount_paid, sales_person_id, sales_person_name")
          .ilike("order_number", orderNum)
          .limit(1);

        if (!orderMatch?.length) return JSON.stringify({ error: `Order ${orderNum} not found` });
        const order = orderMatch[0];
        const pendingAmount = (order.total_sales_amount || 0) - (order.amount_paid || 0);

        if (pendingAmount <= 0) return JSON.stringify({ message: `Order ${orderNum} has no pending payments.` });

        const profileData = await client.from("profiles").select("name").eq("user_id", userId).single();

        const { data: task, error: taskErr } = await client.from("tasks").insert({
          title: `💰 Payment follow-up: ${order.customer_name} - ₹${pendingAmount.toLocaleString("en-IN")}`,
          description: `Order ${order.order_number}. Total: ₹${(order.total_sales_amount || 0).toLocaleString("en-IN")}, Received: ₹${(order.amount_paid || 0).toLocaleString("en-IN")}, Pending: ₹${pendingAmount.toLocaleString("en-IN")}`,
          task_type: "finance_review",
          assigned_to: order.sales_person_id || userId,
          assigned_to_name: order.sales_person_name || profileData.data?.name || "User",
          assigned_role: "sales",
          priority: 1,
          due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          created_by: userId,
          created_by_name: profileData.data?.name || "AI",
          status: "new",
        }).select("id").single();

        if (taskErr) throw taskErr;

        await client.from("ai_action_logs").insert({
          user_id: userId,
          action_type: "create_payment_followup",
          payload: { order_number: orderNum, order_id: order.id, pending_amount: pendingAmount },
          status: "executed",
          result: { task_id: task?.id },
        });

        return JSON.stringify({ success: true, message: `✅ Payment follow-up task created for ${order.customer_name} (₹${pendingAmount.toLocaleString("en-IN")} pending)` });
      }

      case "get_daily_briefing": {
        const briefing: Record<string, unknown> = {};
        const today = new Date().toISOString().split("T")[0];

        // --- HR-specific briefing ---
        if (isAdmin || isHR) {
          // Today's attendance summary
          const { data: todayLogs } = await client.from("attendance_logs").select("id, employee_id, check_in_time, status, checkout_missing").eq("date", today);
          const { data: activeEmps } = await client.from("employees").select("id, name, department").eq("is_active", true);
          
          if (todayLogs && activeEmps) {
            const checkedInIds = new Set(todayLogs.map(l => l.employee_id));
            const absentees = activeEmps.filter(e => !checkedInIds.has(e.id));
            const lateArrivals = todayLogs.filter(l => l.check_in_time && l.check_in_time > `${today}T09:30:00`);
            const missingCheckout = todayLogs.filter(l => l.checkout_missing);
            
            briefing.attendance_summary = {
              total_active: activeEmps.length,
              checked_in: todayLogs.length,
              absent_count: absentees.length,
              absent_employees: absentees.slice(0, 10).map(e => ({ name: e.name, department: e.department })),
              late_arrivals_count: lateArrivals.length,
              missing_checkout_count: missingCheckout.length,
            };
          }
          
          // Pending leave requests
          const { data: pendingLeaves } = await client.from("leave_requests").select("id, employee_id, leave_type, start_date, end_date, total_days, created_at").eq("status", "pending").order("created_at").limit(10);
          if (pendingLeaves?.length) {
            const leaveEmpIds = [...new Set(pendingLeaves.map(l => l.employee_id))];
            const { data: leaveEmps } = await client.from("employees").select("id, name").in("id", leaveEmpIds);
            const empMap = Object.fromEntries((leaveEmps || []).map(e => [e.id, e.name]));
            briefing.pending_leaves = {
              count: pendingLeaves.length,
              records: pendingLeaves.map(l => ({ ...l, employee_name: empMap[l.employee_id] || "Unknown" })),
            };
          } else {
            briefing.pending_leaves = { count: 0, records: [] };
          }
          
          // Employees on leave today
          const { data: onLeaveToday } = await client.from("leave_requests").select("id, employee_id, leave_type, start_date, end_date").eq("status", "approved").lte("start_date", today).gte("end_date", today).limit(20);
          if (onLeaveToday?.length) {
            const leaveEmpIds2 = [...new Set(onLeaveToday.map(l => l.employee_id))];
            const { data: leaveEmps2 } = await client.from("employees").select("id, name, department").in("id", leaveEmpIds2);
            const empMap2 = Object.fromEntries((leaveEmps2 || []).map(e => [e.id, e]));
            briefing.on_leave_today = {
              count: onLeaveToday.length,
              records: onLeaveToday.map(l => ({ ...l, employee_name: empMap2[l.employee_id]?.name || "Unknown", department: empMap2[l.employee_id]?.department || "Unknown" })),
            };
          } else {
            briefing.on_leave_today = { count: 0, records: [] };
          }
        }

        // --- Sales/Finance briefing ---
        if (isAdmin || isSalesManager || isSales || isFinance) {
          // Overdue payments
          const overdueQuery = isAdmin || isSalesManager || isFinance
            ? client.from("orders").select("id, order_number, customer_name, total_sales_amount, amount_paid, payment_due_date").in("payment_status", ["pending", "partial"]).lt("payment_due_date", today).order("payment_due_date").limit(10)
            : client.from("orders").select("id, order_number, customer_name, total_sales_amount, amount_paid, payment_due_date").eq("sales_person_id", userId).in("payment_status", ["pending", "partial"]).lt("payment_due_date", today).order("payment_due_date").limit(10);
          const { data: overdue } = await overdueQuery;
          briefing.overdue_payments = { count: overdue?.length || 0, records: overdue || [] };
        }

        if (isAdmin || isSalesManager || isSales) {
          // Stalled pipeline (no update in 7+ days)
          const stalledDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const stalledQuery = isAdmin || isSalesManager
            ? client.from("pipeline_orders").select("id, customer_name, product_name, expected_price, updated_at, status").eq("status", "active").lt("updated_at", stalledDate).limit(10)
            : client.from("pipeline_orders").select("id, customer_name, product_name, expected_price, updated_at, status").eq("sales_person_id", userId).eq("status", "active").lt("updated_at", stalledDate).limit(10);
          const { data: stalled } = await stalledQuery;
          briefing.stalled_deals = { count: stalled?.length || 0, records: stalled || [] };

          // Recent hot leads (last 24h)
          const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const hotQuery = isAdmin || isSalesManager
            ? client.from("enquiries").select("id, customer_name, product_name, probability_to_close, created_at").gte("probability_to_close", 70).gte("created_at", yesterday).limit(5)
            : client.from("enquiries").select("id, customer_name, product_name, probability_to_close, created_at").eq("sales_person_id", userId).gte("probability_to_close", 70).gte("created_at", yesterday).limit(5);
          const { data: newHot } = await hotQuery;
          briefing.new_hot_leads = { count: newHot?.length || 0, records: newHot || [] };
        }

        // --- Operations briefing ---
        if (isAdmin || roles.includes("supply_chain")) {
          const { data: lowStock } = await client.from("inventory").select("id, product_name, current_stock, reorder_point").gt("reorder_point", 0);
          const lowItems = (lowStock || []).filter(i => i.current_stock <= (i.reorder_point || 0));
          briefing.low_stock_alerts = { count: lowItems.length, items: lowItems.slice(0, 5) };
          
          // Delayed procurements
          const { data: delayedProc } = await client.from("inventory_procurements").select("id, procurement_number, product_name, supplier_name, status, procurement_date").in("status", ["pending", "ordered"]).lt("procurement_date", today).order("procurement_date").limit(10);
          briefing.delayed_procurements = { count: delayedProc?.length || 0, records: delayedProc || [] };
        }

        // --- Urgent tasks (all roles) ---
        const { data: urgentTasks } = await client.from("tasks").select("id, title, due_date, priority, status")
          .eq("assigned_to", userId).in("status", ["pending", "in_progress"]).lte("due_date", `${today}T23:59:59`).order("due_date").limit(10);
        briefing.urgent_tasks = { count: urgentTasks?.length || 0, records: urgentTasks || [] };

        return JSON.stringify(briefing);
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
    const allAllowedTools = new Set<string>();
    for (const role of roles) {
      for (const tool of (ROLE_MODULE_ACCESS[role] || [])) {
        allAllowedTools.add(tool);
      }
    }
    const filteredTools = DATA_TOOLS.filter(t => allAllowedTools.has(t.function.name));

    const today = new Date().toISOString().split("T")[0];
    const rolePersonality = getRolePersonality(roles);
    const roleTitle = getRoleTitle(roles);
    
    const systemPrompt = `${rolePersonality}

User: ${userName}
Roles: ${roles.join(", ")}
AI Panel Title: ${roleTitle}
Today's date: ${today}

You can query the system's data using the available tools. When the user asks about data, use the appropriate tool to fetch it, then present the results clearly.

IMPORTANT — Date filtering:
- All query tools support date_from and date_to parameters (ISO format YYYY-MM-DD).
- When users ask "this month", "last week", "today", "this year", etc., calculate the correct date range from today's date and pass date_from/date_to.
- Example: "orders this month" with today=${today} → date_from="${today.substring(0, 8)}01", date_to="${today}"
- Example: "last 7 days" → calculate date_from as 7 days ago
- get_dashboard_stats also supports date_from/date_to for time-specific summaries.

CRITICAL — Aggregation & Analysis:
- You ARE capable of performing aggregation, grouping, summarization, and analysis on the data returned by tools.
- When the user asks for breakdowns (e.g., "product-wise", "salesperson-wise", "category-wise", "status-wise", "state-wise", "department-wise"), fetch the data using the query tool with a HIGH limit (200-500) and then group/aggregate the results yourself.
- Present aggregated results in markdown tables with proper totals.
- Always show both count and total amounts in aggregation tables where applicable.
- Common aggregation patterns you should handle:
  * Group by product_name/product_category → count + sum of total_sales_amount
  * Group by sales_person_name → count + sum of amounts
  * Group by status/payment_status → count + sum
  * Group by department → count employees/attendance
  * Top N analysis (top customers, top products, etc.)
  * Trend analysis (daily/weekly counts within a date range)
  * Comparisons (this month vs last month — make two tool calls)

ROLE-BASED DATA ISOLATION — CRITICAL:
${roles.includes("hr") && !roles.includes("admin") ? `- You are HR. You can access: employees, attendance, leave, payroll, tasks, tickets.
- You CANNOT access: order amounts, revenue, cost prices, expenses, pipeline deals, procurement costs. If asked about financial data, explain you only have access to HR modules.` : ""}
${roles.includes("finance") && !roles.includes("admin") ? `- You are Finance. You can access: orders (payments), expenses, procurements, expected payments, tasks.
- You CANNOT access: employee salaries, attendance details, leave records, personal HR data. If asked about HR data, explain you only have access to financial modules.` : ""}
${roles.includes("sales") && !roles.includes("admin") && !roles.includes("sales_manager") ? `- You are Sales. You can ONLY see your own leads, orders, and pipeline.
- You CANNOT access: other salespeople's data, employee data, salaries, expenses, or procurement details.` : ""}

Guidelines:
- Be concise, conversational, and professional
- Format prices with ₹ symbol for Indian Rupees
- Present data in clean markdown tables or bullet points when showing multiple records
- Always include the count of records found
- If results are empty, say so clearly
- For dashboard/summary questions, use get_dashboard_stats
- For specific searches, use the appropriate query tool
- For analytics/breakdown queries, fetch all relevant data (high limit) then aggregate yourself
- Never fabricate data — only use what the tools return
- If the user asks about something outside your tools, explain what modules you can help with
- Respect that data is filtered based on the user's role
- When doing comparisons or multi-period analysis, make multiple tool calls as needed

RESPONSE FORMATTING — CRITICAL:
- NEVER dump raw column names or database field names in responses. Translate them to human-readable labels.
  - "customer_name" → "Customer", "product_name" → "Product", "total_sales_amount" → "Amount", "expected_closure_date" → "Expected Close Date", "sales_person_name" → "Salesperson", "employee_name" → "Employee", "check_in_time" → "Check-in"
- When presenting data, lead with a brief SUMMARY sentence first, then show details.
- For analytical responses, structure as: Summary → Key insights → Details (table/list).
- Keep table columns to 3-5 max. Pick the most relevant fields, don't show every column.
- Use natural language for single records.
- For lists of 3 or fewer items, use bullet points instead of tables.
- Round large numbers: ₹10,50,000 → ₹10.5L, ₹1,06,00,000 → ₹1.06 Cr
- Use markdown headers (##, ###) to section your response when it has multiple parts.
- Use **bold** for order numbers, customer names, and key figures.
- Add a brief "💡 Tip" or actionable insight at the end when relevant.

ACTIONABLE COMMANDS:
- You can update order statuses, enquiry statuses, task statuses, create tasks, and create payment follow-ups.
- For updates, ALWAYS confirm what you're about to do BEFORE executing.
- After executing an update, clearly confirm the result.
- If the user asks to update something and you need an ID, first query to find the record, then update.

SUGGESTED ACTIONS — CRITICAL:
After presenting data analysis, proactively suggest relevant actions the user can take. Format suggested actions as a special block:

\`\`\`actions
[{"label":"Follow up payment for Order X","action_type":"create_payment_followup","payload":{"order_number":"ORD2500168"}},{"label":"Create task for sales team","action_type":"create_task","payload":{"title":"Follow up hot leads","assigned_to_name":"Sales Team"}}]
\`\`\`

Rules for suggested actions:
- Only suggest actions the user's role allows
- Include 1-3 most relevant actions based on the data shown
- Supported action_types: create_task, update_lead_status, update_order_status, update_task_status, create_payment_followup

DAILY BRIEFING:
- When user asks for "daily briefing", "morning summary", or "what should I focus on", use the get_daily_briefing tool.
- Present the briefing with role-appropriate sections:
  ${roles.includes("hr") || roles.includes("admin") ? "* HR: 👥 Attendance Summary, 📋 Pending Leave Requests, 🏠 On Leave Today" : ""}
  ${roles.includes("sales") || roles.includes("sales_manager") || roles.includes("admin") ? "* Sales: 🔴 Overdue Payments, 📊 Stalled Deals, 🔥 New Hot Leads" : ""}
  ${roles.includes("finance") || roles.includes("admin") ? "* Finance: 🔴 Overdue Payments, 💰 Cashflow Alerts" : ""}
  ${roles.includes("supply_chain") || roles.includes("admin") ? "* Operations: 📦 Low Stock, 🚚 Delayed Procurements" : ""}
  * All: ⚡ Urgent Tasks
- Prioritize actionable items and give specific recommendations.

VISUAL CHARTS — You can render interactive charts by outputting a special code block:

\`\`\`chart
{"type":"bar","title":"Orders by Product","data":[{"name":"DJI Mini","count":5,"revenue":250000}],"xKey":"name","yKeys":["count","revenue"]}
\`\`\`

Chart types: "bar", "pie", "line"
- Use charts when the user asks for breakdowns, comparisons, trends, distributions, or analytics
- Do NOT use charts for simple counts or single-value answers

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
      if (assistantMessage?.content) {
        const encoder = new TextEncoder();
        const sseData = `data: ${JSON.stringify({
          choices: [{ delta: { content: assistantMessage.content, role: "assistant" }, finish_reason: "stop" }]
        })}\n\ndata: [DONE]\n\n`;
        return new Response(encoder.encode(sseData), {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }
      
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
