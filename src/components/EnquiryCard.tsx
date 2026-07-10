import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Enquiry } from "@/hooks/useEnquiries";
import { StatusBadge } from "./StatusBadge";
import { UrgencyIndicator } from "./UrgencyIndicator";
import { formatDistanceToNow } from "date-fns";
import { Package, User, Calendar, Hash, Boxes } from "lucide-react";
import { getSlaStatus, getTimeRemainingString, UrgencyLevel } from "@/lib/sla";
import { Badge } from "./ui/badge";
import { LeadSourceBadge } from "./LeadSourceBadge";
import { StickyNote, MessageSquare } from "lucide-react";
import { formatDistanceToNow as fmtRel } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

interface EnquiryCardProps {
  enquiry: Enquiry;
  onClick?: () => void;
  unreadMessages?: number;
}

export function EnquiryCard({ enquiry, onClick, unreadMessages = 0 }: EnquiryCardProps) {
  const createdAt = new Date(enquiry.created_at);
  const respondedAt = enquiry.responded_at ? new Date(enquiry.responded_at) : null;
  const isResponded = enquiry.status !== "pending";
  const slaStatus = getSlaStatus(createdAt, respondedAt, enquiry.urgency as UrgencyLevel, isResponded);
  const timeRemaining = getTimeRemainingString(createdAt, enquiry.urgency as UrgencyLevel);

  const getSlaColor = () => {
    switch (slaStatus) {
      case "met":
      case "on_track":
        return "text-success";
      case "at_risk":
        return "text-warning";
      case "breached":
      case "delayed":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <Card
      className="glass hover:border-primary/50 transition-all duration-300 cursor-pointer animate-slide-up group"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {enquiry.product_name}
              </h3>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Hash className="w-3 h-3" />
              {enquiry.product_code}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={enquiry.status} />
            {unreadMessages > 0 && (
              <Badge className="bg-blue-600 hover:bg-blue-600 text-white gap-1">
                <MessageSquare className="w-3 h-3" />
                {unreadMessages} new
              </Badge>
            )}
          </div>
        </div>
        {enquiry.lead_source && (
          <div className="mt-2">
            <LeadSourceBadge source={enquiry.lead_source} size="xs" fallback="hide" />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Qty:</span>
            <span className="font-medium">{enquiry.quantity}</span>
          </div>
          <div className="flex items-center gap-2">
            <UrgencyIndicator urgency={enquiry.urgency} />
          </div>
          
          {/* SLA Status */}
          <div className="col-span-2">
            <Badge variant="outline" className={`${getSlaColor()} border-current`}>
              {slaStatus === "met" && "SLA Met"}
              {slaStatus === "on_track" && `On Track: ${timeRemaining}`}
              {slaStatus === "at_risk" && `At Risk: ${timeRemaining}`}
              {slaStatus === "breached" && "SLA Breached"}
              {slaStatus === "delayed" && "Delayed"}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2 col-span-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Customer:</span>
            <span className="font-medium truncate">{enquiry.customer_name}</span>
            {enquiry.customer_company && (
              <span className="text-muted-foreground">({enquiry.customer_company})</span>
            )}
          </div>
          {enquiry.followup_note && (
            <div className="col-span-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                      <StickyNote className="w-3 h-3 shrink-0 text-primary/70" />
                      <span className="truncate">{enquiry.followup_note}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-sm">{enquiry.followup_note}</p>
                    {enquiry.followup_note_updated_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        updated {fmtRel(new Date(enquiry.followup_note_updated_at), { addSuffix: true })}
                        {enquiry.followup_note_updated_by_name ? ` by ${enquiry.followup_note_updated_by_name}` : ""}
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>

        {enquiry.response_pricing && enquiry.status === "responded" && (
          <div className="pt-3 border-t border-border space-y-2">
            <p className="text-xs uppercase tracking-wider text-primary font-medium">Response</p>
            <div className="grid grid-cols-3 gap-2 text-sm">
              {enquiry.response_pricing && (
                <div>
                  <span className="text-muted-foreground">Price: </span>
                  <span className="font-medium">{enquiry.response_pricing}</span>
                </div>
              )}
              {enquiry.response_availability && (
                <div>
                  <span className="text-muted-foreground">Stock: </span>
                  <span className="font-medium">{enquiry.response_availability}</span>
                </div>
              )}
              {enquiry.response_lead_time && (
                <div>
                  <span className="text-muted-foreground">Lead: </span>
                  <span className="font-medium">{enquiry.response_lead_time}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDistanceToNow(createdAt, { addSuffix: true })}
          </div>
          <span>by {enquiry.sales_person_name}</span>
        </div>
      </CardContent>
    </Card>
  );
}