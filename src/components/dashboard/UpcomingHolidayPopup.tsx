import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PartyPopper } from "lucide-react";
import { useHolidays } from "@/hooks/useHolidays";
import { addDays, format, startOfDay } from "date-fns";

/**
 * Shows a one-time-per-day popup if there is a company holiday tomorrow.
 * Dismissal is tracked in localStorage keyed by holiday id.
 */
export function UpcomingHolidayPopup() {
  const today = startOfDay(new Date());
  const tomorrowStr = format(addDays(today, 1), "yyyy-MM-dd");
  const year = today.getFullYear();
  const tomorrowYear = addDays(today, 1).getFullYear();
  const { holidays: a } = useHolidays(year);
  const { holidays: b } = useHolidays(tomorrowYear);

  const holiday = [...a, ...b].find((h) => h.date === tomorrowStr);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!holiday) return;
    const key = `xboom:holidayPopupSeen:${holiday.id}`;
    if (typeof window !== "undefined" && !localStorage.getItem(key)) {
      const t = setTimeout(() => setOpen(true), 1500);
      return () => clearTimeout(t);
    }
  }, [holiday?.id]);

  const handleClose = () => {
    if (holiday && typeof window !== "undefined") {
      localStorage.setItem(`xboom:holidayPopupSeen:${holiday.id}`, "1");
    }
    setOpen(false);
  };

  if (!holiday) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-primary" />
            Holiday Tomorrow
          </DialogTitle>
          <DialogDescription className="pt-2">
            <span className="text-base font-semibold text-foreground">{holiday.name}</span>
            <Badge variant="outline" className="ml-2">
              {format(addDays(today, 1), "EEE, dd MMM yyyy")}
            </Badge>
          </DialogDescription>
        </DialogHeader>
        {holiday.description && (
          <p className="text-sm text-muted-foreground">{holiday.description}</p>
        )}
        <p className="text-sm text-muted-foreground">
          The office will be closed tomorrow. Please plan your work accordingly.
        </p>
        <DialogFooter>
          <Button onClick={handleClose}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}