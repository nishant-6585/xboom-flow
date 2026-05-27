import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Repair, ISSUE_TYPES } from "@/hooks/useRepairs";
import { format } from "date-fns";
import { Phone, Calendar, Wrench, IndianRupee, Clock, User, Globe } from "lucide-react";

interface RepairCardProps {
  repair: Repair;
  onClick?: () => void;
}

const paymentStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  partial: { label: "Partial", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
};

export function RepairCard({ repair, onClick }: RepairCardProps) {
  const issueTypeLabel = ISSUE_TYPES.find(t => t.value === repair.issue_type)?.label || repair.issue_type;
  const paymentConfig = paymentStatusConfig[repair.payment_status] || paymentStatusConfig.pending;
  const isWebsite = repair.source_lead_id !== null;
  const creatorLabel = isWebsite
    ? "Website"
    : repair.created_by_name || "Unknown";

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                {repair.repair_number && (
                  <Badge variant="outline" className="font-mono text-xs">
                    {repair.repair_number}
                  </Badge>
                )}
                <Badge className={paymentConfig.className}>
                  {paymentConfig.label}
                </Badge>
                <Badge
                  variant={isWebsite ? "default" : "secondary"}
                  className={`text-xs flex items-center gap-1 ${isWebsite ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100' : ''}`}
                >
                  {isWebsite ? <Globe className="h-3 w-3" /> : <User className="h-3 w-3" />}
                  {creatorLabel}
                </Badge>
              </div>
              <h3 className="font-semibold text-lg mt-1">{repair.customer_name}</h3>
              <p className="text-sm text-muted-foreground">{repair.model_name}</p>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">₹{repair.total_quote_amount?.toLocaleString() || 0}</div>
              {repair.balance_amount > 0 && (
                <div className="text-xs text-muted-foreground">
                  Balance: ₹{repair.balance_amount.toLocaleString()}
                </div>
              )}
            </div>
          </div>

          {/* Issue Type */}
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{issueTypeLabel}</span>
          </div>

          {/* Contact & Dates */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              <span>{repair.contact_no}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>{format(new Date(repair.date_of_receipt), "dd MMM yyyy")}</span>
            </div>
          </div>

          {/* Components & Profit */}
          {(repair.components_replaced?.length > 0 || repair.profit !== 0) && (
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="text-sm text-muted-foreground">
                {repair.components_replaced?.length || 0} components replaced
              </div>
              <div className={`text-sm font-medium ${repair.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                Profit: ₹{repair.profit?.toLocaleString() || 0}
              </div>
            </div>
          )}

          {/* Days Info */}
          {(repair.days_to_complete !== null || repair.committed_date) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {repair.days_to_complete !== null ? (
                <span>Completed in {repair.days_to_complete} days</span>
              ) : repair.committed_date ? (
                <span>Due: {format(new Date(repair.committed_date), "dd MMM yyyy")}</span>
              ) : null}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
