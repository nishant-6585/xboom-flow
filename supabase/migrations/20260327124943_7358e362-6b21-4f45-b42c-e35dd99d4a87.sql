
-- AI Chat Sessions
CREATE TABLE public.ai_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI Chat Messages
CREATE TABLE public.ai_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES public.ai_chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_ai_chats_user_id ON public.ai_chats(user_id);
CREATE INDEX idx_ai_chats_updated_at ON public.ai_chats(updated_at DESC);
CREATE INDEX idx_ai_messages_chat_id ON public.ai_messages(chat_id);
CREATE INDEX idx_ai_messages_created_at ON public.ai_messages(created_at);

-- Enable RLS
ALTER TABLE public.ai_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only access their own chats
CREATE POLICY "Users can manage own chats" ON public.ai_chats
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS: Users can only access messages in their own chats
CREATE POLICY "Users can manage own chat messages" ON public.ai_messages
  FOR ALL TO authenticated
  USING (chat_id IN (SELECT id FROM public.ai_chats WHERE user_id = auth.uid()))
  WITH CHECK (chat_id IN (SELECT id FROM public.ai_chats WHERE user_id = auth.uid()));

-- Auto-update updated_at on ai_chats
CREATE TRIGGER update_ai_chats_updated_at
  BEFORE UPDATE ON public.ai_chats
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
