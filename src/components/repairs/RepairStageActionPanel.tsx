import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Repair,
  RepairStage,
  REPAIR_STAGES,
  getNextValidStages,
  getRepairStageLabel,
  isTerminalRepairStage,
  useRepairs,
} from "@/hooks/useRepairs";
import { useAuth } from "@/hooks/useAuth";
import { RepairStageBadge } from "./RepairStageBadge";
import { ArrowRight, Ban } from "lucide-react";

interface Props {
  repair: Repair;
}

/**
 * Compact stage controller for the RepairDialog. Renders the current stage,
 * the next valid forward stage(s) (excluding cancellation), and a dedicated
 * "Cancel repair" affordance that requires a reason.
 *
 * RPC-side (`update_repair_stage`) enforces:
 *   - allowed transitions
 *   - permission (admin / supply_chain)
 *   - audit history
 * So this UI just collects intent + reason text.
 */
export function RepairStageActionPanel({ repair }: Props) {
  const { role } = useAuth();
  const { updateRepairStage } = useRepairs();
  const allowed =
    role === "admin" || role === "supply_chain" || role === "it";

  // Show ALL stages (except the current one and `cancelled`, which has its own
  // dedicated action). Backend RPC still enforces permission + audit logging.
  const stageOptions = REPAIR_STAGES.filter(
    (s) => s.value !== repair.repair_stage && s.value !== "cancelled",
  );

  const [target, setTarget] = useState<RepairStage | "">("");
  const [notes, setNotes] = useState("");
  const [advancing, setAdvancing] = useState(false);

  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  if (isTerminalRepairStage(repair.repair_stage)) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Current stage
            </div>
            <div className="mt-1">
              <RepairStageBadge stage={repair.repair_stage} />
            </div>
            {repair.cancellation_reason && (
              <div className="text-sm text-muted-foreground mt-2">
                Reason: {repair.cancellation_reason}
              </div>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            This repair is closed.
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleAdvance = async () => {
    if (!target) return;
    setAdvancing(true);
    try {
      await updateRepairStage(repair.id, target as RepairStage, {
        notes: notes.trim() || undefined,
      });
      setNotes("");
    } catch {
      /* toast handled in hook */
    } finally {
      setAdvancing(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;
    setCancelling(true);
    try {
      await updateRepairStage(repair.id, "cancelled", {
        cancellationReason: cancelReason.trim(),
      });
      setConfirmCancelOpen(false);
      setCancelReason("");
    } catch {
      /* toast handled in hook */
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Current stage
            </div>
            <div className="mt-1">
              <RepairStageBadge stage={repair.repair_stage} />
            </div>
          </div>
          {!allowed && (
            <div className="text-xs text-muted-foreground">
              Only Admin / Supply Chain can change stages.
            </div>
          )}
        </div>

        {allowed && stageOptions.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs">Change stage</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select
                value={target || undefined}
                onValueChange={(v) => setTarget(v as RepairStage)}
              >
                <SelectTrigger className="sm:w-56">
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {stageOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAdvance}
                disabled={!target || advancing}
                className="sm:w-auto"
              >
                <ArrowRight className="h-4 w-4 mr-1" />
                {advancing ? "Updating…" : "Update stage"}
              </Button>
            </div>
            <Textarea
              placeholder="Optional note for the audit trail"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        )}

        {allowed && (
          <div className="pt-2 border-t flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              Cancellation is permanent and recorded in the audit trail.
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmCancelOpen(true)}
              className="text-destructive hover:text-destructive"
            >
              <Ban className="h-4 w-4 mr-1" />
              Cancel repair
            </Button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this repair?</AlertDialogTitle>
            <AlertDialogDescription>
              The repair will be moved to the <strong>Cancelled</strong> stage.
              This is permanent and logged. A reason is required.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel_reason" className="text-xs">
              Cancellation reason *
            </Label>
            <Textarea
              id="cancel_reason"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Customer chose not to repair after quote"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep open</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCancel();
              }}
              disabled={!cancelReason.trim() || cancelling}
              className="bg-destructive text-destructive-foreground"
            >
              {cancelling ? "Cancelling…" : "Confirm cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export const ALL_REPAIR_STAGE_FILTER_OPTIONS = REPAIR_STAGES;