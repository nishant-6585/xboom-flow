// @ts-nocheck
// TEMP: Disabled TypeScript checking due to Supabase Deno SDK type inference issue
// Do NOT remove until Database types are available in edge runtime
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

// =====================================================
// SENSITIVE FIELD DEFINITIONS & MASKING ENGINE
// =====================================================

// Fields that are ALWAYS blocked (never sent to AI for non-admin)
const HARD_BLOCKED_FIELDS = [
  "bank_account", "ifsc_code", "pan_number", "personal_email",
  "emergency_contact_phone", "emergency_contact_name", "emergency_contact_relation",
  "date_of_birth", "monthly_salary", "tax_regime",
];

// Fields that get partial masking (show last 4 chars)
const PARTIAL_MASK_FIELDS = ["phone", "caller_number", "customer_phone"];

// Module-level sensitive field map: which roles can see which sensitive fields
const SENSITIVE_FIELD_ACCESS: Record<string, Record<string, boolean>> = {
  // salary-related: only HR + Admin
  monthly_salary: { admin: true, hr: true },
  tax_regime: { admin: true, hr: true },
  // bank details: only HR + Admin + Finance (masked for finance)
  bank_account: { admin: true, hr: true },
  ifsc_code: { admin: true, hr: true },
  pan_number: { admin: true, hr: true },
  // personal info: only HR + Admin
  personal_email: { admin: true, hr: true },
  date_of_birth: { admin: true, hr: true },
  emergency_contact_phone: { admin: true, hr: true },
  emergency_contact_name: { admin: true, hr: true },
  emergency_contact_relation: { admin: true, hr: true },
};

// Access level types
type AccessLevel = "full" | "masked" | "denied";

// Determine access level for a tool given user roles
function getAccessLevel(toolName: string, roles: string[]): AccessLevel {
  const isAdmin = roles.includes("admin");
  if (isAdmin) return "full";

  // Cross-module access rules
  const DENIED_TOOLS: Record<string, string[]> = {
    // Sales cannot access HR/Finance sensitive tools
    sales: ["query_salary_sheets", "query_leave_balances"],
    sales_manager: ["query_salary_sheets"],
    // Finance cannot access HR personal data tools
    finance: ["query_salary_sheets", "query_leave_requests", "query_leave_balances", "query_attendance"],
    // HR cannot access financial detail tools
    hr: ["query_expected_payments"],
    // Supply chain restricted
    supply_chain: ["query_salary_sheets", "query_leave_requests", "query_leave_balances", "query_attendance"],
    // IT restricted
    it: ["query_salary_sheets", "query_leave_requests", "query_leave_balances", "query_attendance", "query_expected_payments", "query_expenses"],
    // Marketing restricted
    marketing: ["query_salary_sheets", "query_leave_requests", "query_leave_balances", "query_attendance", "query_expected_payments", "query_expenses", "query_employees"],
  };

  for (const role of roles) {
    if (DENIED_TOOLS[role]?.includes(toolName)) {
      return "denied";
    }
  }

  // Cross-module queries get masked data
  const MASKED_TOOLS: Record<string, string[]> = {
    sales: ["query_employees", "query_expenses", "query_procurements"],
    finance: ["query_employees"],
    supply_chain: ["query_employees"],
    marketing: ["query_employees"],
  };

  for (const role of roles) {
    if (MASKED_TOOLS[role]?.includes(toolName)) {
      return "masked";
    }
  }

  return "full";
}

// Smart denial messages with explainable access
const SMART_DENIALS: Record<string, { message: string; who_can_access: string; alternative: string; data_type: string }> = {
  query_salary_sheets: {
    message: "Salary/payroll data is classified as **sensitive HR information** and is restricted to HR and Admin roles.",
    who_can_access: "HR Team or Admin",
    alternative: "I can tell you the payroll processing status (draft/finalized) without revealing amounts.",
    data_type: "salary",
  },
  query_leave_balances: {
    message: "Leave balance details are classified as **personal HR data** and managed by the HR team.",
    who_can_access: "HR Team or Admin",
    alternative: "I can confirm the leave system is operational. For specific balances, please contact HR.",
    data_type: "leave",
  },
  query_leave_requests: {
    message: "Leave request data is classified as **personal HR information** and restricted to HR and Admin roles.",
    who_can_access: "HR Team or Admin",
    alternative: "I can help with modules relevant to your role. For leave queries, please contact your HR representative.",
    data_type: "leave",
  },
  query_attendance: {
    message: "Attendance data is classified as **employee personal information** and restricted to HR and Admin roles.",
    who_can_access: "HR Team or Admin",
    alternative: "I can help with workforce availability insights at a high level without revealing individual attendance records.",
    data_type: "attendance",
  },
  query_expected_payments: {
    message: "Expected payment schedules are classified as **financial data** and restricted to Finance and Admin roles.",
    who_can_access: "Finance Team or Admin",
    alternative: "I can share order payment status (paid/pending) without revealing specific payment schedules.",
    data_type: "payment",
  },
  query_expenses: {
    message: "Expense data is classified as **financial information** and restricted to Finance and Admin roles.",
    who_can_access: "Finance Team or Admin",
    alternative: "I can help with other modules. For expense-related queries, please contact the Finance team.",
    data_type: "expense",
  },
  query_employees: {
    message: "Detailed employee information is classified as **personal HR data** and restricted to HR and Admin roles.",
    who_can_access: "HR Team or Admin",
    alternative: "I can share high-level team structure and department-wise headcount information.",
    data_type: "employee_personal",
  },
};

// Check for temporary permissions
async function checkTempPermission(
  client: any,
  userId: string,
  dataType: string,
  targetEntityId?: string
): Promise<boolean> {
  const now = new Date().toISOString();
  let query = client.from("ai_temp_permissions")
    .select("id")
    .eq("user_id", userId)
    .eq("data_type", dataType)
    .gt("expires_at", now);
  
  if (targetEntityId) {
    query = query.or(`target_entity_id.eq.${targetEntityId},target_entity_id.is.null`);
  }
  
  const { data } = await query.limit(1);
  return (data?.length || 0) > 0;
}

// Strip sensitive fields from records based on roles
function stripSensitiveFields(
  records: Record<string, unknown>[],
  roles: string[],
  accessLevel: AccessLevel
): { cleaned: Record<string, unknown>[]; maskedFields: string[] } {
  const isAdmin = roles.includes("admin");
  if (isAdmin || accessLevel === "full") {
    if (isAdmin) return { cleaned: records, maskedFields: [] };
  }

  const maskedFields: Set<string> = new Set();
  
  const cleaned = records.map(record => {
    const cleanedRecord: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (HARD_BLOCKED_FIELDS.includes(key)) {
        const fieldAccess = SENSITIVE_FIELD_ACCESS[key];
        const hasAccess = fieldAccess && roles.some(r => fieldAccess[r]);
        if (!hasAccess) {
          maskedFields.add(key);
          continue;
        }
      }

      if (accessLevel === "masked" && PARTIAL_MASK_FIELDS.includes(key) && typeof value === "string" && value.length > 4) {
        cleanedRecord[key] = "XXXXX" + value.slice(-4);
        maskedFields.add(key);
        continue;
      }

      cleanedRecord[key] = value;
    }
    return cleanedRecord;
  });

  return { cleaned, maskedFields: Array.from(maskedFields) };
}

// Log access to ai_access_logs
async function logAccess(
  client: any,
  userId: string,
  roles: string[],
  queryText: string,
  toolName: string,
  accessType: AccessLevel,
  maskedFields: string[] = [],
  deniedReason?: string,
  approvalRefId?: string
) {
  try {
    await client.from("ai_access_logs").insert({
      user_id: userId,
      user_role: roles.join(","),
      query_text: queryText.substring(0, 500),
      tool_name: toolName,
      access_type: accessType,
      masked_fields: maskedFields,
      denied_reason: deniedReason || null,
      approval_reference_id: approvalRefId || null,
    });
  } catch (e) {
    console.error("Failed to log AI access:", e);
  }
}

function formatIndianNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function isOrdersSalespersonBreakdownQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  const mentionsOrders = /\b(order|orders|sales|closures?)\b/.test(normalized);
  const mentionsSalesperson =
    /salesperson/.test(normalized) ||
    /sales person/.test(normalized) ||
    /salesperson[-\s]?wise/.test(normalized) ||
    /by salesperson/.test(normalized) ||
    /salesperson vise/.test(normalized);

  return mentionsOrders && mentionsSalesperson;
}

function formatPeriodLabel(dateFrom?: string, dateTo?: string): string {
  if (dateFrom && dateTo && dateFrom.slice(0, 7) === dateTo.slice(0, 7)) {
    const [year, month] = dateFrom.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  if (dateFrom && dateTo) return `${dateFrom} to ${dateTo}`;
  if (dateFrom) return `from ${dateFrom}`;
  if (dateTo) return `up to ${dateTo}`;
  return "the selected period";
}

function buildOrderSalespersonBreakdownMessage(
  lastUserMessage: string,
  assistantMessage: { tool_calls?: Array<{ id: string; function: { name: string; arguments?: string } }> },
  toolResults: { role: string; tool_call_id: string; content: string }[]
): string | null {
  if (!isOrdersSalespersonBreakdownQuery(lastUserMessage)) return null;

  const queryOrdersCall = assistantMessage.tool_calls?.find(
    (toolCall) => toolCall.function?.name === "query_orders"
  );
  if (!queryOrdersCall) return null;

  const toolResult = toolResults.find((result) => result.tool_call_id === queryOrdersCall.id);
  if (!toolResult) return null;

  let parsedArgs: Record<string, unknown> = {};
  let parsedResult: { records?: Record<string, unknown>[]; count?: number } = {};

  try {
    parsedArgs = JSON.parse(queryOrdersCall.function.arguments || "{}");
    parsedResult = JSON.parse(toolResult.content || "{}");
  } catch {
    return null;
  }

  const records = Array.isArray(parsedResult.records) ? parsedResult.records : [];
  if (records.length === 0) {
    return `I couldn’t find any orders for ${formatPeriodLabel(
      typeof parsedArgs.date_from === "string" ? parsedArgs.date_from : undefined,
      typeof parsedArgs.date_to === "string" ? parsedArgs.date_to : undefined,
    )}.`;
  }

  const grouped = new Map<string, { orders: number; totalSales: number }>();
  let grandTotalOrders = 0;
  let grandTotalSales = 0;
  let unassignedOrders = 0;

  for (const record of records) {
    const salesperson = typeof record.sales_person_name === "string" && record.sales_person_name.trim()
      ? record.sales_person_name.trim()
      : "Unassigned";
    const totalSalesAmount = Number(record.total_sales_amount ?? 0) || 0;
    const current = grouped.get(salesperson) ?? { orders: 0, totalSales: 0 };

    current.orders += 1;
    current.totalSales += totalSalesAmount;
    grouped.set(salesperson, current);

    grandTotalOrders += 1;
    grandTotalSales += totalSalesAmount;
    if (salesperson === "Unassigned") unassignedOrders += 1;
  }

  const rows = Array.from(grouped.entries()).sort((a, b) => {
    if (b[1].orders !== a[1].orders) return b[1].orders - a[1].orders;
    if (b[1].totalSales !== a[1].totalSales) return b[1].totalSales - a[1].totalSales;
    return a[0].localeCompare(b[0]);
  });

  const dateFrom = typeof parsedArgs.date_from === "string" ? parsedArgs.date_from : undefined;
  const dateTo = typeof parsedArgs.date_to === "string" ? parsedArgs.date_to : undefined;
  const excludeCancelled = parsedArgs.status ? false : parsedArgs.exclude_cancelled !== false;
  const heading = `Salesperson-wise order breakdown for ${formatPeriodLabel(dateFrom, dateTo)}${excludeCancelled ? " (excluding cancelled orders)" : ""}:`;

  const messageLines = [
    heading,
    "",
    "| Salesperson | Total Orders | Total Sales Amount (₹) |",
    "| --- | ---: | ---: |",
    ...rows.map(([salesperson, summary]) => `| ${escapeMarkdownCell(salesperson)} | ${summary.orders} | ${formatIndianNumber(summary.totalSales)} |`),
    `| **Grand Total** | **${grandTotalOrders}** | **${formatIndianNumber(grandTotalSales)}** |`,
  ];

  if (unassignedOrders > 0) {
    messageLines.push(
      "",
      `Note: ${unassignedOrders} ${unassignedOrders === 1 ? "order was" : "orders were"} grouped under **Unassigned** because the salesperson name was blank.`,
    );
  }

  messageLines.push(
    "",
    `This summary is calculated directly from **${grandTotalOrders}** order records returned by the database.`,
  );

  return messageLines.join("\n");
}


// =====================================================
// TOOL DEFINITIONS
// =====================================================

const DATA_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "query_orders",
      description: "Search orders by customer name, order number, status, product, or date range. Returns order details including amounts, payment status, and delivery info. IMPORTANT: For any aggregation, monthly totals, closures, or salesperson breakdown queries, ALWAYS set limit=500 and exclude_cancelled=true.",
      parameters: {
        type: "object" as const,
        properties: {
          search: { type: "string" as const, description: "Search term (customer name, order number, product)" },
          status: { type: "string" as const, description: "Filter by order status: po_received, procurement_to_plan, in_transit, delivery_done, payment_received, partial_payment_received, cancelled" },
          payment_status: { type: "string" as const, description: "Filter by payment: pending, partial, paid" },
          date_from: { type: "string" as const, description: "Start date filter (ISO format YYYY-MM-DD). Filters by order_date first, with created_at fallback when order_date is missing." },
          date_to: { type: "string" as const, description: "End date filter (ISO format YYYY-MM-DD). Filters by order_date first, with created_at fallback when order_date is missing." },
          exclude_cancelled: { type: "boolean" as const, description: "If true, excludes cancelled orders. ALWAYS set to true for closures, sales totals, revenue reports. Default: false." },
          limit: { type: "number" as const, description: "Max results. MUST use 500 for monthly/aggregation queries. Default: 200." },
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

// =====================================================
// ROLE-BASED MODULE ACCESS MAP
// =====================================================

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

// =====================================================
// ROLE-SPECIFIC SYSTEM PROMPT PERSONALITIES
// =====================================================

function getRolePersonality(roles: string[]): string {
  const isAdmin = roles.includes("admin");
  if (isAdmin) {
    return `You are the EXECUTIVE COMMAND CENTER assistant. You have full visibility across all departments — Sales, Finance, HR, Operations, IT. You provide strategic oversight, cross-department intelligence, and help the admin make data-driven decisions. Surface anomalies, risks, and opportunities proactively.`;
  }
  if (roles.includes("hr")) {
    return `You are a PEOPLE OPERATIONS assistant specialized in HR management. Your primary focus is workforce analytics — attendance patterns, leave management, employee engagement, payroll status, and hiring pipeline. You help HR make informed decisions about people, identify attendance anomalies, and track workforce health. You do NOT have access to financial data (revenue, order amounts, cost prices) or sales pipeline details.`;
  }
  if (roles.includes("finance")) {
    return `You are a CASHFLOW & RECOVERY assistant specialized in financial operations. Your primary focus is payment tracking, overdue recovery, expense management, cashflow forecasting, and financial risk assessment. You do NOT have access to HR personal data (salaries, attendance, leave details) or detailed employee information.`;
  }
  if (roles.includes("sales_manager")) {
    return `You are a REVENUE INTELLIGENCE assistant for sales leadership. Your focus is team performance, pipeline health, conversion analytics, and deal velocity.`;
  }
  if (roles.includes("sales")) {
    return `You are a DEAL CLOSING assistant for the sales team. Your focus is personal pipeline management, lead prioritization, follow-up scheduling, and closing strategies. You can only see your own leads and orders.`;
  }
  if (roles.includes("supply_chain")) {
    return `You are a SUPPLY CHAIN INTELLIGENCE assistant. Your focus is procurement optimization, inventory management, supplier performance, and order fulfillment.`;
  }
  if (roles.includes("it")) {
    return `You are an IT OPERATIONS assistant. Your focus is ticket management, system health, and technical issue resolution.`;
  }
  if (roles.includes("marketing")) {
    return `You are a MARKET INTELLIGENCE assistant. Your focus is lead quality analysis, campaign effectiveness, and market trends from enquiry data.`;
  }
  return `You are a helpful workspace assistant. You can help with tasks and basic queries.`;
}

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

// =====================================================
// TOOL EXECUTION ENGINE (with masking)
// =====================================================

async function executeToolCall(
  client: any,
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
  roles: string[],
  lastUserMessage: string
): Promise<string> {
  const limit = Math.min(Number(args.limit) || 200, 500);
  const isAdmin = roles.includes("admin");
  const isSalesManager = roles.includes("sales_manager");
  const isSales = roles.includes("sales");
  const isHR = roles.includes("hr");
  const isFinance = roles.includes("finance");

  // Sanitize user-controlled args before interpolation into PostgREST filter
  // strings. Strips characters (`,`, `(`, `)`, `"`) that could inject
  // additional filter clauses in `.or()`/`.filter()`, and enforces strict
  // date shapes so args.date_from/date_to cannot contain PostgREST
  // separators. Applies to every tool branch below.
  if (typeof args.search === "string") {
    const cleaned = args.search.replace(/[,()"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
    if (cleaned) args.search = cleaned; else delete args.search;
  } else if (args.search != null) {
    delete args.search;
  }
  for (const k of ["date_from", "date_to"]) {
    const v = (args as any)[k];
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      delete (args as any)[k];
    }
  }

  // Check tiered access level
  const accessLevel = getAccessLevel(toolName, roles);

  // DENIED: check temp permissions first, then return explainable denial
  if (accessLevel === "denied") {
    const denial = SMART_DENIALS[toolName];
    const dataType = denial?.data_type || toolName.replace("query_", "");
    
    // Check if user has a temporary permission grant
    const hasTempAccess = await checkTempPermission(client, userId, dataType);
    if (hasTempAccess) {
      // Temp permission found — allow access as "masked" level
      await logAccess(client, userId, roles, lastUserMessage, toolName, "masked", [], undefined, undefined);
      // Continue execution with masked access (fall through to switch)
    } else {
      const explainableResponse = {
        access_denied: true,
        access_level: "restricted",
        message: denial?.message || "You don't have access to this module. Please contact the relevant department.",
        who_can_access: denial?.who_can_access || "Admin",
        alternative: denial?.alternative || "I can help with modules relevant to your role.",
        data_type: dataType,
        can_request_access: true,
      };
      await logAccess(client, userId, roles, lastUserMessage, toolName, "denied", [], denial?.message || "Role not authorized");
      return JSON.stringify(explainableResponse);
    }
  }

  try {
    let result: string;

    switch (toolName) {
      case "query_orders": {
        // Auto-boost limit for date-range queries (aggregation/monthly reports)
        const hasDateRange = args.date_from || args.date_to;
        const effectiveLimit = hasDateRange ? Math.min(Math.max(Number(args.limit) || 500, 500), 1000) : limit;
        
        let query = client.from("orders").select("id, order_number, customer_name, customer_company, product_name, product_code, product_category, quantity, total_sales_amount, amount_paid, discount_amount, payment_status, status, sales_person_name, order_date, created_at, payment_due_date, shipping_address").order("order_date", { ascending: false }).limit(effectiveLimit);
        if (isSales && !isAdmin && !isSalesManager) query = query.eq("sales_person_id", userId);
        if (args.search) query = query.or(`customer_name.ilike.%${args.search}%,order_number.ilike.%${args.search}%,product_name.ilike.%${args.search}%,customer_company.ilike.%${args.search}%`);
        if (args.status) {
          query = query.eq("status", args.status);
        }
        if (args.payment_status) query = query.eq("payment_status", args.payment_status);
        
        // Build date + status filter together to avoid PostgREST OR/AND conflict
        const excludeCancelled = !args.status && args.exclude_cancelled !== false;
        if (args.date_from && args.date_to) {
          if (excludeCancelled) {
            query = query.or(`and(order_date.gte.${args.date_from},order_date.lte.${args.date_to},status.neq.cancelled),and(order_date.is.null,created_at.gte.${args.date_from}T00:00:00,created_at.lte.${args.date_to}T23:59:59,status.neq.cancelled)`);
          } else {
            query = query.or(`and(order_date.gte.${args.date_from},order_date.lte.${args.date_to}),and(order_date.is.null,created_at.gte.${args.date_from}T00:00:00,created_at.lte.${args.date_to}T23:59:59)`);
          }
        } else if (args.date_from) {
          if (excludeCancelled) {
            query = query.or(`and(order_date.gte.${args.date_from},status.neq.cancelled),and(order_date.is.null,created_at.gte.${args.date_from}T00:00:00,status.neq.cancelled)`);
          } else {
            query = query.or(`order_date.gte.${args.date_from},and(order_date.is.null,created_at.gte.${args.date_from}T00:00:00)`);
          }
        } else if (args.date_to) {
          if (excludeCancelled) {
            query = query.or(`and(order_date.lte.${args.date_to},status.neq.cancelled),and(order_date.is.null,created_at.lte.${args.date_to}T23:59:59,status.neq.cancelled)`);
          } else {
            query = query.or(`order_date.lte.${args.date_to},and(order_date.is.null,created_at.lte.${args.date_to}T23:59:59)`);
          }
        } else if (excludeCancelled) {
          // No date filter, just exclude cancelled
          query = query.neq("status", "cancelled");
        }
        const { data, error } = await query;
        if (error) throw error;
        const records = (data || []) as Record<string, unknown>[];
        const { cleaned, maskedFields } = stripSensitiveFields(records, roles, accessLevel);
        await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel, maskedFields);
        result = JSON.stringify({ count: cleaned.length, records: cleaned });
        break;
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
        const records = (data || []) as Record<string, unknown>[];
        const { cleaned, maskedFields } = stripSensitiveFields(records, roles, accessLevel);
        await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel, maskedFields);
        result = JSON.stringify({ count: cleaned.length, records: cleaned });
        break;
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
        await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
        result = JSON.stringify({ count: data?.length || 0, records: data || [] });
        break;
      }

      case "query_inventory": {
        let query = client.from("inventory").select("id, product_name, product_category, current_stock, reorder_point, safety_stock, last_restocked_at").order("product_name").limit(limit);
        if (args.search) query = query.or(`product_name.ilike.%${args.search}%,product_category.ilike.%${args.search}%`);
        if (args.low_stock_only) query = query.lte("current_stock", 10);
        const { data, error } = await query;
        if (error) throw error;
        await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
        result = JSON.stringify(data || []);
        break;
      }

      case "query_employees": {
        // For masked access (non-HR/admin), return only safe fields
        if (accessLevel === "masked") {
          let query = client.from("employees").select("id, name, department, designation, employment_status, is_active, work_location").order("name").limit(limit);
          if (args.search) query = query.or(`name.ilike.%${args.search}%,department.ilike.%${args.search}%`);
          if (args.department) query = query.eq("department", args.department);
          const { data, error } = await query;
          if (error) throw error;
          await logAccess(client, userId, roles, lastUserMessage, toolName, "masked", ["phone", "personal_email", "joining_date", "monthly_salary", "bank_account"]);
          result = JSON.stringify({ count: data?.length || 0, records: data || [], note: "Showing limited employee info. Personal details are restricted." });
          break;
        }

        if (!isAdmin && !isHR) {
          await logAccess(client, userId, roles, lastUserMessage, toolName, "denied", [], "Role not authorized");
          result = JSON.stringify({ access_denied: true, message: "Employee details are restricted to HR and Admin roles. I can share that employees are organized by department. Please contact HR for specific employee information." });
          break;
        }
        // Full access for HR/Admin — still strip hard-blocked for non-admin
        let query = client.from("employees").select("id, name, department, designation, employment_status, joining_date, is_active, work_location, shift_type, phone, personal_email, monthly_salary, bank_account, ifsc_code, pan_number").order("name").limit(limit);
        if (args.search) query = query.or(`name.ilike.%${args.search}%,department.ilike.%${args.search}%`);
        if (args.department) query = query.eq("department", args.department);
        const { data, error } = await query;
        if (error) throw error;
        const records = (data || []) as Record<string, unknown>[];
        const { cleaned, maskedFields } = stripSensitiveFields(records, roles, accessLevel);
        await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel, maskedFields);
        result = JSON.stringify({ count: cleaned.length, records: cleaned });
        break;
      }

      case "query_attendance": {
        if (!isAdmin && !isHR) {
          await logAccess(client, userId, roles, lastUserMessage, toolName, "denied", [], "Role not authorized");
          result = JSON.stringify({ access_denied: true, message: "Attendance data is restricted to HR and Admin roles. The attendance system is operational. Please contact HR for specific attendance queries." });
          break;
        }
        let query = client.from("attendance_logs").select("id, employee_id, date, check_in_time, check_out_time, working_hours, status, source, notes, total_break_minutes, auto_checkout_applied, checkout_missing").order("date", { ascending: false }).limit(limit);
        if (args.employee_name) {
          const { data: empMatch } = await client.from("employees").select("id").ilike("name", `%${args.employee_name}%`);
          if (empMatch?.length) {
            query = query.in("employee_id", empMatch.map(e => e.id));
          } else {
            result = JSON.stringify({ count: 0, records: [], message: "No employee found with that name" });
            await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
            break;
          }
        }
        if (args.department) {
          const { data: deptEmps } = await client.from("employees").select("id").eq("department", args.department);
          if (deptEmps?.length) query = query.in("employee_id", deptEmps.map(e => e.id));
        }
        if (args.status) query = query.eq("status", args.status);
        if (args.date_from) query = query.gte("date", args.date_from);
        if (args.date_to) query = query.lte("date", args.date_to);
        if (args.late_only) query = query.gt("check_in_time", `${args.date_from || new Date().toISOString().split("T")[0]}T09:30:00`);
        if (args.absent_only) query = query.eq("status", "absent");
        const { data, error } = await query;
        if (error) throw error;
        if (data?.length) {
          const empIds = [...new Set(data.map(d => d.employee_id))];
          const { data: emps } = await client.from("employees").select("id, name, department").in("id", empIds);
          const empMap = Object.fromEntries((emps || []).map(e => [e.id, e]));
          const enriched = data.map(d => ({ ...d, employee_name: empMap[d.employee_id]?.name || "Unknown", department: empMap[d.employee_id]?.department || "Unknown" }));
          await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
          result = JSON.stringify({ count: enriched.length, records: enriched });
        } else {
          await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
          result = JSON.stringify({ count: 0, records: [] });
        }
        break;
      }

      case "query_leave_requests": {
        if (!isAdmin && !isHR) {
          await logAccess(client, userId, roles, lastUserMessage, toolName, "denied", [], "Role not authorized");
          result = JSON.stringify({ access_denied: true, message: SMART_DENIALS.query_leave_requests });
          break;
        }
        let query = client.from("leave_requests").select("id, employee_id, leave_type, start_date, end_date, total_days, reason, status, applied_by_name, approved_by_name, created_at").order("created_at", { ascending: false }).limit(limit);
        if (args.employee_name) {
          const { data: empMatch } = await client.from("employees").select("id").ilike("name", `%${args.employee_name}%`);
          if (empMatch?.length) query = query.in("employee_id", empMatch.map(e => e.id));
          else { result = JSON.stringify({ count: 0, records: [] }); break; }
        }
        if (args.status) query = query.eq("status", args.status);
        if (args.leave_type) query = query.eq("leave_type", args.leave_type);
        if (args.date_from) query = query.gte("start_date", args.date_from);
        if (args.date_to) query = query.lte("start_date", args.date_to);
        const { data, error } = await query;
        if (error) throw error;
        if (data?.length) {
          const empIds = [...new Set(data.map(d => d.employee_id))];
          const { data: emps } = await client.from("employees").select("id, name, department").in("id", empIds);
          const empMap = Object.fromEntries((emps || []).map(e => [e.id, e]));
          const enriched = data.map(d => ({ ...d, employee_name: empMap[d.employee_id]?.name || "Unknown", department: empMap[d.employee_id]?.department || "Unknown" }));
          await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
          result = JSON.stringify({ count: enriched.length, records: enriched });
        } else {
          await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
          result = JSON.stringify({ count: 0, records: [] });
        }
        break;
      }

      case "query_leave_balances": {
        if (!isAdmin && !isHR) {
          await logAccess(client, userId, roles, lastUserMessage, toolName, "denied", [], "Role not authorized");
          result = JSON.stringify({ access_denied: true, message: SMART_DENIALS.query_leave_balances });
          break;
        }
        let empQuery = client.from("employees").select("id, name, department").eq("is_active", true).order("name").limit(limit);
        if (args.employee_name) empQuery = empQuery.ilike("name", `%${args.employee_name}%`);
        if (args.department) empQuery = empQuery.eq("department", args.department);
        const { data: emps, error: empErr } = await empQuery;
        if (empErr) throw empErr;
        if (!emps?.length) { result = JSON.stringify({ count: 0, records: [] }); break; }
        const empIds = emps.map(e => e.id);
        const currentYear = new Date().getFullYear();
        const { data: balances } = await client.from("leave_balances").select("employee_id, leave_type, balance, year").in("employee_id", empIds).eq("year", currentYear);
        const balMap: Record<string, Record<string, number>> = {};
        (balances || []).forEach(b => { if (!balMap[b.employee_id]) balMap[b.employee_id] = {}; balMap[b.employee_id][b.leave_type] = b.balance; });
        const records = emps.map(e => ({ employee_name: e.name, department: e.department, el_balance: balMap[e.id]?.["EL"] ?? 0, sl_balance: balMap[e.id]?.["SL"] ?? 0 }));
        await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
        result = JSON.stringify({ count: records.length, records });
        break;
      }

      case "query_salary_sheets": {
        if (!isAdmin && !isHR) {
          await logAccess(client, userId, roles, lastUserMessage, toolName, "denied", [], "Role not authorized");
          result = JSON.stringify({ access_denied: true, message: SMART_DENIALS.query_salary_sheets });
          break;
        }
        let query = client.from("salary_sheets").select("id, month, year, status, total_employees, total_gross, total_net, total_deductions, created_at").order("created_at", { ascending: false }).limit(limit);
        if (args.month) query = query.eq("month", args.month);
        if (args.year) query = query.eq("year", args.year);
        if (args.status) query = query.eq("status", args.status);
        const { data, error } = await query;
        if (error) throw error;
        // For HR (non-admin), mask total amounts to summaries
        if (isHR && !isAdmin) {
          const maskedData = (data || []).map(d => ({ ...d, total_gross: undefined, total_net: undefined, total_deductions: undefined, summary: `${d.total_employees} employees, Status: ${d.status}` }));
          await logAccess(client, userId, roles, lastUserMessage, toolName, "masked", ["total_gross", "total_net", "total_deductions"]);
          result = JSON.stringify({ count: maskedData.length, records: maskedData, note: "Financial totals are restricted. Showing summary only." });
        } else {
          await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
          result = JSON.stringify({ count: data?.length || 0, records: data || [] });
        }
        break;
      }

      case "query_expected_payments": {
        if (!isAdmin && !isFinance) {
          await logAccess(client, userId, roles, lastUserMessage, toolName, "denied", [], "Role not authorized");
          result = JSON.stringify({ access_denied: true, message: SMART_DENIALS.query_expected_payments });
          break;
        }
        let query = client.from("expected_payments").select("id, customer_name, customer_company, amount, expected_date, status, order_number, source_type, notes, actual_received_date").order("expected_date", { ascending: true }).limit(limit);
        if (args.status) query = query.eq("status", args.status);
        if (args.date_from) query = query.gte("expected_date", args.date_from);
        if (args.date_to) query = query.lte("expected_date", args.date_to);
        const { data, error } = await query;
        if (error) throw error;
        await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
        result = JSON.stringify({ count: data?.length || 0, records: data || [] });
        break;
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
        await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
        result = JSON.stringify({ count: data?.length || 0, records: data || [] });
        break;
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
        await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
        result = JSON.stringify({ count: data?.length || 0, records: data || [] });
        break;
      }

      case "query_procurements": {
        let selectFields = "id, procurement_number, product_name, product_category, quantity, supplier_name, payment_status, total_cost, procurement_date, status";
        // For sales role accessing procurements (masked), hide cost info
        if (accessLevel === "masked" && isSales) {
          selectFields = "id, procurement_number, product_name, product_category, quantity, supplier_name, payment_status, procurement_date, status";
        }
        let query = client.from("inventory_procurements").select(selectFields).order("created_at", { ascending: false }).limit(limit);
        if (args.search) query = query.or(`product_name.ilike.%${args.search}%,supplier_name.ilike.%${args.search}%,procurement_number.ilike.%${args.search}%`);
        if (args.payment_status) query = query.eq("payment_status", args.payment_status);
        if (args.date_from) query = query.gte("created_at", `${args.date_from}T00:00:00`);
        if (args.date_to) query = query.lte("created_at", `${args.date_to}T23:59:59`);
        const { data, error } = await query;
        if (error) throw error;
        const mf = accessLevel === "masked" && isSales ? ["total_cost"] : [];
        await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel, mf);
        result = JSON.stringify({ count: data?.length || 0, records: data || [] });
        break;
      }

      case "query_suppliers": {
        let query = client.from("suppliers").select("id, name, company, email, phone, category, is_verified, reliability_score").order("name").limit(limit);
        if (args.search) query = query.or(`name.ilike.%${args.search}%,company.ilike.%${args.search}%`);
        const { data, error } = await query;
        if (error) throw error;
        // Mask supplier contact info for non-supply_chain/admin
        if (!isAdmin && !roles.includes("supply_chain")) {
          const masked = (data || []).map(d => ({ ...d, email: undefined, phone: undefined }));
          await logAccess(client, userId, roles, lastUserMessage, toolName, "masked", ["email", "phone"]);
          result = JSON.stringify(masked);
        } else {
          await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
          result = JSON.stringify(data || []);
        }
        break;
      }

      case "query_expenses": {
        if (!isAdmin && !isFinance) {
          await logAccess(client, userId, roles, lastUserMessage, toolName, "denied", [], "Role not authorized");
          result = JSON.stringify({ access_denied: true, message: SMART_DENIALS.query_expenses });
          break;
        }
        let query = client.from("expenses").select("id, description, amount, category, payment_mode, status, created_by_name, created_at, approved_by_name").order("created_at", { ascending: false }).limit(limit);
        if (!isAdmin && !isFinance) query = query.eq("created_by", userId);
        if (args.search) query = query.or(`description.ilike.%${args.search}%,vendor_name.ilike.%${args.search}%`);
        if (args.status) query = query.eq("status", args.status);
        if (args.date_from) query = query.gte("created_at", `${args.date_from}T00:00:00`);
        if (args.date_to) query = query.lte("created_at", `${args.date_to}T23:59:59`);
        const { data, error } = await query;
        if (error) throw error;
        await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
        result = JSON.stringify({ count: data?.length || 0, records: data || [] });
        break;
      }

      case "query_repairs": {
        let query = client.from("repairs").select("id, repair_number, customer_name, drone_model, issue_description, status, repair_cost, created_at").order("created_at", { ascending: false }).limit(limit);
        // Strip customer_phone from repairs for non-admin
        if (args.search) query = query.or(`customer_name.ilike.%${args.search}%,drone_model.ilike.%${args.search}%,repair_number.ilike.%${args.search}%`);
        if (args.status) query = query.eq("status", args.status);
        if (args.date_from) query = query.gte("created_at", `${args.date_from}T00:00:00`);
        if (args.date_to) query = query.lte("created_at", `${args.date_to}T23:59:59`);
        const { data, error } = await query;
        if (error) throw error;
        await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
        result = JSON.stringify({ count: data?.length || 0, records: data || [] });
        break;
      }

      case "get_dashboard_stats": {
        const stats: Record<string, unknown> = {};
        const dateFrom = args.date_from as string | undefined;
        const dateTo = args.date_to as string | undefined;

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

        if (isAdmin || roles.includes("supply_chain")) {
          const { data: inv } = await client.from("inventory").select("id, current_stock, reorder_point");
          if (inv) {
            stats.total_products = inv.length;
            stats.low_stock_items = inv.filter(i => i.current_stock <= (i.reorder_point || 0)).length;
          }
        }

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

        const { data: tasks } = await (isAdmin
          ? client.from("tasks").select("id, status")
          : client.from("tasks").select("id, status").eq("assigned_to", userId));
        if (tasks) {
          stats.total_tasks = tasks.length;
          stats.pending_tasks = tasks.filter(t => t.status === "pending").length;
          stats.in_progress_tasks = tasks.filter(t => t.status === "in_progress").length;
        }

        await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
        result = JSON.stringify(stats);
        break;
      }

      // --- ACTIONABLE COMMANDS ---
      case "update_order_status": {
        const orderNum = args.order_number as string;
        const newStatus = args.new_status as string;
        const validStatuses = ["confirmed", "dispatched", "delivered", "cancelled"];
        if (!validStatuses.includes(newStatus)) {
          result = JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
          break;
        }
        const { data: orderMatch } = await client.from("orders").select("id, order_number, status").ilike("order_number", orderNum).limit(1);
        if (!orderMatch?.length) { result = JSON.stringify({ error: `Order ${orderNum} not found` }); break; }
        if (isSales && !isAdmin && !isSalesManager) {
          const { data: ownOrder } = await client.from("orders").select("id").eq("id", orderMatch[0].id).eq("sales_person_id", userId);
          if (!ownOrder?.length) { result = JSON.stringify({ error: "You don't have permission to update this order" }); break; }
        }
        const { error: updateErr } = await client.from("orders").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", orderMatch[0].id);
        if (updateErr) throw updateErr;
        await client.from("ai_action_logs").insert({ user_id: userId, action_type: "update_order_status", payload: { order_number: orderNum, old_status: orderMatch[0].status, new_status: newStatus }, status: "executed" }).catch(() => {});
        await logAccess(client, userId, roles, lastUserMessage, toolName, "full");
        result = JSON.stringify({ success: true, message: `Order ${orderNum} status updated from "${orderMatch[0].status}" to "${newStatus}"` });
        break;
      }

      case "update_enquiry_status": {
        const enquiryId = args.enquiry_id as string;
        const newStatus = args.new_status as string;
        const validStatuses = ["new", "responded", "on_hold", "moved_to_pipeline", "order_won", "order_lost"];
        if (!validStatuses.includes(newStatus)) {
          result = JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
          break;
        }
        const { data: enqMatch } = await client.from("enquiries").select("id, status").eq("id", enquiryId).limit(1);
        if (!enqMatch?.length) { result = JSON.stringify({ error: "Enquiry not found" }); break; }
        if (isSales && !isAdmin && !isSalesManager) {
          const { data: ownEnq } = await client.from("enquiries").select("id").eq("id", enquiryId).eq("sales_person_id", userId);
          if (!ownEnq?.length) { result = JSON.stringify({ error: "You don't have permission to update this enquiry" }); break; }
        }
        const { error: updateErr } = await client.from("enquiries").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", enquiryId);
        if (updateErr) throw updateErr;
        await client.from("ai_action_logs").insert({ user_id: userId, action_type: "update_enquiry_status", payload: { enquiry_id: enquiryId, old_status: enqMatch[0].status, new_status: newStatus }, status: "executed" }).catch(() => {});
        await logAccess(client, userId, roles, lastUserMessage, toolName, "full");
        result = JSON.stringify({ success: true, message: `Enquiry status updated from "${enqMatch[0].status}" to "${newStatus}"` });
        break;
      }

      case "update_task_status": {
        const taskId = args.task_id as string;
        const newStatus = args.new_status as string;
        const validStatuses = ["pending", "in_progress", "completed"];
        if (!validStatuses.includes(newStatus)) {
          result = JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
          break;
        }
        const { data: taskMatch } = await client.from("tasks").select("id, status, title").eq("id", taskId).limit(1);
        if (!taskMatch?.length) { result = JSON.stringify({ error: "Task not found" }); break; }
        if (!isAdmin && !isSalesManager) {
          const { data: ownTask } = await client.from("tasks").select("id").eq("id", taskId).eq("assigned_to", userId);
          if (!ownTask?.length) { result = JSON.stringify({ error: "You can only update tasks assigned to you" }); break; }
        }
        const updateData: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() };
        if (newStatus === "completed") updateData.completed_at = new Date().toISOString();
        const { error: updateErr } = await client.from("tasks").update(updateData).eq("id", taskId);
        if (updateErr) throw updateErr;
        await client.from("ai_action_logs").insert({ user_id: userId, action_type: "update_task_status", payload: { task_id: taskId, old_status: taskMatch[0].status, new_status: newStatus, task_title: taskMatch[0].title }, status: "executed" }).catch(() => {});
        await logAccess(client, userId, roles, lastUserMessage, toolName, "full");
        result = JSON.stringify({ success: true, message: `Task "${taskMatch[0].title}" updated to "${newStatus}"` });
        break;
      }

      case "create_task": {
        const title = args.title as string;
        const description = (args.description as string) || "";
        const assignedToName = args.assigned_to_name as string;
        const priority = (args.priority as number) || 2;
        const dueDate = (args.due_date as string) || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const { data: assignee } = await client.from("profiles").select("user_id, name").ilike("name", `%${assignedToName}%`).limit(1).single();
        const { data: task, error: taskErr } = await client.from("tasks").insert({
          title, description, task_type: "sales_followup",
          assigned_to: assignee?.user_id || userId,
          assigned_to_name: assignee?.name || assignedToName,
          assigned_role: "sales", priority, due_date: dueDate,
          created_by: userId,
          created_by_name: (await client.from("profiles").select("name").eq("user_id", userId).single()).data?.name || "AI",
          status: "new",
        }).select("id, title").single();
        if (taskErr) throw taskErr;
        await client.from("ai_action_logs").insert({ user_id: userId, action_type: "create_task", payload: { title, assigned_to_name: assignedToName, priority, due_date: dueDate }, status: "executed", result: { task_id: task?.id } });
        await logAccess(client, userId, roles, lastUserMessage, toolName, "full");
        result = JSON.stringify({ success: true, message: `✅ Task "${title}" created and assigned to ${assignee?.name || assignedToName}`, task_id: task?.id });
        break;
      }

      case "create_payment_followup": {
        const orderNum = args.order_number as string;
        const { data: orderMatch } = await client.from("orders").select("id, order_number, customer_name, total_sales_amount, amount_paid, sales_person_id, sales_person_name").ilike("order_number", orderNum).limit(1);
        if (!orderMatch?.length) { result = JSON.stringify({ error: `Order ${orderNum} not found` }); break; }
        const order = orderMatch[0];
        const pendingAmount = (order.total_sales_amount || 0) - (order.amount_paid || 0);
        if (pendingAmount <= 0) { result = JSON.stringify({ message: `Order ${orderNum} has no pending payments.` }); break; }
        const profileData = await client.from("profiles").select("name").eq("user_id", userId).single();
        const { data: task, error: taskErr } = await client.from("tasks").insert({
          title: `💰 Payment follow-up: ${order.customer_name} - ₹${pendingAmount.toLocaleString("en-IN")}`,
          description: `Order ${order.order_number}. Total: ₹${(order.total_sales_amount || 0).toLocaleString("en-IN")}, Received: ₹${(order.amount_paid || 0).toLocaleString("en-IN")}, Pending: ₹${pendingAmount.toLocaleString("en-IN")}`,
          task_type: "finance_review",
          assigned_to: order.sales_person_id || userId,
          assigned_to_name: order.sales_person_name || profileData.data?.name || "User",
          assigned_role: "sales", priority: 1,
          due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          created_by: userId, created_by_name: profileData.data?.name || "AI", status: "new",
        }).select("id").single();
        if (taskErr) throw taskErr;
        await client.from("ai_action_logs").insert({ user_id: userId, action_type: "create_payment_followup", payload: { order_number: orderNum, order_id: order.id, pending_amount: pendingAmount }, status: "executed", result: { task_id: task?.id } });
        await logAccess(client, userId, roles, lastUserMessage, toolName, "full");
        result = JSON.stringify({ success: true, message: `✅ Payment follow-up task created for ${order.customer_name} (₹${pendingAmount.toLocaleString("en-IN")} pending)` });
        break;
      }

      case "get_daily_briefing": {
        const briefing: Record<string, unknown> = {};
        const today = new Date().toISOString().split("T")[0];

        if (isAdmin || isHR) {
          const { data: todayLogs } = await client.from("attendance_logs").select("id, employee_id, check_in_time, status, checkout_missing").eq("date", today);
          const { data: activeEmps } = await client.from("employees").select("id, name, department").eq("is_active", true);
          if (todayLogs && activeEmps) {
            const checkedInIds = new Set(todayLogs.map(l => l.employee_id));
            const absentees = activeEmps.filter(e => !checkedInIds.has(e.id));
            const lateArrivals = todayLogs.filter(l => l.check_in_time && l.check_in_time > `${today}T09:30:00`);
            const missingCheckout = todayLogs.filter(l => l.checkout_missing);
            briefing.attendance_summary = {
              total_active: activeEmps.length, checked_in: todayLogs.length, absent_count: absentees.length,
              absent_employees: absentees.slice(0, 10).map(e => ({ name: e.name, department: e.department })),
              late_arrivals_count: lateArrivals.length, missing_checkout_count: missingCheckout.length,
            };
          }
          const { data: pendingLeaves } = await client.from("leave_requests").select("id, employee_id, leave_type, start_date, end_date, total_days, created_at").eq("status", "pending").order("created_at").limit(10);
          if (pendingLeaves?.length) {
            const leaveEmpIds = [...new Set(pendingLeaves.map(l => l.employee_id))];
            const { data: leaveEmps } = await client.from("employees").select("id, name").in("id", leaveEmpIds);
            const empMap = Object.fromEntries((leaveEmps || []).map(e => [e.id, e.name]));
            briefing.pending_leaves = { count: pendingLeaves.length, records: pendingLeaves.map(l => ({ ...l, employee_name: empMap[l.employee_id] || "Unknown" })) };
          } else {
            briefing.pending_leaves = { count: 0, records: [] };
          }
          const { data: onLeaveToday } = await client.from("leave_requests").select("id, employee_id, leave_type, start_date, end_date").eq("status", "approved").lte("start_date", today).gte("end_date", today).limit(20);
          if (onLeaveToday?.length) {
            const leaveEmpIds2 = [...new Set(onLeaveToday.map(l => l.employee_id))];
            const { data: leaveEmps2 } = await client.from("employees").select("id, name, department").in("id", leaveEmpIds2);
            const empMap2 = Object.fromEntries((leaveEmps2 || []).map(e => [e.id, e]));
            briefing.on_leave_today = { count: onLeaveToday.length, records: onLeaveToday.map(l => ({ ...l, employee_name: empMap2[l.employee_id]?.name || "Unknown", department: empMap2[l.employee_id]?.department || "Unknown" })) };
          } else {
            briefing.on_leave_today = { count: 0, records: [] };
          }
        }

        if (isAdmin || isSalesManager || isSales || isFinance) {
          const overdueQuery = isAdmin || isSalesManager || isFinance
            ? client.from("orders").select("id, order_number, customer_name, total_sales_amount, amount_paid, payment_due_date").in("payment_status", ["pending", "partial"]).lt("payment_due_date", today).order("payment_due_date").limit(10)
            : client.from("orders").select("id, order_number, customer_name, total_sales_amount, amount_paid, payment_due_date").eq("sales_person_id", userId).in("payment_status", ["pending", "partial"]).lt("payment_due_date", today).order("payment_due_date").limit(10);
          const { data: overdue } = await overdueQuery;
          briefing.overdue_payments = { count: overdue?.length || 0, records: overdue || [] };
        }

        if (isAdmin || isSalesManager || isSales) {
          const stalledDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const stalledQuery = isAdmin || isSalesManager
            ? client.from("pipeline_orders").select("id, customer_name, product_name, expected_price, updated_at, status").eq("status", "active").lt("updated_at", stalledDate).limit(10)
            : client.from("pipeline_orders").select("id, customer_name, product_name, expected_price, updated_at, status").eq("sales_person_id", userId).eq("status", "active").lt("updated_at", stalledDate).limit(10);
          const { data: stalled } = await stalledQuery;
          briefing.stalled_deals = { count: stalled?.length || 0, records: stalled || [] };
          const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const hotQuery = isAdmin || isSalesManager
            ? client.from("enquiries").select("id, customer_name, product_name, probability_to_close, created_at").gte("probability_to_close", 70).gte("created_at", yesterday).limit(5)
            : client.from("enquiries").select("id, customer_name, product_name, probability_to_close, created_at").eq("sales_person_id", userId).gte("probability_to_close", 70).gte("created_at", yesterday).limit(5);
          const { data: newHot } = await hotQuery;
          briefing.new_hot_leads = { count: newHot?.length || 0, records: newHot || [] };
        }

        if (isAdmin || roles.includes("supply_chain")) {
          const { data: lowStock } = await client.from("inventory").select("id, product_name, current_stock, reorder_point").gt("reorder_point", 0);
          const lowItems = (lowStock || []).filter(i => i.current_stock <= (i.reorder_point || 0));
          briefing.low_stock_alerts = { count: lowItems.length, items: lowItems.slice(0, 5) };
          const { data: delayedProc } = await client.from("inventory_procurements").select("id, procurement_number, product_name, supplier_name, status, procurement_date").in("status", ["pending", "ordered"]).lt("procurement_date", today).order("procurement_date").limit(10);
          briefing.delayed_procurements = { count: delayedProc?.length || 0, records: delayedProc || [] };
        }

        const { data: urgentTasks } = await client.from("tasks").select("id, title, due_date, priority, status")
          .eq("assigned_to", userId).in("status", ["pending", "in_progress"]).lte("due_date", `${today}T23:59:59`).order("due_date").limit(10);
        briefing.urgent_tasks = { count: urgentTasks?.length || 0, records: urgentTasks || [] };

        await logAccess(client, userId, roles, lastUserMessage, toolName, accessLevel);
        result = JSON.stringify(briefing);
        break;
      }

      default:
        result = JSON.stringify({ error: "Unknown tool" });
    }

    return result;
  } catch (err) {
    console.error(`Tool ${toolName} error:`, err);
    return JSON.stringify({ error: `Failed to query ${toolName}` });
  }
}

