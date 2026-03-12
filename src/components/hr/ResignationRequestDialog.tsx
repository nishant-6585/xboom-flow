import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, AlertTriangle } from "lucide-react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { proposed_lwd: string; reason: string; personal_email?: string }) => Promise<void>;
}

export function ResignationRequestDialog({ open, onOpenChange, onSubmit }: Props) {
  const [date, setDate] = useState<Date | undefined>();
  const [reason, setReason] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleSubmit = async () => {
    if (!date || !reason.trim()) return;
    setSubmitting(true);
    await onSubmit({
      proposed_lwd: format(date, "yyyy-MM-dd"),
      reason: reason.trim(),
      personal_email: personalEmail.trim() || undefined,
    });
    setSubmitting(false);
    setDate(undefined);
    setReason("");
    setPersonalEmail("");
    setConfirmed(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Submit Resignation
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm text-destructive font-medium">
              This action will notify HR about your resignation. You can withdraw it before HR approval.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Proposed Last Working Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : "Select your last working date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={(d) => d < addDays(new Date(), 1)}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Reason for Resignation *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please provide a reason..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Personal Email (optional)</Label>
            <Input
              type="email"
              value={personalEmail}
              onChange={(e) => setPersonalEmail(e.target.value)}
              placeholder="For post-exit communication"
            />
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1"
            />
            <span className="text-sm text-muted-foreground">
              I understand this will be sent to HR for review and my proposed last working date may be adjusted.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting || !date || !reason.trim() || !confirmed}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Submit Resignation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
