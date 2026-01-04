import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Enquiry, QueryStatus, EnquiryResponse } from "@/hooks/useEnquiries";
import { StatusBadge } from "./StatusBadge";
import { UrgencyIndicator } from "./UrgencyIndicator";
import { useAuth } from "@/hooks/useAuth";
import { Package, User, Building2, Hash, Boxes, DollarSign, Clock, CheckCircle, Trash2, Loader2 } from "lucide-react";

interface EnquiryDialogProps {
  enquiry: Enquiry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitResponse: (enquiryId: string, status: QueryStatus, response: EnquiryResponse) => Promise<boolean>;
  onDelete: (enquiryId: string) => Promise<boolean>;
}

export function EnquiryDialog({
  enquiry,
  open,
  onOpenChange,
  onSubmitResponse,
  onDelete,
}: EnquiryDialogProps) {
  const { role } = useAuth();
  const [status, setStatus] = useState<QueryStatus>("pending");
  const [response, setResponse] = useState({
    pricing: "",
    availability: "",
    leadTime: "",
  });
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Reset form when enquiry changes
  useEffect(() => {
    if (enquiry) {
      setStatus(enquiry.status);
      setResponse({
        pricing: enquiry.response_pricing || "",
        availability: enquiry.response_availability || "",
        leadTime: enquiry.response_lead_time || "",
      });
    }
  }, [enquiry]);

  if (!enquiry) return null;

  const canRespond = role === "supply_chain" || role === "admin";
  const canDelete = role === "admin";

  const handleSubmit = async () => {
    setLoading(true);
    const success = await onSubmitResponse(enquiry.id, status, response);
    setLoading(false);
    if (success) {
      onOpenChange(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    const success = await onDelete(enquiry.id);
    setLoading(false);
    setDeleteDialogOpen(false);
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl glass">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                Enquiry Details
              </span>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Query Details Summary */}
            <div className="p-4 rounded-lg bg-secondary/50 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{enquiry.product_name}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Hash className="w-3 h-3" />
                    {enquiry.product_code}
                  </div>
                </div>
                <StatusBadge status={enquiry.status} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Qty:</span>
                  <span className="font-medium">{enquiry.quantity}</span>
                </div>
                <div>
                  <UrgencyIndicator urgency={enquiry.urgency} />
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate">{enquiry.customer_name}</span>
                </div>
                {enquiry.customer_company && (
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span className="truncate">{enquiry.customer_company}</span>
                  </div>
                )}
              </div>

              {enquiry.notes && (
                <div className="pt-2 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">Notes:</span> {enquiry.notes}
                  </p>
                </div>
              )}

              <div className="pt-2 border-t border-border text-xs text-muted-foreground">
                Submitted by: {enquiry.sales_person_name}
              </div>
            </div>

            {/* Response Form - Only show for supply chain or admin */}
            {canRespond && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Supply Chain Response
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
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {canRespond ? "Cancel" : "Close"}
              </Button>
              {canRespond && (
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Submit Response
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Enquiry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this enquiry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
