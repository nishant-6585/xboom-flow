import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AIChat {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AIMessage {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useAIChats() {
  const { user } = useAuth();
  const [chats, setChats] = useState<AIChat[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchChats = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_chats')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setChats((data as unknown as AIChat[]) || []);
    } catch (e) {
      console.error('Failed to fetch chats:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const createChat = useCallback(async (title = 'New Chat'): Promise<AIChat | null> => {
    if (!user) return null;
    try {
      const { data, error } = await supabase
        .from('ai_chats')
        .insert({ user_id: user.id, title })
        .select()
        .single();
      if (error) throw error;
      const chat = data as unknown as AIChat;
      setChats(prev => [chat, ...prev]);
      return chat;
    } catch (e) {
      console.error('Failed to create chat:', e);
      return null;
    }
  }, [user]);

  const renameChat = useCallback(async (chatId: string, title: string) => {
    try {
      const { error } = await supabase
        .from('ai_chats')
        .update({ title })
        .eq('id', chatId);
      if (error) throw error;
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, title } : c));
    } catch (e) {
      console.error('Failed to rename chat:', e);
    }
  }, []);

  const deleteChat = useCallback(async (chatId: string) => {
    try {
      const { error } = await supabase
        .from('ai_chats')
        .delete()
        .eq('id', chatId);
      if (error) throw error;
      setChats(prev => prev.filter(c => c.id !== chatId));
    } catch (e) {
      console.error('Failed to delete chat:', e);
    }
  }, []);

  const fetchMessages = useCallback(async (chatId: string): Promise<AIMessage[]> => {
    try {
      const { data, error } = await supabase
        .from('ai_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data as unknown as AIMessage[]) || [];
    } catch (e) {
      console.error('Failed to fetch messages:', e);
      return [];
    }
  }, []);

  const addMessage = useCallback(async (chatId: string, role: 'user' | 'assistant', content: string, metadata: Record<string, unknown> = {}) => {
    try {
      const { error } = await supabase
        .from('ai_messages')
        .insert({ chat_id: chatId, role, content, metadata } as any);
      if (error) throw error;
      // Bump chat updated_at
      await supabase.from('ai_chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
    } catch (e) {
      console.error('Failed to add message:', e);
    }
  }, []);

  const autoTitleChat = useCallback(async (chatId: string, firstMessage: string) => {
    const title = firstMessage.length > 40 ? firstMessage.slice(0, 40) + '…' : firstMessage;
    await renameChat(chatId, title);
  }, [renameChat]);

  return {
    chats,
    loading,
    fetchChats,
    createChat,
    renameChat,
    deleteChat,
    fetchMessages,
    addMessage,
    autoTitleChat,
  };
}
