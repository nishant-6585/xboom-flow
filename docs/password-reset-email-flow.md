# Password Reset Email Flow

Reference for verifying deliverability of admin-triggered password resets.

## Trigger paths

| # | UI location | Handler | Edge function |
|---|---|---|---|
| 1 | Admin → User Management → user row → "Reset" button | `handleResetPassword(email, name)` in `src/pages/Admin.tsx` | `send-password-reset-email` |
| 2 | Admin → User Management → "Password Reset Email Log" card → "Retry" on a `queued`/`failed` row | `handleResendResetEmail(entryId, email)` in `src/pages/Admin.tsx` | `send-password-reset-email` (invoked again with the same recipient email) |

Both paths call the exact same edge function; a new log row is inserted per invocation.

End-user "Forgot password" on the login screen still uses Supabase's built-in `auth.resetPasswordForEmail` and is NOT part of this branded path.

## Edge function: `send-password-reset-email`

Location: `supabase/functions/send-password-reset-email/index.ts`

1. Verifies caller JWT; requires `admin` or `hr` in `public.user_roles`, else 403.
2. Validates body `{ email, name? }`.
3. Best-effort lookup of `profiles.id` by email for `recipient_user_id`.
4. Inserts `queued` row into `public.password_reset_email_log` with `context='admin_reset'`, `provider='resend'`, `from_address='XBOOM HR <hr@xboom.in>'`, `triggered_by=auth.uid()`.
5. Token: `supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: `${SITE_URL}/auth` } })`. Supabase issues the recovery token — we do not mint our own. Default TTL 24h.
6. POSTs branded HTML to `https://api.resend.com/emails` with `from = XBOOM HR <hr@xboom.in>`, `subject = "Reset your XBOOM Flow password"`.
7. On 2xx: updates log to `status='sent'` + `provider_message_id`.
8. On error: updates log to `status='failed'` + `error_message` (500 char cap). If the row wasn't created yet, inserts a `failed` row.

## Sender / infrastructure

- Sender: `XBOOM HR <hr@xboom.in>` (constant `FROM`)
- Provider: Resend via `RESEND_API_KEY` secret. No Lovable Emails / pgmq queue.
- Redirect after reset: `${SITE_URL}/auth` (default `https://xboomflow.com/auth`).
- Token TTL: 24h (Supabase recovery default).

## Log table: `public.password_reset_email_log`

RLS: only `admin` and `hr` can SELECT. Writes happen via service role in the edge function.

Key columns: `status` (queued→sent/failed), `provider`, `provider_message_id`, `error_message`, `context` (=`admin_reset`), `triggered_by`, `recipient_user_id`, `recipient_email`, `from_address`, timestamps.

## Verifying deliverability

1. Confirm row `status='sent'`; copy `provider_message_id`.
2. Look up that id in the Resend dashboard for SMTP accept / bounce / complaint.
3. If `status='failed'`, read `error_message`. Common causes:
   - `RESEND_API_KEY not configured` — set secret.
   - `Failed to generate recovery link` — email not in `auth.users`.
   - `Resend failed (4xx/5xx)` — domain not verified in Resend or recipient suppressed.
4. Click Retry in the Password Reset Email Log card to re-invoke; a new log row is produced.
