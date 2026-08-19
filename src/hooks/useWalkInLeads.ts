import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WalkInLead {
  lead_id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  status: string | null;
  disposition: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  created_at: string;
  visited_at: string | null;
  store_location: string | null;
  products_interested: string[] | null;
  budget_range: string | null;
  purchase_timeline: string | null;
  visit_outcome: string | null;
  follow_up_at: string | null;
  referral_source: string | null;
  accompanied_by: string | null;
  notes: string | null;
  follow_up_overdue: boolean;
}

export interface ExistingLeadMatch {
  source: string;
  source_row_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  status: string | null;
  sales_person_name: string | null;
  created_at: string;
}

export interface WalkInInput {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  store_location?: string;
  products_interested?: string[];
  budget_range?: string;
  purchase_timeline?: string;
  visit_outcome?: string;
  follow_up_at?: string | null;
  referral_source?: string;
  accompanied_by?: string;
  notes?: string;
  visited_at?: string | null;
}

export const WALK_IN_OUTCOMES = [
  { value: "purchased", label: "Purchased on the spot" },
  { value: "quote_requested", label: "Wants a quote" },
  { value: "demo_given", label: "Demo given" },
  { value: "will_return", label: "Will come back" },
  { value: "just_browsing", label: "Just browsing" },
  { value: "not_interested", label: "Not interested" },
] as const;

export const WALK_IN_TIMELINES = [
  { value: "immediate", label: "Buying now" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "exploring", label: "Just exploring" },
] as const;

export const WALK_IN_REFERRAL_SOURCES = [
  "Passing by", "Google", "Instagram", "Facebook", "YouTube",
  "Friend / word of mouth", "Existing customer", "Event / expo",
  "Dealer", "Other",
] as const;

/** Walk-in leads visible to the current user, newest visit first. */
export function useWalkInLeads(mineOnly = false) {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["walk-in-leads", mineOnly],
    queryFn: async (): Promise<WalkInLead[]> => {
      const { data, error } = await (supabase as any).rpc("list_walk_in_leads", {
        _mine_only: mineOnly,
        _limit: 300,
      });
      if (error) throw error;
      return (data ?? []) as WalkInLead[];
    },
    staleTime: 30_000,
  });

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    return {
      total: data.length,
      today: data.filter((w) => w.visited_at && new Date(w.visited_at).toDateString() === today).length,
      overdue: data.filter((w) => w.follow_up_overdue).length,
      purchased: data.filter((w) => w.visit_outcome === "purchased").length,
      awaitingOutcome: data.filter((w) => !w.visit_outcome).length,
    };
  }, [data]);

  return { walkIns: data, stats, isLoading, error };
}

/**
 * Look for an existing lead with the same phone or email, across every source
 * in the unified feed. Walk-ins are the likeliest place to re-enter someone
 * already in the pipeline — they enquired last month, now they're at the
 * counter — and two reps unknowingly working one customer is worse than a
 * moment's friction at capture time.
 *
 * Phone matching uses the last 10 digits, so +91 / 0 / spacing variants still
 * collide the way a person would expect.
 */
export function useExistingLeadMatches(phone: string, email: string) {
  const digits = phone.replace(/\D/g, "");
  const enabled = digits.length >= 10 || /\S+@\S+\.\S+/.test(email);

  const { data = [], isFetching } = useQuery({
    enabled,
    queryKey: ["lead-contact-match", digits.slice(-10), email.trim().toLowerCase()],
    queryFn: async (): Promise<ExistingLeadMatch[]> => {
      const { data, error } = await (supabase as any).rpc("find_leads_by_contact", {
        _phone: digits || null,
        _email: email.trim() || null,
      });
      if (error) throw error;
      return (data ?? []) as ExistingLeadMatch[];
    },
    staleTime: 60_000,
  });

  return { matches: data, isChecking: isFetching && enabled };
}

/**
 * Record a walk-in. One RPC rather than two inserts so a lead can never end up
 * without its visit detail. Assignment to the creator happens in the database,
 * not here, so it holds regardless of which surface calls this.
 */
export function useCreateWalkInLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: WalkInInput): Promise<number> => {
      const { data, error } = await (supabase as any).rpc("create_walk_in_lead", {
        _name: input.name,
        _phone: input.phone,
        _email: input.email || null,
        _company: input.company || null,
        _store_location: input.store_location || null,
        _products_interested: input.products_interested ?? [],
        _budget_range: input.budget_range || null,
        _purchase_timeline: input.purchase_timeline || null,
        _visit_outcome: input.visit_outcome || null,
        _follow_up_at: input.follow_up_at || null,
        _referral_source: input.referral_source || null,
        _accompanied_by: input.accompanied_by || null,
        _notes: input.notes || null,
        _visited_at: input.visited_at || null,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["walk-in-leads"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["unified-lead-feed"] });
    },
  });
}

/** Update the outcome / follow-up after the customer has left. */
export function useUpdateWalkInOutcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      leadId: number;
      visitOutcome?: string | null;
      followUpAt?: string | null;
      notes?: string | null;
    }) => {
      const { error } = await (supabase as any).rpc("update_walk_in_outcome", {
        _lead_id: input.leadId,
        _visit_outcome: input.visitOutcome ?? null,
        _follow_up_at: input.followUpAt ?? null,
        _notes: input.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["walk-in-leads"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
