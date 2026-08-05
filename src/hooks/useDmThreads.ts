import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type DmThread = {
  id: string;
  user_a: string;
  user_b: string;
  other_user_id: string;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
};

export function useDmThreads() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id;

  const query = useQuery({
    queryKey: ["dm-threads", uid],
    enabled: !!uid,
    queryFn: async (): Promise<DmThread[]> => {
      const { data: threads, error } = await supabase
        .from("dm_threads")
        .select("id, user_a, user_b, last_message_at, last_message_preview")
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      const list = threads ?? [];
      if (list.length === 0) return [];
      const ids = list.map((t: any) => t.id);
      const { data: unread } = await supabase
        .from("dm_messages")
        .select("thread_id")
        .in("thread_id", ids)
        .is("read_at", null)
        .neq("sender_id", uid!);
      const unreadMap = new Map<string, number>();
      (unread ?? []).forEach((m: any) => {
        unreadMap.set(m.thread_id, (unreadMap.get(m.thread_id) ?? 0) + 1);
      });
      return list.map((t: any) => ({
        ...t,
        other_user_id: t.user_a === uid ? t.user_b : t.user_a,
        unread_count: unreadMap.get(t.id) ?? 0,
      }));
    },
  });

  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`dm-threads-${uid}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["dm-threads", uid] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_threads" }, () => {
        qc.invalidateQueries({ queryKey: ["dm-threads", uid] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, qc]);

  const totalUnread = (query.data ?? []).reduce((sum, t) => sum + (t.unread_count || 0), 0);
  return { ...query, threads: query.data ?? [], totalUnread };
}

export async function openOrCreateThread(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc("get_or_create_dm_thread", {
    other_user: otherUserId,
  });
  if (error) throw error;
  return data as string;
}