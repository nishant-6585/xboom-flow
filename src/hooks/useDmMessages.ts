import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type DmMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export function useDmMessages(threadId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id;

  const query = useQuery({
    queryKey: ["dm-messages", threadId],
    enabled: !!threadId,
    queryFn: async (): Promise<DmMessage[]> => {
      const { data, error } = await supabase
        .from("dm_messages")
        .select("*")
        .eq("thread_id", threadId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DmMessage[];
    },
  });

  useEffect(() => {
    if (!threadId) return;
    const ch = supabase
      .channel(`dm-msg-${threadId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["dm-messages", threadId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [threadId, qc]);

  // Mark unread incoming messages as read
  useEffect(() => {
    if (!threadId || !uid || !query.data) return;
    const unreadIds = query.data
      .filter((m) => m.sender_id !== uid && !m.read_at)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;
    supabase
      .from("dm_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["dm-threads", uid] });
      });
  }, [threadId, uid, query.data, qc]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!threadId || !uid) throw new Error("Not ready");
      const trimmed = body.trim();
      if (!trimmed) throw new Error("Empty message");
      const { error } = await supabase
        .from("dm_messages")
        .insert({ thread_id: threadId, sender_id: uid, body: trimmed });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dm-messages", threadId] });
      qc.invalidateQueries({ queryKey: ["dm-threads", uid] });
    },
  });

  return { messages: query.data ?? [], isLoading: query.isLoading, send: sendMutation.mutateAsync, isSending: sendMutation.isPending };
}