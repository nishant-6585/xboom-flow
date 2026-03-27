import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const CRON_SECRET = Deno.env.get("CRON_SECRET");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Server configuration missing");
    }

    // Auth: cron secret OR JWT
    const cronSecret = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("Authorization");
    let userId = "system";
    let userName = "System";
    let userRoles: string[] = ["admin"];

    if (cronSecret && CRON_SECRET && cronSecret === CRON_SECRET) {
      // Cron-based invocation
    } else if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error } = await userClient.auth.getUser(token);
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
      const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: roles } = await serviceClient.from("user_roles").select("role").eq("user_id", userId);
      userRoles = roles?.map((r: any) => r.role) || [];
      const { data: profile } = await serviceClient.from("profiles").select("name").eq("user_id", userId).single();
      userName = profile?.name || "User";

      if (!userRoles.includes("admin")) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch active rules
    const { data: rules } = await serviceClient
      .from("ai_auto_rules")
      .select("*")
      .eq("is_active", true);

    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ message: "No active rules", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch policies
    const { data: policies } = await serviceClient
      .from("ai_policies")
      .select("*")
      .eq("is_active", true);

    // 3. Evaluate each rule
    const results: { rule: string; action: string; result: string }[] = [];

    for (const rule of rules) {
      try {
        const conditionMet = await evaluateCondition(serviceClient, rule.condition, rule.trigger_type);
        if (!conditionMet) continue;

        // Check policy
        const policyAllowed = checkPolicy(policies || [], rule.action_type, rule.allowed_roles);
        if (!policyAllowed) {
          results.push({ rule: rule.rule_name, action: rule.action_type, result: "blocked_by_policy" });
          continue;
        }

        if (rule.requires_approval || rule.risk_level === "high") {
          // Queue for approval
          await serviceClient.from("ai_action_queue").insert({
            rule_id: rule.id,
            action_type: rule.action_type,
            payload: rule.payload,
            status: "pending",
            risk_level: rule.risk_level,
            requires_approval: true,
            triggered_by: "automation_engine",
            user_id: userId,
            user_name: userName,
          });
          results.push({ rule: rule.rule_name, action: rule.action_type, result: "queued_for_approval" });
        } else if (rule.risk_level === "medium") {
          // Queue but mark as approved (needs confirmation in UI)
          await serviceClient.from("ai_action_queue").insert({
            rule_id: rule.id,
            action_type: rule.action_type,
            payload: rule.payload,
            status: "pending",
            risk_level: rule.risk_level,
            requires_approval: true,
            triggered_by: "automation_engine",
            user_id: userId,
            user_name: userName,
          });
          results.push({ rule: rule.rule_name, action: rule.action_type, result: "queued_for_confirmation" });
        } else {
          // Low risk: auto-execute
          const execResult = await executeQueuedAction(serviceClient, rule.action_type, rule.payload, userId, userName);
          
          await serviceClient.from("ai_action_queue").insert({
            rule_id: rule.id,
            action_type: rule.action_type,
            payload: rule.payload,
            status: execResult.success ? "executed" : "failed",
            risk_level: rule.risk_level,
            requires_approval: false,
            executed_at: new Date().toISOString(),
            result: execResult.data || {},
            error_message: execResult.error || null,
            triggered_by: "automation_engine",
            user_id: userId,
            user_name: userName,
          });
          results.push({ rule: rule.rule_name, action: rule.action_type, result: execResult.success ? "executed" : "failed" });
        }
      } catch (err) {
        console.error(`Rule ${rule.rule_name} failed:`, err);
        results.push({ rule: rule.rule_name, action: rule.action_type, result: "error" });
      }
    }

    // 4. Process approved queue items
    const { data: approvedItems } = await serviceClient
      .from("ai_action_queue")
      .select("*")
      .eq("status", "approved")
      .limit(20);

    for (const item of approvedItems || []) {
      try {
        await serviceClient.from("ai_action_queue").update({ status: "executing", updated_at: new Date().toISOString() }).eq("id", item.id);
        
        const execResult = await executeQueuedAction(serviceClient, item.action_type, item.payload as Record<string, unknown>, userId, userName);
        
        await serviceClient.from("ai_action_queue").update({
          status: execResult.success ? "executed" : "failed",
          executed_at: new Date().toISOString(),
          result: execResult.data || {},
          error_message: execResult.error || null,
          retry_count: execResult.success ? item.retry_count : (item.retry_count || 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", item.id);

        // Log to action logs
        await serviceClient.from("ai_action_logs").insert({
          user_id: item.user_id,
          action_type: item.action_type,
          payload: item.payload,
          status: execResult.success ? "executed" : "failed",
          result: execResult.data || {},
          error_message: execResult.error || null,
        });

        // Log learning
        await serviceClient.from("ai_learning_logs").insert({
          user_id: item.user_id,
          suggestion_type: item.action_type,
          suggestion_payload: item.payload as any,
          user_response: "accepted",
          execution_result: execResult.success ? "success" : "failure",
        });
      } catch (err) {
        console.error(`Queue item ${item.id} failed:`, err);
        await serviceClient.from("ai_action_queue").update({
          status: "failed",
          error_message: err instanceof Error ? err.message : "Unknown error",
          retry_count: (item.retry_count || 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", item.id);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      rules_evaluated: rules.length,
      results,
      approved_processed: approvedItems?.length || 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Automation engine error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function evaluateCondition(
  client: ReturnType<typeof createClient>,
  condition: Record<string, unknown>,
  triggerType: string
): Promise<boolean> {
  const field = condition.field as string;
  const operator = condition.operator as string;
  const value = condition.value;

  if (!field || !operator) return false;

  switch (field) {
    case "overdue_amount": {
      const { data: orders } = await client.from("orders")
        .select("total_sales_amount, amount_paid")
        .in("payment_status", ["pending", "partial"])
        .not("payment_due_date", "is", null);
      
      if (!orders) return false;
      const totalOverdue = orders.reduce((sum, o) => sum + ((o.total_sales_amount || 0) - (o.amount_paid || 0)), 0);
      return compareValues(totalOverdue, operator, value as number);
    }
    case "lead_temperature": {
      const inactiveDays = (condition.inactive_days as number) || 2;
      const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000).toISOString();
      const { data: leads } = await client.from("enquiries")
        .select("id")
        .eq("lead_temperature", value)
        .lt("updated_at", cutoff)
        .in("status", ["new", "responded"])
        .limit(1);
      return (leads?.length || 0) > 0;
    }
    case "procurement_delay_days": {
      const delayDays = value as number;
      const cutoff = new Date(Date.now() - delayDays * 24 * 60 * 60 * 1000).toISOString();
      const { data: procs } = await client.from("inventory_procurements")
        .select("id")
        .in("status", ["pending", "ordered"])
        .lt("procurement_date", cutoff)
        .limit(1);
      return (procs?.length || 0) > 0;
    }
    default:
      return false;
  }
}

function compareValues(actual: number, operator: string, expected: number): boolean {
  switch (operator) {
    case "gt": return actual > expected;
    case "gte": return actual >= expected;
    case "lt": return actual < expected;
    case "lte": return actual <= expected;
    case "eq": return actual === expected;
    default: return false;
  }
}

function checkPolicy(policies: any[], actionType: string, allowedRoles: string[]): boolean {
  if (!policies.length) return true; // No policies = allow
  
  for (const policy of policies) {
    if (allowedRoles.includes(policy.role)) {
      if (policy.blocked_actions?.includes(actionType)) return false;
      if (policy.allowed_actions?.length > 0 && !policy.allowed_actions.includes(actionType)) return false;
    }
  }
  return true;
}

async function executeQueuedAction(
  client: ReturnType<typeof createClient>,
  actionType: string,
  payload: Record<string, unknown>,
  userId: string,
  userName: string
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    switch (actionType) {
      case "create_task": {
        const { data, error } = await client.from("tasks").insert({
          title: (payload.title as string) || "AI Auto-generated Task",
          description: (payload.description as string) || "",
          task_type: "sales_followup",
          assigned_to: userId,
          assigned_to_name: userName,
          assigned_role: "sales",
          priority: (payload.priority as number) || 2,
          due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          created_by: userId,
          created_by_name: `AI (${userName})`,
          status: "new",
        }).select("id, title").single();
        if (error) throw error;
        return { success: true, data: { message: `Task "${data?.title}" created`, task_id: data?.id } };
      }
      case "create_followup": {
        const enquiryId = payload.enquiry_id as string;
        if (!enquiryId) throw new Error("Missing enquiry_id");
        const { data: enquiry } = await client.from("enquiries")
          .select("customer_name, product_name, sales_person_id, sales_person_name")
          .eq("id", enquiryId).single();
        if (!enquiry) throw new Error("Enquiry not found");

        const { error } = await client.from("tasks").insert({
          enquiry_id: enquiryId,
          title: `Auto follow-up: ${enquiry.customer_name}`,
          description: (payload.followup_note as string) || "Automated follow-up from AI rule",
          task_type: "sales_followup",
          assigned_to: enquiry.sales_person_id || userId,
          assigned_to_name: enquiry.sales_person_name || userName,
          assigned_role: "sales",
          priority: 1,
          due_date: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          created_by: userId,
          created_by_name: `AI (${userName})`,
          status: "new",
        });
        if (error) throw error;
        return { success: true, data: { message: `Follow-up created for ${enquiry.customer_name}` } };
      }
      case "mark_payment_followup": {
        const orderId = payload.order_id as string;
        if (!orderId) {
          // Find orders with highest overdue
          const { data: overdueOrders } = await client.from("orders")
            .select("id, customer_name, total_sales_amount, amount_paid, order_number, sales_person_id, sales_person_name")
            .in("payment_status", ["pending", "partial"])
            .not("payment_due_date", "is", null)
            .order("payment_due_date", { ascending: true })
            .limit(1);
          
          if (!overdueOrders?.length) return { success: true, data: { message: "No overdue payments found" } };
          const order = overdueOrders[0];
          const pending = (order.total_sales_amount || 0) - (order.amount_paid || 0);

          await client.from("tasks").insert({
            title: `💰 Auto payment follow-up: ${order.customer_name} - ₹${pending.toLocaleString("en-IN")}`,
            description: `Auto-generated. Order ${order.order_number}. Pending: ₹${pending.toLocaleString("en-IN")}`,
            task_type: "finance_review",
            assigned_to: order.sales_person_id || userId,
            assigned_to_name: order.sales_person_name || userName,
            assigned_role: "sales",
            priority: 1,
            due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            created_by: userId,
            created_by_name: `AI (${userName})`,
            status: "new",
          });
          return { success: true, data: { message: `Payment follow-up created for ${order.customer_name}` } };
        }
        return { success: true, data: { message: "Payment follow-up processed" } };
      }
      default:
        return { success: false, error: `Unknown action type: ${actionType}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
