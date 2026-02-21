import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const client = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Find items at or below reorder point that haven't been alerted in the last 6 hours
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    // Use raw SQL via RPC since we need column-to-column comparison
    const { data: lowStockItems, error: fetchError } = await client.rpc("get_low_stock_items" as any);

    if (fetchError) throw fetchError;

    if (!lowStockItems || lowStockItems.length === 0) {
      return new Response(
        JSON.stringify({ status: "ok", alerts: 0, message: "No low-stock items" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter out recently alerted items
    const itemsToAlert = lowStockItems.filter((item: any) => {
      if (!item.last_alert_sent_at) return true;
      return new Date(item.last_alert_sent_at) < new Date(sixHoursAgo);
    });

    if (itemsToAlert.length === 0) {
      return new Response(
        JSON.stringify({ status: "ok", alerts: 0, message: "All low-stock items already alerted recently" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let alertCount = 0;
    let taskCount = 0;

    // Find a supply chain user for task assignment
    const { data: supplyChainUsers } = await client
      .from("user_roles")
      .select("user_id")
      .eq("role", "supply_chain")
      .limit(5);

    const { data: profiles } = supplyChainUsers && supplyChainUsers.length > 0
      ? await client
          .from("profiles")
          .select("user_id, name")
          .in("user_id", supplyChainUsers.map((u: any) => u.user_id))
          .eq("is_approved", true)
          .limit(1)
      : { data: null };

    const assignee = profiles?.[0] || null;

    for (const item of itemsToAlert) {
      const isCritical = item.current_stock <= (item.safety_stock || 0);
      const alertType = isCritical ? "critical_low" : "low_stock";

      // 1. Log the alert
      const { error: logError } = await client.from("inventory_alert_logs").insert({
        inventory_id: item.id,
        product_name: item.product_name,
        product_category: item.product_category,
        current_stock: item.current_stock,
        reorder_point: item.reorder_point,
        alert_type: alertType,
        notification_sent: true,
      });

      if (logError) {
        console.error(`Failed to log alert for ${item.product_name}:`, logError.message);
        continue;
      }

      // 2. Create a task for supply chain
      if (assignee) {
        const { data: taskData, error: taskError } = await client.from("tasks").insert({
          task_type: "general",
          title: `${isCritical ? "🚨 CRITICAL" : "⚠️"} Restock: ${item.product_name}`,
          description: `Stock Level: ${item.current_stock}\nReorder Point: ${item.reorder_point}\nSafety Stock: ${item.safety_stock || 0}\nCategory: ${item.product_category}\n\nPlease initiate procurement for this item.`,
          assigned_to: assignee.user_id,
          assigned_to_name: assignee.name,
          assigned_role: "supply_chain",
          priority: isCritical ? 1 : 2,
          due_date: new Date(Date.now() + (isCritical ? 24 : 48) * 60 * 60 * 1000).toISOString(),
        }).select("id").single();

        if (!taskError && taskData) {
          taskCount++;
          // Update alert log with task reference
          await client
            .from("inventory_alert_logs")
            .update({ task_created_id: taskData.id })
            .eq("inventory_id", item.id)
            .order("created_at", { ascending: false })
            .limit(1);
        }
      }

      // 3. Create in-app notification
      await client.from("notifications").insert({
        type: "low_stock",
        title: isCritical
          ? `🚨 Critical Stock: ${item.product_name}`
          : `⚠️ Low Stock: ${item.product_name}`,
        message: `${item.product_name} (${item.product_category}) has ${item.current_stock} units remaining. Reorder point: ${item.reorder_point}.`,
        target_role: "supply_chain",
      });

      // 4. Update last_alert_sent_at
      await client
        .from("inventory")
        .update({ last_alert_sent_at: new Date().toISOString() })
        .eq("id", item.id);

      alertCount++;
    }

    // 5. Send Slack notification (aggregate)
    if (alertCount > 0) {
      try {
        const slackWebhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
        const slackBotToken = Deno.env.get("SLACK_BOT_TOKEN");

        if (slackWebhookUrl || slackBotToken) {
          const criticalItems = itemsToAlert.filter(
            (i: any) => i.current_stock <= (i.safety_stock || 0)
          );
          const warningItems = itemsToAlert.filter(
            (i: any) => i.current_stock > (i.safety_stock || 0)
          );

          let message = `📦 *Low Stock Alert* — ${alertCount} item(s) need attention\n\n`;

          if (criticalItems.length > 0) {
            message += `🚨 *Critical (at/below safety stock):*\n`;
            criticalItems.forEach((i: any) => {
              message += `• ${i.product_name}: *${i.current_stock}* units (reorder: ${i.reorder_point})\n`;
            });
          }

          if (warningItems.length > 0) {
            message += `\n⚠️ *Warning (at/below reorder point):*\n`;
            warningItems.forEach((i: any) => {
              message += `• ${i.product_name}: *${i.current_stock}* units (reorder: ${i.reorder_point})\n`;
            });
          }

          message += `\n${taskCount} task(s) created for Supply Chain team.`;

          if (slackWebhookUrl) {
            await fetch(slackWebhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: message }),
            });
          } else if (slackBotToken) {
            // Try to get the procurements channel
            const { data: slackSettings } = await client
              .from("slack_settings")
              .select("channel_procurements")
              .limit(1)
              .single();

            const channel = slackSettings?.channel_procurements;
            if (channel) {
              await fetch("https://slack.com/api/chat.postMessage", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${slackBotToken}`,
                },
                body: JSON.stringify({ channel, text: message }),
              });
            }
          }
        }
      } catch (slackErr) {
        console.error("Slack notification failed (non-blocking):", slackErr);
      }
    }

    const result = { status: "ok", alerts: alertCount, tasks: taskCount, total_low_stock: itemsToAlert.length };
    console.log("Low-stock alert run:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Low-stock alert error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
