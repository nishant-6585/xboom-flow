import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCheck, X } from "lucide-react";
import { toast } from "sonner";
import { LeaveApprovalCard } from "./LeaveApprovalCard";
import type { LeaveRequest } from "@/hooks/useHR";

interface BulkLeaveApprovalSectionProps {
  pendingLeaves: LeaveRequest[];
  onApprove: (leaveId: string, approve: boolean, comments?: string) => Promise<boolean>;
}

/**
 * Renders the pending Team Leave Requests with optional bulk-approve.
 * Selection is local state; each request is approved sequentially so RLS
 * failures surface per-row.
 */
export function BulkLeaveApprovalSection({ pendingLeaves, onApprove }: BulkLeaveApprovalSectionProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (id: string, isSelected: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (isSelected) next.add(id); else next.delete(id);
      return next;
    });
  };

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const clearSelection = () => setSelected(new Set());

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (const id of selectedIds) {
      const success = await onApprove(id, true);
      if (success) ok++; else fail++;
    }
    setBusy(false);
    if (ok > 0) toast.success(`Approved ${ok} leave request${ok === 1 ? "" : "s"}`);
    if (fail > 0) toast.error(`${fail} approval${fail === 1 ? "" : "s"} failed`);
    clearSelection();
  };

  return (
    <div className="space-y-3 pt-4 border-t">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Team Leave Requests</h3>
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
            <Button size="sm" onClick={handleBulkApprove} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              Approve {selectedIds.length} selected
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection} className="gap-1.5">
              <X className="h-4 w-4" />
              Clear
            </Button>
          </div>
        )}
      </div>
      {pendingLeaves.map((leave) => (
        <LeaveApprovalCard
          key={leave.id}
          leave={leave}
          onApprove={onApprove}
          selectable
          selected={selected.has(leave.id)}
          onSelectChange={toggle}
        />
      ))}
    </div>
  );
}