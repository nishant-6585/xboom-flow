import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useSalesUsers } from "@/hooks/useSalesUsers";

/** Source tables supported by the set_lead_assignee RPC. */
const ASSIGNABLE_TABLES = new Set([
  "leads", "form_leads", "google_ads_leads", "email_leads", "call_logs", "interakt_leads",
]);

interface Props {
  sourceTable: string;
  sourceRowId: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
  onChanged?: () => void;
  className?: string;
}

/**
 * Inline "Assigned" cell. Admins and sales managers get a searchable-free
 * dropdown of every approved sales user (via the SECURITY DEFINER RPC, so it
 * works regardless of profiles/user_roles RLS). Everyone else sees plain text.
 */
export function LeadAssigneeSelect({
  sourceTable, sourceRowId, assigneeId, assigneeName, onChanged, className,
}: Props) {
  const { role } = useAuth();
  const canAssign = role === "admin" || role === "sales_manager";
  const { salesUsers, isLoading } = useSalesUsers();
  const [busy, setBusy] = useState(false);

  if (!canAssign || !ASSIGNABLE_TABLES.has(sourceTable)) {
    return <span className="text-xs">{assigneeName || "—"}</span>;
  }

  const handleChange = async (val: string) => {
    setBusy(true);
    const { error } = await supabase.rpc("set_lead_assignee" as any, {
      _source_table: sourceTable,
      _source_row_id: sourceRowId,
      _user_id: val === "unassigned" ? null : val,
    });
    setBusy(false);
    if (error) {
      toast.error(`Could not assign: ${error.message}`);
      return;
    }
    toast.success(val === "unassigned" ? "Lead unassigned" : "Lead assigned");
    onChanged?.();
  };

  return (
    <Select value={assigneeId || "unassigned"} onValueChange={handleChange} disabled={busy}>
      <SelectTrigger className={className ?? "h-7 w-[150px] text-xs"}>
        <SelectValue placeholder="Assign…" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="unassigned">Unassigned</SelectItem>
        {isLoading && <SelectItem value="__loading" disabled>Loading…</SelectItem>}
        {salesUsers.map((u) => (
          <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