// =====================================================
// MAIN SERVER HANDLER
// =====================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Server configuration missing");
    }

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userRoles } = await serviceClient.from("user_roles").select("role").eq("user_id", userId);
    const roles = userRoles?.map(r => r.role) || ["employee"];

    const { data: profile } = await serviceClient.from("profiles").select("name").eq("user_id", userId).single();
    const userName = profile?.name || "User";

    const { messages } = await req.json() as { messages: Message[] };

    // Extract last user message for audit logging
    const lastUserMessage = messages.filter(m => m.role === "user").pop()?.content || "";
    const isFreshDataQuery = /\b(show|what|how many|total|count|sum|revenue|sales|closure|closures|orders?|enquiries?|leads?|pipeline|inventory|payments?|pending|profit|margin|breakdown|report|dashboard|month|monthly|week|weekly|today|yesterday|mtd|qtd|year|salesperson)\b/i.test(lastUserMessage);

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
- Orders use 'order_date' (actual business date) as the primary filter, with 'created_at' as fallback when order_date is missing.

CRITICAL — Aggregation & Analysis:
- You ARE capable of performing aggregation, grouping, summarization, and analysis on the data returned by tools.
- When the user asks for breakdowns, fetch data with a HIGH limit (200-500) and group/aggregate yourself.
- Present aggregated results in markdown tables with proper totals.
- Common aggregation patterns: Group by product/category/salesperson/status → count + sum of amounts.

