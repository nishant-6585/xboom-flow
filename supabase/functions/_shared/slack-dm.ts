// Shared helper to DM a Slack user by email. Used by SMS / WhatsApp /
// notification workers to alert ops about failures.
//
// Requires the SLACK_BOT_TOKEN env var to be set. The bot needs the
// `users:read.email`, `chat:write`, and `im:write` scopes.

export interface SlackDmResult {
  ok: boolean;
  error?: string;
  channel?: string;
}

async function lookupSlackUserId(botToken: string, email: string): Promise<string | null> {
  const url = `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${botToken}` },
  });
  const j = await r.json().catch(() => null) as { ok?: boolean; user?: { id?: string }; error?: string } | null;
  if (!j?.ok || !j.user?.id) return null;
  return j.user.id;
}

/**
 * Post to a Slack channel by id. The bot must be a member of the channel for
 * private ones; `chat:write.public` covers public channels it has not joined.
 */
export async function postSlackChannel(
  channelId: string,
  text: string,
  blocks?: unknown[],
): Promise<SlackDmResult> {
  try {
    const botToken = Deno.env.get("SLACK_BOT_TOKEN");
    if (!botToken) return { ok: false, error: "SLACK_BOT_TOKEN not configured" };
    return await postDm(botToken, channelId, text, blocks);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "slack post failed" };
  }
}

/**
 * Send a Slack direct message to a known Slack member id (the value stored in
 * `profiles.slack_user_id`). Skips the users.lookupByEmail round-trip, so it
 * also works for staff whose Slack account uses a different address than their
 * app login.
 */
export async function sendSlackDmToUserId(
  slackUserId: string,
  text: string,
  blocks?: unknown[],
): Promise<SlackDmResult> {
  try {
    const botToken = Deno.env.get("SLACK_BOT_TOKEN");
    if (!botToken) return { ok: false, error: "SLACK_BOT_TOKEN not configured" };
    return await postDm(botToken, slackUserId, text, blocks);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "slack dm failed" };
  }
}

async function postDm(
  botToken: string,
  channel: string,
  text: string,
  blocks?: unknown[],
): Promise<SlackDmResult> {
  const body: Record<string, unknown> = { channel, text };
  if (blocks && blocks.length) body.blocks = blocks;

  const r = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => null) as { ok?: boolean; error?: string; channel?: string } | null;
  if (!j?.ok) return { ok: false, error: j?.error || `http ${r.status}` };
  return { ok: true, channel: j.channel };
}

/**
 * Send a Slack direct message to a user identified by email.
 * Returns {ok:false,...} on any failure but never throws — callers should not
 * let notification problems break their main flow.
 */
export async function sendSlackDmToEmail(
  email: string,
  text: string,
  blocks?: unknown[],
): Promise<SlackDmResult> {
  try {
    const botToken = Deno.env.get("SLACK_BOT_TOKEN");
    if (!botToken) return { ok: false, error: "SLACK_BOT_TOKEN not configured" };

    const userId = await lookupSlackUserId(botToken, email);
    if (!userId) return { ok: false, error: `slack user not found for ${email}` };

    return await postDm(botToken, userId, text, blocks);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "slack dm failed" };
  }
}