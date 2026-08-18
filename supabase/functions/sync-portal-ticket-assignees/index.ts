// Mirrors the membership of the Slack channel #customer-portal-ticket into
// public.portal_ticket_assignee_pool.
//
// Slack is the source of truth for who can own a portal ticket: add someone to
// the channel and they appear in the "Assign to…" dropdown and enter the
// round-robin rotation; remove them and they drop out. Bots (including XBoom
// Bot itself) and deactivated Slack accounts are always excluded.
//
// Slack users are matched to staff by EMAIL, not by name — names collide and
// change. A Slack member whose email matches no profile is reported back as
// `unmatched` rather than silently dropped, because that is a real
// misconfiguration someone needs to fix.
//
// Side effect worth having: every matched member's Slack id is written to
// profiles.slack_user_id, which closes the gap where Slack DMs fall back to
// users.lookupByEmail and silently fail for anyone whose Slack address differs
// from their app login.
//
// Auth: x-cron-secret, or a caller holding admin/supply_chain (so the admin UI
// can offer a "Sync now" button).
//
// Required Slack bot scopes:
//   groups:read       — read members of a PRIVATE channel (channels:read only
//                       covers public ones; #customer-portal-ticket is private)
//   users:read        — resolve member ids to users
//   users:read.email  — read the email used for matching

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
// Defaults to #customer-portal-ticket. Override without a redeploy by setting
// the secret if the channel is ever recreated.
const CHANNEL_ID = Deno.env.get("SLACK_TICKET_CHANNEL_ID") ?? "C0BR3CZ0KLL";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function slack<T>(method: string, params: Record<string, string>): Promise<T> {
  const url = `https://slack.com/api/${method}?${new URLSearchParams(params)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
  });
  const j = await r.json().catch(() => null) as { ok?: boolean; error?: string } | null;
  if (!j?.ok) {
    throw new Error(
      `slack ${method} failed: ${j?.error ?? `http ${r.status}`}` +
        (j?.error === "missing_scope"
          ? " (the bot needs groups:read for private channels, plus users:read and users:read.email)"
          : j?.error === "not_in_channel"
          ? " (invite the XBoom Bot app to the channel)"
          : ""),
    );
  }
  return j as unknown as T;
}

/** Slack paginates channel membership; a small team fits one page, but don't assume. */
async function channelMemberIds(channel: string): Promise<string[]> {
  const ids: string[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const params: Record<string, string> = { channel, limit: "200" };
    if (cursor) params.cursor = cursor;
    const res = await slack<{ members: string[]; response_metadata?: { next_cursor?: string } }>(
      "conversations.members",
      params,
    );
    ids.push(...(res.members ?? []));
    cursor = res.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }
  return ids;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!SLACK_BOT_TOKEN) return json({ error: "SLACK_BOT_TOKEN not configured" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Either the cron secret, or an admin/supply_chain user pressing "Sync now".
  const cronOk = !!CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET;
  if (!cronOk) {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Missing authorization" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Invalid token" }, 401);
    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", u.user.id);
    const allowed = new Set(["admin", "supply_chain"]);
    if (!((roles ?? []) as { role: string }[]).some((r) => allowed.has(r.role))) {
      return json({ error: "Forbidden" }, 403);
    }
  }

  try {
    const memberIds = await channelMemberIds(CHANNEL_ID);

    // Resolve each Slack member to an email, skipping bots and deleted users.
    const slackUsers: Array<{ id: string; email: string; handle: string }> = [];
    const skipped: Array<{ slack_user_id: string; reason: string }> = [];
    for (const id of memberIds) {
      try {
        const res = await slack<{
          user: {
            id: string; name?: string; deleted?: boolean; is_bot?: boolean;
            profile?: { email?: string; real_name?: string };
          };
        }>("users.info", { user: id });
        const u = res.user;
        if (u.is_bot) { skipped.push({ slack_user_id: id, reason: "bot" }); continue; }
        if (u.deleted) { skipped.push({ slack_user_id: id, reason: "deactivated" }); continue; }
        const email = u.profile?.email?.trim().toLowerCase();
        if (!email) {
          skipped.push({ slack_user_id: id, reason: "no email visible (needs users:read.email)" });
          continue;
        }
        slackUsers.push({
          id,
          email,
          handle: u.profile?.real_name || u.name || email,
        });
      } catch (e) {
        skipped.push({
          slack_user_id: id,
          reason: e instanceof Error ? e.message : "users.info failed",
        });
      }
    }

    // Match to staff by email. profiles.user_id is the auth uid that
    // portal_tickets.assigned_to references — profiles.id is the row's own uuid.
    const emails = slackUsers.map((s) => s.email);
    const { data: profs } = await admin
      .from("profiles")
      .select("user_id, name, email")
      .in("email", emails);
    const byEmail = new Map(
      ((profs ?? []) as Array<{ user_id: string; name: string | null; email: string }>)
        .map((p) => [p.email.trim().toLowerCase(), p]),
    );

    const members: Array<{ user_id: string; slack_user_id: string; slack_handle: string }> = [];
    const unmatched: Array<{ slack_user_id: string; slack_handle: string; email: string }> = [];
    for (const s of slackUsers) {
      const p = byEmail.get(s.email);
      if (!p) {
        unmatched.push({ slack_user_id: s.id, slack_handle: s.handle, email: s.email });
        continue;
      }
      members.push({ user_id: p.user_id, slack_user_id: s.id, slack_handle: p.name || s.handle });
    }

    // Refuse to wipe the pool. If every Slack member failed to match, that is a
    // configuration fault (missing scope, wrong channel), not an instruction to
    // empty the rotation and leave every new ticket unassigned.
    if (members.length === 0) {
      return json({
        ok: false,
        error: "no Slack member matched a staff profile — pool left unchanged",
        channel: CHANNEL_ID,
        slack_members: memberIds.length,
        unmatched,
        skipped,
      }, 422);
    }

    const { data: result, error: syncErr } = await admin.rpc(
      "sync_portal_ticket_assignee_pool",
      { _members: members },
    );
    if (syncErr) throw new Error(`pool sync failed: ${syncErr.message}`);

    const counts = (Array.isArray(result) ? result[0] : result) as
      | { added: number; kept: number; deactivated: number }
      | undefined;

    console.log(
      `[sync-portal-ticket-assignees] channel=${CHANNEL_ID} ` +
        `slack=${memberIds.length} matched=${members.length} ` +
        `unmatched=${unmatched.length} skipped=${skipped.length} ` +
        `added=${counts?.added ?? 0} kept=${counts?.kept ?? 0} deactivated=${counts?.deactivated ?? 0}`,
    );
    if (unmatched.length) {
      console.warn(
        "[sync-portal-ticket-assignees] unmatched Slack members: " +
          unmatched.map((u) => `${u.slack_handle}<${u.email}>`).join(", "),
      );
    }

    return json({
      ok: true,
      channel: CHANNEL_ID,
      slack_members: memberIds.length,
      pool: members.length,
      added: counts?.added ?? 0,
      kept: counts?.kept ?? 0,
      deactivated: counts?.deactivated ?? 0,
      unmatched,
      skipped,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync-portal-ticket-assignees]", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
