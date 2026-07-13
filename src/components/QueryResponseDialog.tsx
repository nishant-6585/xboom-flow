import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductQuery, QueryStatus } from "@/types/query";
import { StatusBadge } from "./StatusBadge";
import { UrgencyIndicator } from "./UrgencyIndicator";
import { useToast } from "@/hooks/use-toast";
import { Package, User, Building2, Hash, Boxes, DollarSign, Clock, CheckCircle } from "lucide-react";
import { EnquiryMessageThread } from "./enquiry/EnquiryMessageThread";

interface QueryResponseDialogProps {
  query: ProductQuery | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitResponse: (queryId: string, status: QueryStatus, response: ProductQuery["response"]) => void;
}

export function QueryResponseDialog({
  query,
  open,
  onOpenChange,
  onSubmitResponse,
}: QueryResponseDialogProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<QueryStatus>(query?.status || "pending");
  const [response, setResponse] = useState({
    pricing: query?.response?.pricing || "",
    availability: query?.response?.availability || "",
    leadTime: query?.response?.leadTime || "",
    notes: query?.response?.notes || "",
  });

  // Reset form when query changes
  useState(() => {
    if (query) {
      setStatus(query.status);
      setResponse({
        pricing: query.response?.pricing || "",
        availability: query.response?.availability || "",
        leadTime: query.response?.leadTime || "",
        notes: query.response?.notes || "",
      });
    }
  });

  if (!query) return null;

  const handleSubmit = () => {
    onSubmitResponse(query.id, status, response);
    toast({
      title: "Response Submitted",
      description: "The query has been updated successfully.",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl glass">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Query Response
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Query Details Summary */}
          <div className="p-4 rounded-lg bg-secondary/50 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-lg">{query.productName}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Hash className="w-3 h-3" />
                  {query.productCode}
                </div>
              </div>
              <StatusBadge status={query.status} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Qty:</span>
                <span className="font-medium">{query.quantity}</span>
              </div>
              <div>
                <UrgencyIndicator urgency={query.urgency} />
              </div>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="truncate">{query.customerName}</span>
              </div>
              {query.customerCompany && (
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate">{query.customerCompany}</span>
                </div>
              )}
            </div>

            {query.notes && (
              <div className="pt-2 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">Notes:</span> {query.notes}
                </p>
              </div>
            )}
          </div>

          {/* Response Form */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Quote Details
            </h4>

            <div className="space-y-2">
              <Label htmlFor="status">Update Status</Label>
              <Select value={status} onValueChange={(v: QueryStatus) => setStatus(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pricing" className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  Pricing
                </Label>
                <Input
                  id="pricing"
                  placeholder="e.g., $45.50/unit"
                  value={response.pricing}
                  onChange={(e) => setResponse({ ...response, pricing: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="availability" className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-muted-foreground" />
                  Availability
                </Label>
                <Input
                  id="availability"
                  placeholder="e.g., In Stock"
                  value={response.availability}
                  onChange={(e) => setResponse({ ...response, availability: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leadTime" className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Lead Time
                </Label>
                <Input
                  id="leadTime"
                  placeholder="e.g., 5-7 days"
                  value={response.leadTime}
                  onChange={(e) => setResponse({ ...response, leadTime: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="responseNotes">Additional Notes</Label>
              <Textarea
                id="responseNotes"
                placeholder="Any additional information for the sales team..."
                rows={3}
                value={response.notes}
                onChange={(e) => setResponse({ ...response, notes: e.target.value })}
              />
            </div>
          </div>

          {/* Discussion Thread anchored above footer */}
          <EnquiryMessageThread enquiryId={query.id} />

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              Submit Response
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
