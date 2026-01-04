import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ProductQuery } from "@/types/query";
import { StatusBadge } from "./StatusBadge";
import { UrgencyIndicator } from "./UrgencyIndicator";
import { formatDistanceToNow } from "date-fns";
import { Package, User, Calendar, Hash, Boxes } from "lucide-react";

interface QueryCardProps {
  query: ProductQuery;
  onClick?: () => void;
}

export function QueryCard({ query, onClick }: QueryCardProps) {
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
                {query.productName}
              </h3>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Hash className="w-3 h-3" />
              {query.productCode}
            </div>
          </div>
          <StatusBadge status={query.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Qty:</span>
            <span className="font-medium">{query.quantity}</span>
          </div>
          <div className="flex items-center gap-2">
            <UrgencyIndicator urgency={query.urgency} />
          </div>
          <div className="flex items-center gap-2 col-span-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Customer:</span>
            <span className="font-medium truncate">{query.customerName}</span>
            {query.customerCompany && (
              <span className="text-muted-foreground">({query.customerCompany})</span>
            )}
          </div>
        </div>

        {query.response && query.status === 'confirmed' && (
          <div className="pt-3 border-t border-border space-y-2">
            <p className="text-xs uppercase tracking-wider text-primary font-medium">Response</p>
            <div className="grid grid-cols-3 gap-2 text-sm">
              {query.response.pricing && (
                <div>
                  <span className="text-muted-foreground">Price: </span>
                  <span className="font-medium">{query.response.pricing}</span>
                </div>
              )}
              {query.response.availability && (
                <div>
                  <span className="text-muted-foreground">Stock: </span>
                  <span className="font-medium">{query.response.availability}</span>
                </div>
              )}
              {query.response.leadTime && (
                <div>
                  <span className="text-muted-foreground">Lead: </span>
                  <span className="font-medium">{query.response.leadTime}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDistanceToNow(query.createdAt, { addSuffix: true })}
          </div>
          <span>by {query.salesPerson}</span>
        </div>
      </CardContent>
    </Card>
  );
}
