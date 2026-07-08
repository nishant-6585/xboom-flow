
-- Harden realtime.messages authorization: replace substring match with structured comparison.
-- The old policy allowed access whenever the requesting user's UUID appeared anywhere in
-- the topic string, which is guessable/craftable. Replace with an exact structured match
-- (topic = 'user:<uid>' or 'user:<uid>:*') while keeping the postgres_changes extension
-- exemption (postgres_changes is separately authorized via table RLS).

DROP POLICY IF EXISTS "Authenticated users can read scoped realtime topics" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can write scoped realtime topics" ON realtime.messages;

CREATE POLICY "Authenticated users can read scoped realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    extension = 'postgres_changes'
    OR realtime.topic() = ('user:' || auth.uid()::text)
    OR realtime.topic() LIKE ('user:' || auth.uid()::text || ':%')
  )
);

CREATE POLICY "Authenticated users can write scoped realtime topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    extension = 'postgres_changes'
    OR realtime.topic() = ('user:' || auth.uid()::text)
    OR realtime.topic() LIKE ('user:' || auth.uid()::text || ':%')
  )
);
