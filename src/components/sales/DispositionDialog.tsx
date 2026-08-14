import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  JUNK_REASONS,
  NOT_QUALIFIED_REASONS,
  QUALIFIED_REASONS,
  type LeadDisposition,
} from "@/lib/leadDispositions";

const MIN_CUSTOM_NOTE = 10;

export interface DispositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceTable: string;
  sourceRowId: string;
  contactName?: string;
  contactPhone?: string | null;
  target: "qualified" | "not_qualified" | "junk";
  onSuccess?: () => void;
}

function translateError(message: string | undefined): string {
  if (!message) return "Could not update disposition. Please try again.";
  if (message.includes("permission_denied"))
    return "You don't have permission to change a lead's disposition.";
  if (message.includes("reason_note_required_for_custom"))
    return "Please describe the reason (at least 10 characters).";
  if (message.includes("reason_required")) return "Please pick a reason.";
  if (message.includes("invalid_source_table"))
    return "Internal error: unknown lead source. Contact engineering.";
  return message;
}

export function DispositionDialog({
  open,
  onOpenChange,
  sourceTable,
  sourceRowId,
  contactName,
  contactPhone,
  target,
  onSuccess,
}: DispositionDialogProps) {
  const reasons =
    target === "qualified"
      ? QUALIFIED_REASONS
      : target === "junk"
      ? JUNK_REASONS.filter((r) => r.code !== "auto_no_enquiry")
      : NOT_QUALIFIED_REASONS;
  const [reasonCode, setReasonCode] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReasonCode("");
      setNote("");
      setSubmitting(false);
    } else {
      // Guard against a stuck focus/pointer lock left behind by a
      // dropdown that closed while this dialog was opening.
      document.body.style.pointerEvents = "";
    }
  }, [open]);

  useEffect(() => () => {
    document.body.style.pointerEvents = "";
  }, []);

  const isCustom = reasonCode === "custom";
  const noteTrimmed = note.trim();
  const canSubmit =
    !!reasonCode && (!isCustom || noteTrimmed.length >= MIN_CUSTOM_NOTE) && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const newDisposition: LeadDisposition = target;
    const { error } = await supabase.rpc("set_lead_disposition", {
      _source_table: sourceTable,
      _source_row_id: sourceRowId,
      _new_disposition: newDisposition,
      _reason_code: reasonCode,
      _reason_note: isCustom ? noteTrimmed : null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(translateError(error.message));
      return;
    }
    toast.success(
      target === "qualified"
        ? "Lead marked as Qualified"
        : target === "junk"
        ? "Lead marked as Junk"
        : "Lead marked as Not Qualified",
    );
    onOpenChange(false);
    onSuccess?.();
  };

  const titleText =
    target === "qualified"
      ? "Mark as Qualified"
      : target === "junk"
      ? "Mark as Junk"
      : "Mark as Not Qualified";
  const subtitle = [contactName, contactPhone].filter(Boolean).join(" · ");

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="disp-reason">Reason</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger id="disp-reason">
                <SelectValue placeholder="Pick a reason..." />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r.code} value={r.code}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isCustom && (
            <div className="space-y-2">
              <Label htmlFor="disp-note">Describe the reason</Label>
              <Textarea
                id="disp-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Describe the reason in your own words..."
                rows={4}
                maxLength={500}
              />
              <p
                className={`text-xs ${
                  noteTrimmed.length >= MIN_CUSTOM_NOTE
                    ? "text-muted-foreground"
                    : "text-destructive"
                }`}
              >
                {noteTrimmed.length} / {MIN_CUSTOM_NOTE} chars minimum
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            variant={target === "qualified" ? "default" : "destructive"}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}