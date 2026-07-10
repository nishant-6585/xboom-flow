import { useState, useEffect } from "react";
import { Enquiry, QueryStatus, LostReason, LOST_REASONS, LeadTemperature } from "@/hooks/useEnquiries";
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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
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
import { MoreHorizontal, Trophy, XCircle, Clock, GitBranch, Timer, CheckCircle2, AlertTriangle, Flame, Thermometer, Snowflake, Star, Sparkles } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { LeadTemperatureBadge, LEAD_TEMPERATURES } from "./LeadTemperatureBadge";
import { LeadSourceBadge } from "./LeadSourceBadge";
import { StickyNote } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { FollowupDrafterDialog } from "./sales/FollowupDrafterDialog";
import { useNavigate } from "react-router-dom";
import { getSlaStatus, SLA_HOURS, UrgencyLevel } from "@/lib/sla";
import { toast } from "sonner";

interface EnquiryTableProps {
  enquiries: Enquiry[];
  onUpdateStatus: (
    enquiryId: string,
    status: QueryStatus,
    lostReason?: LostReason,
    lostReasonNotes?: string
  ) => Promise<boolean>;
  onEnquiryClick: (enquiry: Enquiry) => void;
  onUpdateTemperature?: (enquiryId: string, temperature: LeadTemperature) => Promise<boolean>;
  onToggleMegaDeal?: (enquiryId: string, isMegaDeal: boolean) => Promise<boolean>;
}

interface RelatedRecords {
  [enquiryId: string]: {
    hasOrder: boolean;
    hasPipeline: boolean;
  };
}

export function EnquiryTable({ 
  enquiries, 
  onUpdateStatus, 
  onEnquiryClick,
  onUpdateTemperature,
  onToggleMegaDeal
}: EnquiryTableProps) {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [lostReason, setLostReason] = useState<LostReason | "">("");
  const [lostReasonNotes, setLostReasonNotes] = useState("");
  const [updating, setUpdating] = useState(false);
  const [relatedRecords, setRelatedRecords] = useState<RelatedRecords>({});
  const [followupEnquiry, setFollowupEnquiry] = useState<Enquiry | null>(null);

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
              <TableHead>Lead</TableHead>
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
                <TableCell colSpan={canUpdateStatus ? 10 : 9} className="text-center py-8 text-muted-foreground">
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
                    <TableCell>
                      <LeadTemperatureBadge 
                        temperature={enquiry.lead_temperature || "warm"} 
                        isMegaDeal={enquiry.is_mega_deal || false}
                        size="sm"
                      />
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
                        {enquiry.followup_note && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground max-w-[240px]">
                                  <StickyNote className="w-3 h-3 shrink-0 text-primary/70" />
                                  <span className="truncate">{enquiry.followup_note}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-sm">{enquiry.followup_note}</p>
                                {enquiry.followup_note_updated_at && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    updated {formatDistanceToNow(new Date(enquiry.followup_note_updated_at), { addSuffix: true })}
                                    {enquiry.followup_note_updated_by_name ? ` by ${enquiry.followup_note_updated_by_name}` : ""}
                                  </p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
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
                      {enquiry.lead_source && (
                        <div className="mt-1">
                          <LeadSourceBadge source={enquiry.lead_source} size="xs" fallback="hide" />
                        </div>
                      )}
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
                            {/* Mark as Hot - Quick action */}
                            {enquiry.lead_temperature !== "hot" && onUpdateTemperature && (
                              <DropdownMenuItem 
                                onClick={() => {
                                  onUpdateTemperature(enquiry.id, "hot");
                                  toast.success("Marked as Hot lead 🔥");
                                }}
                              >
                                <Flame className="w-4 h-4 mr-2 text-orange-500" />
                                Mark as Hot 🔥
                              </DropdownMenuItem>
                            )}
                            
                            {/* Temperature submenu */}
                            {onUpdateTemperature && (
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <Thermometer className="w-4 h-4 mr-2" />
                                  Set Temperature
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  {LEAD_TEMPERATURES.map((temp) => (
                                    <DropdownMenuItem
                                      key={temp.value}
                                      onClick={() => {
                                        onUpdateTemperature(enquiry.id, temp.value);
                                        toast.success(`Lead marked as ${temp.label}`);
                                      }}
                                      disabled={enquiry.lead_temperature === temp.value}
                                    >
                                      {temp.value === "hot" && <Flame className="w-4 h-4 mr-2 text-orange-500" />}
                                      {temp.value === "warm" && <Thermometer className="w-4 h-4 mr-2 text-yellow-500" />}
                                      {temp.value === "cold" && <Snowflake className="w-4 h-4 mr-2 text-blue-500" />}
                                      {temp.label}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            )}

                            {/* Toggle Mega Deal */}
                            {onToggleMegaDeal && (
                              <DropdownMenuItem
                                onClick={() => {
                                  onToggleMegaDeal(enquiry.id, !enquiry.is_mega_deal);
                                  toast.success(enquiry.is_mega_deal ? "Removed Mega Deal tag" : "Marked as Mega Deal ⭐");
                                }}
                              >
                                <Star className={`w-4 h-4 mr-2 ${enquiry.is_mega_deal ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`} />
                                {enquiry.is_mega_deal ? "Remove Mega Deal" : "Mark as Mega Deal"}
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuSeparator />

                            {/* AI Follow-up Drafter */}
                            <DropdownMenuItem onClick={() => setFollowupEnquiry(enquiry)}>
                              <Sparkles className="w-4 h-4 mr-2 text-primary" />
                              ✨ Generate Follow-up
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

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

      {/* AI Follow-up Drafter Dialog */}
      {followupEnquiry && (
        <FollowupDrafterDialog
          open={!!followupEnquiry}
          onOpenChange={(open) => !open && setFollowupEnquiry(null)}
          enquiry={followupEnquiry}
        />
      )}
    </>
  );
}