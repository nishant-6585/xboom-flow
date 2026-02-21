import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Building2, Package, ArrowRight } from "lucide-react";
import { DuplicateMatch } from "@/hooks/useDuplicateDetection";

interface DuplicateAlertModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicates: DuplicateMatch[];
  onProceed: () => void;
  onCancel: () => void;
}

export function DuplicateAlertModal({
  open,
  onOpenChange,
  duplicates,
  onProceed,
  onCancel,
}: DuplicateAlertModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-warning">
            <AlertTriangle className="h-5 w-5" />
            Potential Duplicate Detected
          </DialogTitle>
          <DialogDescription>
            We found similar enquiries that may be duplicates. Review before proceeding.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-60 overflow-y-auto">
          {duplicates.map((dup, index) => (
            <div
              key={`${dup.enquiry_id}-${index}`}
              className="flex items-start gap-3 p-3 rounded-lg border bg-card"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{dup.customer_company}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Package className="h-3 w-3 shrink-0" />
                  <span className="truncate">{dup.product_name}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Customer: {dup.customer_name}
                </p>
              </div>
              <Badge
                variant={dup.similarity_score > 0.7 ? "destructive" : "secondary"}
                className="shrink-0"
              >
                {Math.round(dup.similarity_score * 100)}% match
              </Badge>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onProceed} className="gap-2">
            Proceed Anyway
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
