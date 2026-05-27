import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  UNAVAILABILITY_REASONS,
  UnavailabilityReason,
  WEBSITE_LEAD_POOL,
  useCreateUnavailability,
} from "@/hooks/useTeamAvailability";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a salesperson (used when the user clicks a pool card). */
  defaultUserId?: string | null;
}

const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export function MarkUnavailableDialog({ open, onOpenChange, defaultUserId }: Props) {
  const create = useCreateUnavailability();

  const [userId, setUserId] = useState<string>(defaultUserId ?? "");
  const [reason, setReason] = useState<UnavailabilityReason>("vacation");
  const [startsAt, setStartsAt] = useState<Date | undefined>(undefined);
  const [endsAt, setEndsAt] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState("");

  // Reset when re-opened
  if (open && defaultUserId && !userId) setUserId(defaultUserId);

  const reset = () => {
    setUserId(defaultUserId ?? "");
    setReason("vacation");
    setStartsAt(undefined);
    setEndsAt(undefined);
    setNotes("");
  };

  const isValid =
    !!userId &&
    !!startsAt &&
    !!endsAt &&
    endsAt >= startsAt &&
    startsAt >= todayStart();

  const handleSubmit = async () => {
    if (!isValid || !startsAt || !endsAt) return;
    await create.mutateAsync({
      user_id: userId,
      starts_at: format(startsAt, "yyyy-MM-dd"),
      ends_at: format(endsAt, "yyyy-MM-dd"),
      reason,
      notes,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark salesperson unavailable</DialogTitle>
          <DialogDescription>
            New website leads will skip this person for the selected date range.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Salesperson</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select salesperson" />
              </SelectTrigger>
              <SelectContent>
                {WEBSITE_LEAD_POOL.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.name}
                    <span className="text-xs text-muted-foreground ml-2">({m.role})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as UnavailabilityReason)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNAVAILABILITY_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startsAt && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startsAt ? format(startsAt, "dd MMM yyyy") : "Pick start"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startsAt}
                    onSelect={(d) => {
                      setStartsAt(d);
                      if (d && endsAt && endsAt < d) setEndsAt(d);
                    }}
                    disabled={(d) => d < todayStart()}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endsAt && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endsAt ? format(endsAt, "dd MMM yyyy") : "Pick end"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endsAt}
                    onSelect={setEndsAt}
                    disabled={(d) => d < (startsAt ?? todayStart())}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Approved leave, returning Monday"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || create.isPending}>
            {create.isPending ? "Saving…" : "Mark unavailable"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}