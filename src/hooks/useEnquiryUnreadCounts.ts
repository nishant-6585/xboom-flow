import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Returns a map of { [enquiryId]: unreadCount } — messages authored by
 * other users that the current viewer has not marked as read yet.
 */
export function useEnquiryUnreadCounts(enquiryIds: string[]) {
  const { user, isApproved } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Stabilize dep — avoid refetching on every render when caller passes
  // a fresh array with the same members.
  const idsKey = useMemo(() => [...enquiryIds].sort().join(","), [enquiryIds]);

  const fetchCounts = useCallback(async () => {
    if (!user || !isApproved || enquiryIds.length === 0) {
      setCounts({});
      return;
    }
    const { data, error } = await supabase
      .from("enquiry_messages")
      .select("enquiry_id")
      .in("enquiry_id", enquiryIds)
      .eq("is_read", false)
      .neq("sender_id", user.id);

    if (error || !data) {
      setCounts({});
      return;
    }
    const next: Record<string, number> = {};
    for (const row of data as { enquiry_id: string }[]) {
      next[row.enquiry_id] = (next[row.enquiry_id] || 0) + 1;
    }
    setCounts(next);
  }, [idsKey, user?.id, isApproved]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchCounts();
    if (!user || enquiryIds.length === 0) return;

    const channel = supabase
      .channel(`enquiry-unread-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "enquiry_messages" },
        () => fetchCounts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCounts, user?.id, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return counts;
}