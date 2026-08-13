import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Copy, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";

const PATH = "/public/lead-capture";

/**
 * Shows the shareable public capture-form link used for referral / walk-in leads.
 * Submissions land in Form Leads with the chosen source and salesperson.
 */
export function CaptureFormLinkButton() {
  const [open, setOpen] = useState(false);
  const url = `${window.location.origin}${PATH}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Capture form link copied");
    } catch {
      toast.error("Could not copy — select and copy manually");
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Link2 className="mr-2 h-4 w-4" /> Referral / Walk-in form
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Referral / Walk-in capture form</DialogTitle>
            <DialogDescription>
              Share this link to capture referral, walk-in and offline leads. The submitter picks the
              lead source and salesperson (or auto round-robin); leads appear here in Form Leads.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="secondary" size="icon" onClick={copy} aria-label="Copy link">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="icon" asChild aria-label="Open form">
              <a href={PATH} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
