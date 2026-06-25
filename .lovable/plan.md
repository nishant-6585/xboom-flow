# Plan: Internal Direct Messaging (1:1) for All Users

Add a Slack-style 1:1 chat available to every authenticated user, with persistent threaded history (one thread per pair of users).

## Database (new migration)

1. `public.dm_threads`
   - `id uuid PK`, `user_a uuid`, `user_b uuid` (sorted so `user_a < user_b` to enforce a single thread per pair), `last_message_at timestamptz`, `created_at`.
   - Unique index on `(user_a, user_b)`.
2. `public.dm_messages`
   - `id uuid PK`, `thread_id uuid FK -> dm_threads`, `sender_id uuid`, `body text`, `created_at`, `read_at timestamptz`.
   - Index on `(thread_id, created_at desc)`.
3. RPC `public.get_or_create_dm_thread(other_user uuid)` (SECURITY DEFINER) — normalizes the pair, returns thread id.
4. RLS (both tables): only the two participants can SELECT / INSERT. Sender-only UPDATE on `dm_messages` (for read receipts the recipient updates own `read_at` via RPC).
5. GRANTs to `authenticated` + `service_role`; enable Realtime on `dm_messages` and `dm_threads`.

## Frontend

Route: `/messages` and `/messages/:threadId` (React Router, derives active thread from URL — per chat-agent-ui-contract).

Components:
- `src/pages/Messages.tsx` — two-pane layout.
- `src/components/messages/ThreadList.tsx` — left sidebar: list of existing threads (other user's name/avatar, last message preview, unread badge), plus "New chat" button that opens a user picker (uses `useSalesUsers`/profiles) and navigates to the created thread route.
- `src/components/messages/ChatWindow.tsx` — keyed by `threadId`; loads messages ordered by `created_at`, renders bubbles (user vs other), auto-scrolls, marks recipient messages read on view.
- `src/components/messages/MessageComposer.tsx` — textarea + send; optimistic insert; Enter to send, Shift+Enter newline; stays focused.

Hooks:
- `useDmThreads()` — list current user's threads with last message + unread count; realtime invalidation on `dm_messages` insert.
- `useDmMessages(threadId)` — fetch + realtime subscribe (cleanup on unmount).
- `useSendDmMessage(threadId)` — mutation with React Query optimistic update.

Navigation:
- Add "Messages" entry to the main sidebar (visible to all authenticated users) with an unread-count badge fed by `useDmThreads`.

## Out of scope
Group channels, file attachments, message editing/deletion, typing indicators, push notifications. (Can be follow-ups.)

## Verification
- Two browsers / accounts: open `/messages`, start a chat with each other, send messages, confirm realtime delivery, reload `/messages/:id` restores history, unread badge clears on view.
