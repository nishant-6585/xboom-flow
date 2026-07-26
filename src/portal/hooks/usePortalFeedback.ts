import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalAuth } from "@/portal/hooks/usePortalAuth";

export type FeedbackCategory =
  | "overall"
  | "product_quality"
  | "delivery"
  | "support"
  | "portal_experience";

export const FEEDBACK_CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: "overall", label: "Overall experience" },
  { value: "product_quality", label: "Product quality" },
  { value: "delivery", label: "Delivery & logistics" },
  { value: "support", label: "Support" },
  { value: "portal_experience", label: "Portal experience" },
];

export interface PortalFeedbackRow {
  id: string;
  order_id: string | null;
  rating: number;
  category: FeedbackCategory;
  comment: string | null;
  created_at: string;
}

export function usePortalFeedbackList() {
  return useQuery({
    queryKey: ["portal", "feedback"],
    queryFn: async (): Promise<PortalFeedbackRow[]> => {
      const { data, error } = await supabase
        .from("portal_feedback")
        .select("id, order_id, rating, category, comment, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown) as PortalFeedbackRow[];
    },
  });
}

export interface NewFeedbackInput {
  rating: number;
  category: FeedbackCategory;
  comment: string;
  order_id: string | null;
}

export function useSubmitFeedback() {
  const qc = useQueryClient();
  const { account, contact } = usePortalAuth();
  return useMutation({
    mutationFn: async (input: NewFeedbackInput) => {
      if (!account?.id) throw new Error("Account not loaded");
      const { error } = await supabase.from("portal_feedback").insert({
        account_id: account.id,
        contact_id: contact?.id ?? null,
        order_id: input.order_id,
        rating: input.rating,
        category: input.category,
        comment: input.comment.trim() || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal", "feedback"] }),
  });
}