CRITICAL — Order Closures / Sales:
- "Total closures" or "total sales" means ALL orders EXCLUDING status='cancelled'.
- ALWAYS pass exclude_cancelled=true AND limit=500 when querying for closures, sales totals, monthly data, or salesperson breakdowns.
- NEVER rely on the default limit for aggregation queries — explicitly pass limit=500.
- When reporting monthly closures, the expected March 2026 data is ~61 non-cancelled orders totaling ~₹1.77Cr. If your numbers are significantly lower, you likely hit the row limit.

TIERED ACCESS CONTROL — CRITICAL SECURITY RULES:
1. If a tool returns "access_denied": true, present an EXPLAINABLE DENIAL:
   - Start with 🔒 emoji to visually indicate restricted access
   - Explain WHY it is restricted (data classification reason from the response "message")
   - State WHO can access it (from "who_can_access" field)
   - Offer an ALTERNATIVE (from "alternative" field)
   - If "can_request_access" is true, suggest requesting access with this action block:
     \`\`\`actions
     [{"label":"🔓 Request Access","action_type":"request_data_access","payload":{"data_type":"<data_type from response>","reason":"<what user was trying to access>"}}]
     \`\`\`
2. NEVER expose raw sensitive data: salaries, bank accounts, PAN numbers, Aadhaar, personal contact info.
3. When data contains "note" about restricted fields, add ⚠️ and acknowledge: "Some fields are partially hidden for security."
4. For cross-module queries: provide helpful INSIGHTS without raw data.
5. SMART DENIALS: Be helpful, not dismissive. Always suggest alternatives.
6. ACCESS LEVEL BADGES: When presenting data, indicate the access level:
   - Full access data → no badge needed
   - Masked data (has "note" about restrictions) → add "⚠️ *Some fields masked for security*" at the end
   - Denied access → use 🔒 prefix

ROLE-BASED DATA ISOLATION:
${roles.includes("hr") && !roles.includes("admin") ? `- You are HR. You can access: employees, attendance, leave, payroll status, tasks, tickets.
- You CANNOT access: order amounts, revenue, cost prices, expenses, pipeline deals, procurement costs.
- You CAN see payroll sheet status but NOT individual salary amounts.` : ""}
${roles.includes("finance") && !roles.includes("admin") ? `- You are Finance. You can access: orders (payments), expenses, procurements, expected payments, tasks.
- You CANNOT access: employee salaries, attendance details, leave records, personal HR data.` : ""}
${roles.includes("sales") && !roles.includes("admin") && !roles.includes("sales_manager") ? `- You are Sales. You can ONLY see your own leads, orders, and pipeline.
- You CANNOT access: other salespeople's data, employee data, salaries, expenses, or procurement costs.` : ""}
${roles.includes("supply_chain") && !roles.includes("admin") ? `- You are Operations. You can access: orders, inventory, procurements, suppliers, tasks.
- You CANNOT access: employee personal data, salaries, leave records, financial risk scoring.` : ""}

