import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Supported action types and their required payload fields
const ACTION_SCHEMAS: Record<string, { required: string[]; roles: string[] }> = {
  create_task: {
    required: ["title", "assigned_to_name"],
    roles: ["admin", "sales", "sales_manager", "supply_chain", "finance", "hr", "it", "marketing"],
  },
  update_lead_status: {
    required: ["enquiry_id", "new_status"],
    roles: ["admin", "sales", "sales_manager"],
  },
  update_order_status: {
    required: ["order_id", "new_status"],
    roles: ["admin", "sales_manager", "supply_chain"],
  },
  update_task_status: {
    required: ["task_id", "new_status"],
    roles: ["admin", "sales", "sales_manager", "supply_chain", "finance", "hr", "it", "marketing"],
  },
  create_followup: {
    required: ["enquiry_id", "followup_note"],
    roles: ["admin", "sales", "sales_manager"],
  },
  mark_payment_followup: {
    required: ["order_id"],
    roles: ["admin", "finance", "sales_manager"],
  },
};

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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Server configuration missing");
    }

    // Verify JWT
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user roles
    const { data: userRoles } = await serviceClient.from("user_roles").select("role").eq("user_id", userId);
    const roles = userRoles?.map(r => r.role) || [];

    // Get user profile
    const { data: profile } = await serviceClient.from("profiles").select("name").eq("user_id", userId).single();
    const userName = profile?.name || "User";

    const { action_type, payload } = await req.json() as { action_type: string; payload: Record<string, unknown> };

    // Validate action type
    const schema = ACTION_SCHEMAS[action_type];
    if (!schema) {
      return new Response(JSON.stringify({ error: `Unknown action: ${action_type}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate role access
    const hasAccess = roles.some(r => schema.roles.includes(r));
    if (!hasAccess) {
      await logAction(serviceClient, userId, action_type, payload, "denied", null, "Insufficient permissions");
      return new Response(JSON.stringify({ error: "You don't have permission to perform this action" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate required fields
    for (const field of schema.required) {
      if (!payload[field]) {
        return new Response(JSON.stringify({ error: `Missing required field: ${field}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Execute action
    let result: Record<string, unknown>;
    try {
      result = await executeAction(serviceClient, action_type, payload, userId, userName, roles);
      await logAction(serviceClient, userId, action_type, payload, "executed", result, null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      await logAction(serviceClient, userId, action_type, payload, "failed", null, errorMsg);
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Action executor error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function logAction(
  client: ReturnType<typeof createClient>,
  userId: string,
  actionType: string,
  payload: Record<string, unknown>,
  status: string,
  result: Record<string, unknown> | null,
  errorMessage: string | null
) {
  try {
    await client.from("ai_action_logs").insert({
      user_id: userId,
      action_type: actionType,
      payload,
      status,
      result: result || {},
      error_message: errorMessage,
    });
  } catch (err) {
    console.error("Failed to log action:", err);
  }
}

async function executeAction(
  client: ReturnType<typeof createClient>,
  actionType: string,
  payload: Record<string, unknown>,
  userId: string,
  userName: string,
  roles: string[]
): Promise<Record<string, unknown>> {
  const isAdmin = roles.includes("admin");
  const isSalesManager = roles.includes("sales_manager");

  switch (actionType) {
    case "create_task": {
      const title = payload.title as string;
      const description = payload.description as string || "";
      const assignedToName = payload.assigned_to_name as string;
      const priority = (payload.priority as number) || 2;
      const dueDate = (payload.due_date as string) || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // Find the assigned user
      const { data: assignee } = await client.from("profiles")
        .select("user_id, name")
        .ilike("name", `%${assignedToName}%`)
        .limit(1)
        .single();

      const { data: task, error } = await client.from("tasks").insert({
        title,
        description,
        task_type: "sales_followup",
        assigned_to: assignee?.user_id || userId,
        assigned_to_name: assignee?.name || assignedToName,
        assigned_role: "sales",
        priority,
        due_date: dueDate,
        created_by: userId,
        created_by_name: userName,
        status: "new",
      }).select("id, title").single();

      if (error) throw new Error(`Failed to create task: ${error.message}`);
      return { message: `Task "${title}" created successfully`, task_id: task?.id };
    }

    case "update_lead_status": {
      const enquiryId = payload.enquiry_id as string;
      const newStatus = payload.new_status as string;
      const validStatuses = ["new", "responded", "on_hold", "moved_to_pipeline", "order_won", "order_lost"];
      if (!validStatuses.includes(newStatus)) throw new Error(`Invalid status: ${newStatus}`);

      // Ownership check for sales
      if (!isAdmin && !isSalesManager) {
        const { data: owned } = await client.from("enquiries").select("id").eq("id", enquiryId).eq("sales_person_id", userId);
        if (!owned?.length) throw new Error("You don't have permission to update this lead");
      }

      const { error } = await client.from("enquiries").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", enquiryId);
      if (error) throw new Error(`Failed to update lead: ${error.message}`);
      return { message: `Lead status updated to "${newStatus}"` };
    }

    case "update_order_status": {
      const orderId = payload.order_id as string;
      const newStatus = payload.new_status as string;
      const validStatuses = ["confirmed", "dispatched", "delivered", "cancelled"];
      if (!validStatuses.includes(newStatus)) throw new Error(`Invalid status: ${newStatus}`);

      const { error } = await client.from("orders").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", orderId);
      if (error) throw new Error(`Failed to update order: ${error.message}`);
      return { message: `Order status updated to "${newStatus}"` };
    }

    case "update_task_status": {
      const taskId = payload.task_id as string;
      const newStatus = payload.new_status as string;
      const validStatuses = ["pending", "in_progress", "completed"];
      if (!validStatuses.includes(newStatus)) throw new Error(`Invalid status: ${newStatus}`);

      if (!isAdmin && !isSalesManager) {
        const { data: owned } = await client.from("tasks").select("id").eq("id", taskId).eq("assigned_to", userId);
        if (!owned?.length) throw new Error("You can only update tasks assigned to you");
      }

      const updateData: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() };
      if (newStatus === "completed") updateData.completed_at = new Date().toISOString();

      const { error } = await client.from("tasks").update(updateData).eq("id", taskId);
      if (error) throw new Error(`Failed to update task: ${error.message}`);
      return { message: `Task status updated to "${newStatus}"` };
    }

    case "create_followup": {
      const enquiryId = payload.enquiry_id as string;
      const followupNote = payload.followup_note as string;

      // Get enquiry details
      const { data: enquiry } = await client.from("enquiries")
        .select("id, customer_name, product_name, sales_person_id, sales_person_name")
        .eq("id", enquiryId)
        .single();

      if (!enquiry) throw new Error("Enquiry not found");

      // Create follow-up task
      const { data: task, error } = await client.from("tasks").insert({
        enquiry_id: enquiryId,
        title: `Follow up: ${enquiry.customer_name} - ${enquiry.product_name}`,
        description: followupNote,
        task_type: "sales_followup",
        assigned_to: enquiry.sales_person_id || userId,
        assigned_to_name: enquiry.sales_person_name || userName,
        assigned_role: "sales",
        priority: 1,
        due_date: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        created_by: userId,
        created_by_name: userName,
        status: "new",
      }).select("id").single();

      if (error) throw new Error(`Failed to create follow-up: ${error.message}`);
      return { message: `Follow-up created for ${enquiry.customer_name}`, task_id: task?.id };
    }

    case "mark_payment_followup": {
      const orderId = payload.order_id as string;

      const { data: order } = await client.from("orders")
        .select("id, order_number, customer_name, total_sales_amount, amount_paid, sales_person_id, sales_person_name")
        .eq("id", orderId)
        .single();

      if (!order) throw new Error("Order not found");

      const pendingAmount = (order.total_sales_amount || 0) - (order.amount_paid || 0);

      const { error } = await client.from("tasks").insert({
        title: `💰 Payment follow-up: ${order.customer_name} - ₹${pendingAmount.toLocaleString("en-IN")}`,
        description: `Order ${order.order_number}. Total: ₹${(order.total_sales_amount || 0).toLocaleString("en-IN")}, Received: ₹${(order.amount_paid || 0).toLocaleString("en-IN")}, Pending: ₹${pendingAmount.toLocaleString("en-IN")}`,
        task_type: "finance_review",
        assigned_to: order.sales_person_id || userId,
        assigned_to_name: order.sales_person_name || userName,
        assigned_role: "sales",
        priority: 1,
        due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        created_by: userId,
        created_by_name: userName,
        status: "new",
      }).select("id").single();

      if (error) throw new Error(`Failed to create payment follow-up: ${error.message}`);
      return { message: `Payment follow-up created for ${order.customer_name} (₹${pendingAmount.toLocaleString("en-IN")} pending)` };
    }

    default:
      throw new Error(`Unhandled action: ${actionType}`);
  }
}
