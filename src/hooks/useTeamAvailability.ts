import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export type UnavailabilityReason =
  | "vacation"
  | "sick_leave"
  | "training"
  | "official_travel"
  | "personal"
  | "other";

export const UNAVAILABILITY_REASONS: { value: UnavailabilityReason; label: string }[] = [
  { value: "vacation",        label: "Vacation" },
  { value: "sick_leave",      label: "Sick Leave" },
  { value: "training",        label: "Training" },
  { value: "official_travel", label: "Official Travel" },
  { value: "personal",        label: "Personal" },
  { value: "other",           label: "Other" },
];

export interface UnavailabilityWindow {
  id: string;
  user_id: string;
  starts_at: string; // YYYY-MM-DD
  ends_at: string;
  reason: UnavailabilityReason;
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Round-robin pool members + Rohit (drone-repair-intake). Mirrors `allowed_website_lead_assignees()`. */
export const WEBSITE_LEAD_POOL = [
  { user_id: "a790b58d-8e3d-4333-b6d6-08be631c865d", name: "Narasimha",         role: "Sales" as const },
  { user_id: "457fc2d5-9fc5-439a-938e-5b998549b811", name: "Mohammed Musthak",  role: "Sales" as const },
  { user_id: "456e91f8-34cc-4f92-a1c1-a092f2bbed39", name: "Suman Das",         role: "Sales" as const },
  { user_id: "74930912-193a-4081-a87f-46902ee96c4d", name: "Srishti Suman",     role: "Sales" as const },
  { user_id: "7bc60110-5d57-4ae1-bc9f-bf4dd3787a90", name: "Manoj Kumar",       role: "Sales" as const },
  { user_id: "9fea57d6-a27a-4b35-9293-e2151b84f45a", name: "Rohit",             role: "Drone Repair Intake" as const },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

function isCovering(w: UnavailabilityWindow, dateISO: string): boolean {
  return !w.cancelled_at && w.starts_at <= dateISO && w.ends_at >= dateISO;
}

export interface PoolStatusRow {
  user_id: string;
  name: string;
  role: "Sales" | "Drone Repair Intake";
  status: "available" | "unavailable";
  currentWindow?: UnavailabilityWindow;
}

export function useTeamAvailability() {
  const q = useQuery({
    queryKey: ["team-availability"],
    queryFn: async (): Promise<UnavailabilityWindow[]> => {
      const { data, error } = await supabase
        .from("sales_unavailability" as never)
        .select("*")
        .is("cancelled_at", null)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as UnavailabilityWindow[];
    },
    staleTime: 60_000,
  });

  // Also treat approved leaves overlapping today as unavailability so
  // pool members auto-show as "Unavailable" while on HR-approved leave.
  const leaveQ = useQuery({
    queryKey: ["team-availability-leaves"],
    queryFn: async (): Promise<UnavailabilityWindow[]> => {
      const poolIds = WEBSITE_LEAD_POOL.map((m) => m.user_id);
      const { data: emps, error: eErr } = await supabase
        .from("employees")
        .select("id, user_id")
        .in("user_id", poolIds);
      if (eErr) throw eErr;
      const empToUser = new Map<string, string>();
      (emps || []).forEach((e: any) => e.user_id && empToUser.set(e.id, e.user_id));
      const empIds = Array.from(empToUser.keys());
      if (empIds.length === 0) return [];
      const today = todayISO();
      const { data: leaves, error: lErr } = await supabase
        .from("leave_requests")
        .select("id, employee_id, leave_type, start_date, end_date, reason")
        .eq("status", "approved")
        .lte("start_date", today)
        .gte("end_date", today)
        .in("employee_id", empIds);
      if (lErr) throw lErr;
      return (leaves || []).map((l: any): UnavailabilityWindow => ({
        id: `leave:${l.id}`,
        user_id: empToUser.get(l.employee_id)!,
        starts_at: l.start_date,
        ends_at: l.end_date,
        reason: (l.leave_type?.toLowerCase() === "sick" ? "sick_leave" : "vacation") as UnavailabilityReason,
        notes: l.reason || `On ${l.leave_type} leave`,
        created_by: null,
        created_by_name: "HR (approved leave)",
        cancelled_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    },
    staleTime: 60_000,
  });

  const windows = [...(q.data ?? []), ...(leaveQ.data ?? [])];
  const today = todayISO();

  const currentlyUnavailable = new Set<string>();
  for (const w of windows) {
    if (isCovering(w, today)) currentlyUnavailable.add(w.user_id);
  }

  const poolStatus: PoolStatusRow[] = WEBSITE_LEAD_POOL.map((m) => {
    const cur = windows.find((w) => w.user_id === m.user_id && isCovering(w, today));
    return {
      user_id: m.user_id,
      name: m.name,
      role: m.role,
      status: cur ? "unavailable" : "available",
      currentWindow: cur,
    };
  });

  return {
    windows,
    currentlyUnavailable,
    poolStatus,
    isLoading: q.isLoading || leaveQ.isLoading,
    isError: q.isError || leaveQ.isError,
    error: (q.error || leaveQ.error) as Error | null,
    refetch: async () => {
      await Promise.all([q.refetch(), leaveQ.refetch()]);
    },
  };
}

export interface CreateUnavailabilityInput {
  user_id: string;
  starts_at: string;
  ends_at: string;
  reason: UnavailabilityReason;
  notes?: string;
}

export function useCreateUnavailability() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateUnavailabilityInput) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("sales_unavailability" as never)
        .insert({
          user_id: input.user_id,
          starts_at: input.starts_at,
          ends_at: input.ends_at,
          reason: input.reason,
          notes: input.notes?.trim() || null,
          created_by: user.id,
          created_by_name: profile?.name || user.email || null,
        } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-availability"] });
      toast({ title: "Unavailability recorded" });
    },
    onError: (e: Error) => {
      toast({
        title: "Couldn't save",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}

export function useCancelUnavailability() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from("sales_unavailability" as never)
        .update({ cancelled_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-availability"] });
      toast({ title: "Window cancelled — user is available again" });
    },
    onError: (e: Error) => {
      toast({
        title: "Couldn't cancel",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}

/** Days remaining until window ends (inclusive). Returns 0 if ends today. */
export function daysRemaining(window: UnavailabilityWindow): number {
  const end = new Date(window.ends_at + "T23:59:59");
  const now = new Date();
  const ms = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}