DATA MASKING RULES:
- Bank Account → show as XXXX1234 (last 4 digits only)
- Phone numbers in cross-module queries → show as XXXXX7890
- PAN/Aadhaar → NEVER show, not even partially
- Salary data → NEVER shown to non-HR/non-Admin roles
- Supplier contracts/financials → masked for non-supply-chain roles

Guidelines:
- Be concise, conversational, and professional
- Format prices with ₹ symbol for Indian Rupees
- Present data in clean markdown tables or bullet points
- Always include the count of records found
- If results are empty, say so clearly
- Never fabricate data — only use what the tools return
- Respect data isolation strictly
- Round large numbers: ₹10,50,000 → ₹10.5L, ₹1,06,00,000 → ₹1.06 Cr
- Use **bold** for order numbers, customer names, and key figures

RESPONSE FORMATTING:
- NEVER dump raw column names. Translate to human-readable labels.
- Lead with a brief SUMMARY sentence, then show details.
- Keep table columns to 3-5 max.
- Use markdown headers (##, ###) to section responses.
- Add a brief "💡 Tip" or actionable insight at the end when relevant.

ACTIONABLE COMMANDS:
- For updates, ALWAYS confirm what you're about to do BEFORE executing.
- After executing, clearly confirm the result.

SUGGESTED ACTIONS:
After presenting data analysis, you may suggest clickable actions. Include 1-3 most relevant actions the user's role allows.
IMPORTANT: You do NOT need to format actions in any special way. The system will ask you for structured JSON output separately.
Just focus on writing clear, human-readable text responses.

DAILY BRIEFING:
- When user asks for "daily briefing", use get_daily_briefing tool.
- Present with role-appropriate sections.

VISUAL CHARTS:
\`\`\`chart
{"type":"bar","title":"Orders by Product","data":[{"name":"DJI Mini","count":5,"revenue":250000}],"xKey":"name","yKeys":["count","revenue"]}
\`\`\`
Chart types: "bar", "pie", "line"

Available modules: ${Array.from(allAllowedTools).map(t => t.replace("query_", "").replace("get_", "")).join(", ")}`;

    const step1Messages = isFreshDataQuery
      ? [
          { role: "system" as const, content: `${systemPrompt}\n\nCRITICAL: This is a live data/reporting query. Ignore any previous assistant answers in the conversation and recompute using fresh tool calls only. Do not reuse earlier numbers unless confirmed by tool results.` },
          { role: "user" as const, content: lastUserMessage },
        ]
      : [{ role: "system" as const, content: systemPrompt }, ...messages];

    // Step 1: Send to AI with tools
    const step1Response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: step1Messages,
        tools: filteredTools,
        tool_choice: isFreshDataQuery ? "required" : "auto",
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

    if (finishReason === "error" || !assistantMessage) {
      const retryResponse = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt + "\n\nIMPORTANT: Answer the user's question directly. Do not attempt to call any tools." },
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
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
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

    // Step 2: Execute tool calls with access control
    const toolResults: { role: string; tool_call_id: string; content: string }[] = [];
    
    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      
      if (!allAllowedTools.has(toolName)) {
        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ access_denied: true, message: "Access denied for this module based on your role." }),
        });
        await logAccess(serviceClient, userId, roles, lastUserMessage, toolName, "denied", [], "Tool not in allowed list");
        continue;
      }

      let toolArgs: Record<string, unknown> = {};
      try { toolArgs = JSON.parse(toolCall.function.arguments || "{}"); } catch { toolArgs = {}; }

      const result = await executeToolCall(serviceClient, toolName, toolArgs, userId, roles, lastUserMessage);
      toolResults.push({ role: "tool", tool_call_id: toolCall.id, content: result });
    }

    // Step 3: Send tool results back to AI with JSON structured output
    const structuredSystemPrompt = systemPrompt + `

CRITICAL — STRUCTURED JSON RESPONSE FORMAT:
You MUST respond with a valid JSON object matching this exact schema:
{
  "message": "<your human-readable response text in markdown>",
  "actions": [
    {
      "label": "<button label>",
      "action_type": "<one of: create_task, update_lead_status, update_order_status, update_task_status, create_followup, mark_payment_followup, request_data_access>",
      "payload": { <relevant key-value pairs> }
    }
  ]
}

RULES:
- "message" contains your full markdown response text (tables, bullet points, etc.)
- "actions" is an array of 0-3 suggested actions. Use empty array [] if no actions are relevant.
- NEVER put action JSON inside the message text
- NEVER return anything outside this JSON structure`;

    const step3Messages = [
      { role: "system", content: structuredSystemPrompt },
      ...(isFreshDataQuery ? [{ role: "user", content: lastUserMessage }] : messages),
      assistantMessage,
      ...toolResults,
    ];

    const finalResponse = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: step3Messages,
        response_format: { type: "json_object" },
        stream: false,
      }),
    });

    if (!finalResponse.ok) {
      console.error("AI step3 error:", finalResponse.status);
      return new Response(JSON.stringify({ error: "AI assistant unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const finalData = await finalResponse.json();
    const rawContent = finalData.choices?.[0]?.message?.content || "";

    // Parse the structured JSON response
    let finalMessage = "";
    let extractedActions: { label: string; action_type: string; payload: Record<string, unknown> }[] = [];

    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed.message === "string") {
        finalMessage = parsed.message;
        if (Array.isArray(parsed.actions)) {
          // Validate each action has required fields
          extractedActions = parsed.actions.filter(
            (a: Record<string, unknown>) =>
              typeof a.label === "string" &&
              typeof a.action_type === "string" &&
              a.payload && typeof a.payload === "object"
          );
        }
      } else {
        // Fallback: treat raw content as message if it's not proper JSON structure
        finalMessage = rawContent;
      }
    } catch {
      // JSON parse failed — use raw content as message (graceful fallback)
      finalMessage = rawContent;
    }

    const deterministicBreakdown = buildOrderSalespersonBreakdownMessage(lastUserMessage, assistantMessage, toolResults);
    if (deterministicBreakdown) {
      finalMessage = deterministicBreakdown;
    }

    // Clean up any residual formatting
    finalMessage = finalMessage.replace(/\n{3,}/g, "\n\n").trim();

    // Build structured SSE response: text content + separate actions event
    const encoder = new TextEncoder();
    let ssePayload = `data: ${JSON.stringify({
      choices: [{ delta: { content: finalMessage, role: "assistant" }, finish_reason: "stop" }]
    })}\n\n`;

    // Send validated actions as a separate structured event
    if (extractedActions.length > 0) {
      ssePayload += `data: ${JSON.stringify({ __actions__: extractedActions })}\n\n`;
    }

    ssePayload += `data: [DONE]\n\n`;

    return new Response(encoder.encode(ssePayload), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    console.error("Portal assistant error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
