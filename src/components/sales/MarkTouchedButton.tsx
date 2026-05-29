import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

interface Props {
  sourceType: string;
  sourceId: string | number;
  className?: string;
}

/**
 * Lets a salesperson explicitly mark a lead row as "touched" even if the
 * source-table row itself hasn't been updated (no followup, no note, no
 * status change). Writes to `lead_touch_marks` keyed by (source_type,
 * source_id, user_id) so multiple users can each register their own touch.
 */
export default function MarkTouchedButton({ sourceType, sourceId, className }: Props) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const sid = String(sourceId);

  const { data: existing } = useQuery({
    queryKey: ["lead-touch-mark", sourceType, sid, user?.id ?? ""],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("lead_touch_marks")
        .select("id")
        .eq("source_type", sourceType)
        .eq("source_id", sid)
        .eq("marked_by", user!.id)
        .maybeSingle();
      return data ?? null;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["engaged-lead-ids"] });
    qc.invalidateQueries({ queryKey: ["touched-stats"] });
    qc.invalidateQueries({ queryKey: ["lead-touch-mark", sourceType, sid] });
  };

  const mark = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await (supabase as any)
        .from("lead_touch_marks")
        .insert({
          source_type: sourceType,
          source_id: sid,
          marked_by: user.id,
          marked_by_name: profile?.name ?? null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Marked as touched");
    },
    onError: (e: any) => toast.error(e.message || "Could not mark as touched"),
  });

  const unmark = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await (supabase as any)
        .from("lead_touch_marks")
        .delete()
        .eq("source_type", sourceType)
        .eq("source_id", sid)
        .eq("marked_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Unmarked");
    },
    onError: (e: any) => toast.error(e.message || "Could not unmark"),
  });

  const isMarked = !!existing;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      if (isMarked) await unmark.mutateAsync();
      else await mark.mutateAsync();
    } finally {
      setBusy(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={busy || !user}
            onClick={handleClick}
            className={className}
            aria-label={isMarked ? "Unmark touched" : "Mark as touched"}
          >
            <CheckCircle2
              className={
                isMarked
                  ? "h-4 w-4 text-green-600 fill-green-100"
                  : "h-4 w-4 text-muted-foreground"
              }
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isMarked ? "Marked as touched (click to remove)" : "Mark as touched"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}