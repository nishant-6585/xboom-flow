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
import { MoreHorizontal, Trophy, XCircle, Clock, GitBranch, ExternalLink, ShoppingCart, Timer, CheckCircle2, AlertTriangle } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { useNavigate } from "react-router-dom";
import { getSlaStatus, SLA_HOURS, UrgencyLevel } from "@/lib/sla";

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

  const getSlaComplianceDisplay = (enquiry: Enquiry) => {
    const urgency = enquiry.urgency as UrgencyLevel;
    const createdAt = new Date(enquiry.created_at);
    const respondedAt = enquiry.responded_at ? new Date(enquiry.responded_at) : null;
    const isResponded = enquiry.status !== "pending";
    
    const slaStatus = getSlaStatus(createdAt, respondedAt, urgency, isResponded);
    const slaTarget = SLA_HOURS[urgency];
    
    const config: Record<string, { icon: typeof CheckCircle2; label: string; colorClass: string; bgClass: string }> = {
      met: {
        icon: CheckCircle2,
        label: "SLA Met",
        colorClass: "text-success",
        bgClass: "bg-success/10"
      },
      delayed: {
        icon: XCircle,
        label: "SLA Breached",
        colorClass: "text-destructive",
        bgClass: "bg-destructive/10"
      },
      on_track: {
        icon: Clock,
        label: "On Track",
        colorClass: "text-success",
        bgClass: "bg-success/10"
      },
      at_risk: {
        icon: AlertTriangle,
        label: "At Risk",
        colorClass: "text-warning",
        bgClass: "bg-warning/10"
      },
      breached: {
        icon: XCircle,
        label: "Breached",
        colorClass: "text-destructive",
        bgClass: "bg-destructive/10"
      }
    };
    
    return {
      ...config[slaStatus],
      slaTarget: `${slaTarget}h`,
      urgency: urgency.charAt(0).toUpperCase() + urgency.slice(1)
    };
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
              <TableHead>SLA Status</TableHead>
              {canUpdateStatus && <TableHead className="w-[100px]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {enquiries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canUpdateStatus ? 9 : 8} className="text-center py-8 text-muted-foreground">
                  No enquiries found
                </TableCell>
              </TableRow>
            ) : (
              enquiries.map((enquiry) => {
                const related = relatedRecords[enquiry.id] || { hasOrder: false, hasPipeline: false };
                const responseTime = getResponseTimeDisplay(enquiry);
                const slaCompliance = getSlaComplianceDisplay(enquiry);
                const SlaIcon = slaCompliance.icon;
                
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
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${slaCompliance.colorClass} ${slaCompliance.bgClass}`}>
                              <SlaIcon className="w-3 h-3" />
                              <span>{slaCompliance.label}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Urgency: {slaCompliance.urgency} (Target: {slaCompliance.slaTarget})</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
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