import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Newspaper } from "lucide-react";
import { useLatestActivePulse, useMyPulseReads, useMarkPulseSeen, getPulseSignedUrl } from "@/hooks/useMonthlyPulses";

export function MonthlyPulsePopup() {
  const { latest } = useLatestActivePulse();
  const { data: readSet, isLoading: readsLoading } = useMyPulseReads();
  const markSeen = useMarkPulseSeen();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown || readsLoading || !latest || !readSet) return;
    if (!readSet.has(latest.id)) {
      const t = setTimeout(() => {
        setOpen(true);
        setShown(true);
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [latest, readSet, readsLoading, shown]);

  const handleClose = () => {
    if (latest) markSeen.mutate(latest.id);
    setOpen(false);
  };

  const handleView = async () => {
    if (!latest) return;
    const url = await getPulseSignedUrl(latest.file_url);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    markSeen.mutate(latest.id);
    setOpen(false);
  };

  if (!latest) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-primary" />
            {latest.title}
          </DialogTitle>
          <DialogDescription>
            <Badge variant="outline" className="mt-1">{latest.month}</Badge>
          </DialogDescription>
        </DialogHeader>
        {latest.description && (
          <p className="text-sm text-muted-foreground">{latest.description}</p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>Close</Button>
          <Button onClick={handleView}>View Newsletter</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}