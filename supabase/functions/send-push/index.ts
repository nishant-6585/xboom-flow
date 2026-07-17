// Web Push fan-out for public.notifications.
//
// Trigger: fired asynchronously by the DB trigger
// `trg_send_push_on_notification` for every INSERT on notifications.
//
// Flow:
//   1. Load the notification row (service role).
//   2. Resolve recipients: user_id target wins; otherwise everyone holding
//      target_role (via user_roles). Rows with neither are in-app only.
//   3. Load the recipients' saved browser push subscriptions and send a
//      Web Push message (VAPID-signed) to each. Expired/revoked
//      subscriptions (404/410) are deleted.
//
// Required secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// (e.g. mailto:notifications@xboom.in). Optional: CRON_SECRET (verified
// against the x-cron-secret header when set).

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:notifications@xboom.in";
const CRON_SECRET = Deno.env.get("CRON_SECRET");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ skipped: "VAPID keys not configured" });
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  let body: { notification_id?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const notificationId = body.notification_id;
  if (!notificationId) return json({ error: "notification_id required" }, 400);

  const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: notification, error: notifErr } = await supa
    .from("notifications")
    .select("id, type, title, message, target_role, user_id, enquiry_id")
    .eq("id", notificationId)
    .maybeSingle();

  if (notifErr || !notification) return json({ error: notifErr?.message || "not found" }, 404);

  // Resolve recipient user ids
  let userIds: string[] = [];
  if (notification.user_id) {
    userIds = [notification.user_id];
  } else if (notification.target_role) {
    const { data: roleUsers } = await supa
      .from("user_roles")
      .select("user_id")
      .eq("role", notification.target_role);
    userIds = (roleUsers || []).map((r: { user_id: string }) => r.user_id);
  } else {
    // No explicit target: in-app only, pushing to everyone would be noise.
    return json({ skipped: "no target" });
  }
  if (userIds.length === 0) return json({ skipped: "no recipients" });

  const { data: subs } = await supa
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (!subs || subs.length === 0) return json({ skipped: "no subscriptions" });

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.message,
    url: "/",
    notificationId: notification.id,
    enquiryId: notification.enquiry_id,
    tag: `xboom-${notification.type}-${notification.enquiry_id ?? notification.id}`,
  });

  let sent = 0, expired = 0, failed = 0;
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent++;
      await supa.from("push_subscriptions")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", sub.id);
    } catch (e: unknown) {
      const statusCode = (e as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Browser revoked / expired subscription — clean it up.
        expired++;
        await supa.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        failed++;
        console.error("web-push send failed:", statusCode, (e as Error)?.message);
      }
    }
  }));

  return json({ ok: true, sent, expired, failed });
});
