import { useState, useEffect } from "react";
import { Enquiry, QueryStatus, LostReason, LOST_REASONS } from "@/hooks/useEnquiries";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";
import { MoreHorizontal, Trophy, XCircle, Clock, GitBranch, ExternalLink, ShoppingCart, Timer } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { useNavigate } from "react-router-dom";

interface EnquiryTableProps {
  enquiries: Enquiry[];
  onUpdateStatus: (
    enquiryId: string,
    status: QueryStatus,
    lostReason?: LostReason,
    lostReasonNotes?: string
  ) => Promise<boolean>;
  onEnquiryClick: (enquiry: Enquiry) => void;
}

interface RelatedRecords {
  [enquiryId: string]: {
    hasOrder: boolean;
    hasPipeline: boolean;
  };
}

export function EnquiryTable({ enquiries, onUpdateStatus, onEnquiryClick }: EnquiryTableProps) {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [lostReason, setLostReason] = useState<LostReason | "">("");
  const [lostReasonNotes, setLostReasonNotes] = useState("");
  const [updating, setUpdating] = useState(false);
  const [relatedRecords, setRelatedRecords] = useState<RelatedRecords>({});

  const canUpdateStatus = role === "sales" || role === "admin";

  // Fetch related orders and pipeline entries for all enquiries
  useEffect(() => {
    const fetchRelatedRecords = async () => {
      const enquiryIds = enquiries.map(e => e.id);
      if (enquiryIds.length === 0) return;

      // Fetch orders linked to these enquiries
      const { data: orders } = await supabase
        .from("orders")
        .select("enquiry_id")
        .in("enquiry_id", enquiryIds);

      // Fetch pipeline orders linked to these enquiries
      const { data: pipelineOrders } = await supabase
        .from("pipeline_orders")
        .select("enquiry_id")
        .in("enquiry_id", enquiryIds);

      const records: RelatedRecords = {};
      enquiryIds.forEach(id => {
        records[id] = {
          hasOrder: orders?.some(o => o.enquiry_id === id) || false,
          hasPipeline: pipelineOrders?.some(p => p.enquiry_id === id) || false,
        };
      });
      setRelatedRecords(records);
    };

    fetchRelatedRecords();
  }, [enquiries]);

  const handleStatusChange = async (enquiry: Enquiry, newStatus: QueryStatus) => {
    if (newStatus === "order_lost") {
      setSelectedEnquiry(enquiry);
      setLostReason("");
      setLostReasonNotes("");
      setLostDialogOpen(true);
      return;
    }
    
    setUpdating(true);
    await onUpdateStatus(enquiry.id, newStatus);
    setUpdating(false);
  };

  const handleConfirmLost = async () => {
    if (!selectedEnquiry || !lostReason) return;
    
    setUpdating(true);
    const success = await onUpdateStatus(
      selectedEnquiry.id,
      "order_lost",
      lostReason as LostReason,
      lostReasonNotes
    );
    setUpdating(false);
    
    if (success) {
      setLostDialogOpen(false);
      setSelectedEnquiry(null);
    }
  };

  const getLostReasonLabel = (reason: LostReason | null) => {
    if (!reason) return "-";
    return LOST_REASONS.find(r => r.value === reason)?.label || reason;
  };

  const getResponseTimeDisplay = (enquiry: Enquiry) => {
    if (!enquiry.responded_at) {
      return { text: "Pending", colorClass: "text-muted-foreground" };
    }
    
    const createdAt = new Date(enquiry.created_at);
    const respondedAt = new Date(enquiry.responded_at);
    const totalMinutes = differenceInMinutes(respondedAt, createdAt);
    const totalHours = differenceInHours(respondedAt, createdAt);
    const totalDays = differenceInDays(respondedAt, createdAt);
    
    let text = "";
    let colorClass = "";
    
    if (totalMinutes < 60) {
      text = `${totalMinutes}m`;
      colorClass = "text-success";
    } else if (totalHours < 24) {
      const mins = totalMinutes % 60;
      text = mins > 0 ? `${totalHours}h ${mins}m` : `${totalHours}h`;
      colorClass = totalHours <= 6 ? "text-success" : 
                   totalHours <= 12 ? "text-warning" : 
                   "text-destructive";
    } else {
      const remainingHours = totalHours % 24;
      text = remainingHours > 0 ? `${totalDays}d ${remainingHours}h` : `${totalDays}d`;
      colorClass = "text-destructive";
    }
    
    return { text, colorClass };
  };

  const navigateToOrder = (enquiryId: string) => {
    navigate(`/orders?enquiry_id=${enquiryId}`);
  };

  const navigateToPipeline = (enquiryId: string) => {
    navigate(`/orders?tab=pipeline&enquiry_id=${enquiryId}`);
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
              <TableHead>Status</TableHead>
              <TableHead>Response Time</TableHead>
              <TableHead>Links</TableHead>
              <TableHead>Lost Reason</TableHead>
              {canUpdateStatus && <TableHead className="w-[100px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {enquiries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canUpdateStatus ? 10 : 9} className="text-center py-8 text-muted-foreground">
                  No enquiries found
                </TableCell>
              </TableRow>
            ) : (
              enquiries.map((enquiry) => {
                const related = relatedRecords[enquiry.id] || { hasOrder: false, hasPipeline: false };
                const responseTime = getResponseTimeDisplay(enquiry);
                
                return (
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
                    <TableCell>
                      <StatusBadge status={enquiry.status} />
                    </TableCell>
                    <TableCell>
                      <div className={`flex items-center gap-1 text-sm font-medium ${responseTime.colorClass}`}>
                        <Timer className="w-3.5 h-3.5" />
                        <span>{responseTime.text}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <TooltipProvider>
                          {related.hasOrder && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigateToOrder(enquiry.id);
                                  }}
                                >
                                  <ShoppingCart className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View linked Order</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {related.hasPipeline && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-purple-600 hover:text-purple-700 hover:bg-purple-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigateToPipeline(enquiry.id);
                                  }}
                                >
                                  <GitBranch className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View linked Pipeline entry</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {!related.hasOrder && !related.hasPipeline && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TooltipProvider>
                      </div>
                    </TableCell>
                    <TableCell>
                      {enquiry.status === "order_lost" ? (
                        <span className="text-sm text-muted-foreground">
                          {getLostReasonLabel(enquiry.lost_reason)}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    {canUpdateStatus && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={updating}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {enquiry.status !== "order_won" && (
                              <DropdownMenuItem onClick={() => handleStatusChange(enquiry, "order_won")}>
                                <Trophy className="w-4 h-4 mr-2 text-green-600" />
                                Mark as Won
                              </DropdownMenuItem>
                            )}
                            {enquiry.status !== "order_lost" && (
                              <DropdownMenuItem onClick={() => handleStatusChange(enquiry, "order_lost")}>
                                <XCircle className="w-4 h-4 mr-2 text-destructive" />
                                Mark as Lost
                              </DropdownMenuItem>
                            )}
                            {enquiry.status !== "moved_to_pipeline" && (
                              <DropdownMenuItem onClick={() => handleStatusChange(enquiry, "moved_to_pipeline")}>
                                <GitBranch className="w-4 h-4 mr-2 text-purple-600" />
                                Move to Pipeline
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {enquiry.status !== "pending" && (
                              <DropdownMenuItem onClick={() => handleStatusChange(enquiry, "pending")}>
                                <Clock className="w-4 h-4 mr-2" />
                                Reset to Pending
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Lost Reason Dialog */}
      <Dialog open={lostDialogOpen} onOpenChange={setLostDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Lost</DialogTitle>
            <DialogDescription>
              Please select a reason for losing this enquiry.
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
                placeholder="Any additional details..."
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