import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export type NoticeVisibility = "all" | "sales" | "supply_chain" | "finance" | "admin";
export type NoticePriority = "low" | "normal" | "high" | "urgent";

export interface Notice {
  id: string;
  title: string;
  content: string;
  priority: NoticePriority;
  visibility: NoticeVisibility[];
  is_active: boolean;
  expires_at: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface NoticeRead {
  id: string;
  notice_id: string;
  user_id: string;
  read_at: string;
}

export interface NoticeFormData {
  title: string;
  content: string;
  priority: NoticePriority;
  visibility: NoticeVisibility[];
  expires_at?: string;
}

export function useNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unreadNotices, setUnreadNotices] = useState<Notice[]>([]);
  const [readNoticeIds, setReadNoticeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, profile, role } = useAuth();
  const { toast } = useToast();

  const fetchNotices = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from("notices")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setNotices((data || []) as Notice[]);
    } catch (error: any) {
      console.error("Error fetching notices:", error);
    }
  }, [user]);

  const fetchReadNotices = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("notice_reads")
        .select("notice_id")
        .eq("user_id", user.id);

      if (error) throw error;
      setReadNoticeIds((data || []).map(r => r.notice_id));
    } catch (error: any) {
      console.error("Error fetching read notices:", error);
    }
  }, [user]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchNotices(), fetchReadNotices()]);
      setLoading(false);
    };
    loadData();
  }, [fetchNotices, fetchReadNotices]);

  useEffect(() => {
    const unread = notices.filter(n => !readNoticeIds.includes(n.id));
    setUnreadNotices(unread);
  }, [notices, readNoticeIds]);

  const createNotice = async (formData: NoticeFormData) => {
    if (!user || !profile) return { error: new Error("Not authenticated") };

    try {
      const { error } = await supabase.from("notices").insert({
        title: formData.title,
        content: formData.content,
        priority: formData.priority,
        visibility: formData.visibility,
        expires_at: formData.expires_at || null,
        created_by: user.id,
        created_by_name: profile.name,
      });

      if (error) throw error;

      toast({
        title: "Notice Created",
        description: "The notice has been published successfully.",
      });

      await fetchNotices();
      return { error: null };
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };

  const updateNotice = async (id: string, formData: Partial<NoticeFormData> & { is_active?: boolean }) => {
    if (!user) return { error: new Error("Not authenticated") };

    try {
      const { error } = await supabase
        .from("notices")
        .update({
          ...formData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Notice Updated",
        description: "The notice has been updated successfully.",
      });

      await fetchNotices();
      return { error: null };
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };

  const deleteNotice = async (id: string) => {
    if (!user) return { error: new Error("Not authenticated") };

    try {
      const { error } = await supabase.from("notices").delete().eq("id", id);

      if (error) throw error;

      toast({
        title: "Notice Deleted",
        description: "The notice has been removed.",
      });

      await fetchNotices();
      return { error: null };
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };

  const markAsRead = async (noticeId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase.from("notice_reads").insert({
        notice_id: noticeId,
        user_id: user.id,
      });

      if (error && !error.message.includes("duplicate")) throw error;

      setReadNoticeIds(prev => [...prev, noticeId]);
    } catch (error: any) {
      console.error("Error marking notice as read:", error);
    }
  };

  const markAllAsRead = async () => {
    if (!user || unreadNotices.length === 0) return;

    try {
      const inserts = unreadNotices.map(n => ({
        notice_id: n.id,
        user_id: user.id,
      }));

      const { error } = await supabase.from("notice_reads").insert(inserts);

      if (error && !error.message.includes("duplicate")) throw error;

      setReadNoticeIds(prev => [...prev, ...unreadNotices.map(n => n.id)]);
      
      toast({
        title: "All Marked as Read",
        description: "All notices have been marked as read.",
      });
    } catch (error: any) {
      console.error("Error marking all as read:", error);
    }
  };

  return {
    notices,
    unreadNotices,
    readNoticeIds,
    loading,
    createNotice,
    updateNotice,
    deleteNotice,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotices,
  };
}
