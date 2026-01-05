import { useState } from "react";
import { Enquiry, OrderOutcome, LostReason, LOST_REASONS } from "@/hooks/useEnquiries";
import { useAuth } from "@/hooks/useAuth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { MoreHorizontal, Trophy, XCircle, Clock, ChevronDown } from "lucide-react";

interface EnquiryTableProps {
  enquiries: Enquiry[];
  onUpdateOutcome: (
    enquiryId: string,
    outcome: OrderOutcome,
    lostReason?: LostReason,
    lostReasonNotes?: string
  ) => Promise<boolean>;
  onEnquiryClick: (enquiry: Enquiry) => void;
}

export function EnquiryTable({ enquiries, onUpdateOutcome, onEnquiryClick }: EnquiryTableProps) {
  const { role } = useAuth();
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [lostReason, setLostReason] = useState<LostReason | "">("");
  const [lostReasonNotes, setLostReasonNotes] = useState("");
  const [updating, setUpdating] = useState(false);

  const canUpdateOutcome = role === "sales" || role === "admin";

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      in_review: "outline",
      confirmed: "default",
      rejected: "destructive",
    };
    const labels: Record<string, string> = {
      pending: "Pending",
      in_review: "In Review",
      confirmed: "Confirmed",
      rejected: "Rejected",
    };
    return <Badge variant={variants[status] || "secondary"}>{labels[status] || status}</Badge>;
  };

  const getOutcomeBadge = (outcome: OrderOutcome) => {
    if (outcome === "won") {
      return (
        <Badge className="bg-green-600 hover:bg-green-700 text-white">
          <Trophy className="w-3 h-3 mr-1" />
          Won
        </Badge>
      );
    }
    if (outcome === "lost") {
      return (
        <Badge variant="destructive">
          <XCircle className="w-3 h-3 mr-1" />
          Lost
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <Clock className="w-3 h-3 mr-1" />
        Pending
      </Badge>
    );
  };

  const handleMarkWon = async (enquiry: Enquiry) => {
    setUpdating(true);
    await onUpdateOutcome(enquiry.id, "won");
    setUpdating(false);
  };

  const handleMarkLostClick = (enquiry: Enquiry) => {
    setSelectedEnquiry(enquiry);
    setLostReason("");
    setLostReasonNotes("");
    setLostDialogOpen(true);
  };

  const handleConfirmLost = async () => {
    if (!selectedEnquiry || !lostReason) return;
    
    setUpdating(true);
    const success = await onUpdateOutcome(
      selectedEnquiry.id,
      "lost",
      lostReason as LostReason,
      lostReasonNotes
    );
    setUpdating(false);
    
    if (success) {
      setLostDialogOpen(false);
      setSelectedEnquiry(null);
    }
  };

  const handleResetOutcome = async (enquiry: Enquiry) => {
    setUpdating(true);
    await onUpdateOutcome(enquiry.id, "pending");
    setUpdating(false);
  };

  const getLostReasonLabel = (reason: LostReason | null) => {
    if (!reason) return "-";
    return LOST_REASONS.find(r => r.value === reason)?.label || reason;
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Sales Person</TableHead>
              <TableHead className="text-center">Qty</TableHead>
              <TableHead>Enquiry Status</TableHead>
              <TableHead>Order Outcome</TableHead>
              <TableHead>Lost Reason</TableHead>
              {canUpdateOutcome && <TableHead className="w-[100px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {enquiries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canUpdateOutcome ? 9 : 8} className="text-center py-8 text-muted-foreground">
                  No enquiries found
                </TableCell>
              </TableRow>
            ) : (
              enquiries.map((enquiry) => (
                <TableRow key={enquiry.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell onClick={() => onEnquiryClick(enquiry)}>
                    {format(new Date(enquiry.created_at), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell onClick={() => onEnquiryClick(enquiry)}>
                    <div>
                      <p className="font-medium">{enquiry.product_name}</p>
                      <p className="text-xs text-muted-foreground">{enquiry.product_category}</p>
                    </div>
                  </TableCell>
                  <TableCell onClick={() => onEnquiryClick(enquiry)}>
                    <div>
                      <p className="font-medium">{enquiry.customer_name}</p>
                      <p className="text-xs text-muted-foreground">{enquiry.customer_company}</p>
                    </div>
                  </TableCell>
                  <TableCell onClick={() => onEnquiryClick(enquiry)}>
                    {enquiry.sales_person_name}
                  </TableCell>
                  <TableCell onClick={() => onEnquiryClick(enquiry)} className="text-center">
                    {enquiry.quantity}
                  </TableCell>
                  <TableCell onClick={() => onEnquiryClick(enquiry)}>
                    {getStatusBadge(enquiry.status)}
                  </TableCell>
                  <TableCell>
                    {getOutcomeBadge(enquiry.order_outcome || "pending")}
                  </TableCell>
                  <TableCell>
                    {enquiry.order_outcome === "lost" ? (
                      <span className="text-sm text-muted-foreground">
                        {getLostReasonLabel(enquiry.lost_reason)}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  {canUpdateOutcome && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={updating}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {enquiry.order_outcome !== "won" && (
                            <DropdownMenuItem onClick={() => handleMarkWon(enquiry)}>
                              <Trophy className="w-4 h-4 mr-2 text-green-600" />
                              Mark as Won
                            </DropdownMenuItem>
                          )}
                          {enquiry.order_outcome !== "lost" && (
                            <DropdownMenuItem onClick={() => handleMarkLostClick(enquiry)}>
                              <XCircle className="w-4 h-4 mr-2 text-destructive" />
                              Mark as Lost
                            </DropdownMenuItem>
                          )}
                          {enquiry.order_outcome !== "pending" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleResetOutcome(enquiry)}>
                                <Clock className="w-4 h-4 mr-2" />
                                Reset to Pending
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Lost Reason Dialog */}
      <Dialog open={lostDialogOpen} onOpenChange={setLostDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Order as Lost</DialogTitle>
            <DialogDescription>
              Please select a reason for losing this order. This helps with analytics and future improvements.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="lost_reason">Reason for Loss *</Label>
              <Select value={lostReason} onValueChange={(v) => setLostReason(v as LostReason)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {LOST_REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lost_notes">Additional Notes (Optional)</Label>
              <Textarea
                id="lost_notes"
                value={lostReasonNotes}
                onChange={(e) => setLostReasonNotes(e.target.value)}
                placeholder="Any additional details about why the order was lost..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLostDialogOpen(false)} disabled={updating}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmLost}
              disabled={!lostReason || updating}
            >
              {updating ? "Saving..." : "Confirm Lost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
