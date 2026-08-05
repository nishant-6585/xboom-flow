import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { recordAuditLog } from "@/lib/auditLog";

export interface MonthlyPulse {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  month: string;
  uploaded_by: string | null;
  created_at: string;
  is_active: boolean;
  version: number;
}

export function useMonthlyPulses() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["monthly_pulses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_pulses")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MonthlyPulse[];
    },
  });

  // Realtime refresh
  useEffect(() => {
    // Multiple consumers may mount useMonthlyPulses simultaneously. Keep each
    // subscription isolated so callbacks are always registered before subscribe.
    const ch = supabase
      .channel(`monthly-pulses-changes-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "monthly_pulses" }, () => {
        qc.invalidateQueries({ queryKey: ["monthly_pulses"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return query;
}

export function useLatestActivePulse() {
  const { data, ...rest } = useMonthlyPulses();
  const latest = (data ?? []).find((p) => p.is_active) ?? null;
  return { latest, ...rest };
}

export function useMyPulseReads() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["monthly_pulse_reads", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_pulse_reads")
        .select("pulse_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.pulse_id as string));
    },
  });
}

export function useMarkPulseSeen() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (pulseId: string) => {
      if (!user?.id) return;
      await supabase
        .from("monthly_pulse_reads")
        .insert({ pulse_id: pulseId, user_id: user.id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monthly_pulse_reads"] });
    },
  });
}

export async function getPulseSignedUrl(fileUrl: string, expiresIn = 3600): Promise<string | null> {
  // file_url stored as bucket path
  const { data, error } = await supabase.storage
    .from("monthly-pulses")
    .createSignedUrl(fileUrl, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export function useUploadPulse() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      file: File;
      title: string;
      description?: string;
      month: string; // e.g. "May 2026"
    }) => {
      const date = new Date();
      const year = date.getFullYear();
      const monthSlug = input.month.replace(/\s+/g, "-").toLowerCase();
      const ext = input.file.name.split(".").pop() || "pdf";
      const id = crypto.randomUUID();
      const path = `${year}/${monthSlug}/${id}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("monthly-pulses")
        .upload(path, input.file, { contentType: input.file.type, upsert: false });
      if (upErr) throw upErr;

      const { data, error } = await supabase
        .from("monthly_pulses")
        .insert({
          title: input.title,
          description: input.description ?? null,
          file_url: path,
          month: input.month,
          uploaded_by: user?.id ?? null,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;

      // Audit log (fire and forget)
      if (user?.id) {
        recordAuditLog(user.id, user.email ?? "unknown", {
          action: "MONTHLY_PULSE_UPLOADED",
          details: { pulse_id: data.id, title: input.title, month: input.month },
        });
      }

      return data as MonthlyPulse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monthly_pulses"] });
    },
  });
}

export function useTogglePulseActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("monthly_pulses")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthly_pulses"] }),
  });
}

export function useDeletePulse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pulse: MonthlyPulse) => {
      await supabase.storage.from("monthly-pulses").remove([pulse.file_url]).catch(() => {});
      const { error } = await supabase.from("monthly_pulses").delete().eq("id", pulse.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthly_pulses"] }),
  });
}