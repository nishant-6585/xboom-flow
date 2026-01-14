import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Flame, Star, ArrowRight, TrendingUp, Building2 } from "lucide-react";
import { LeadTemperatureBadge, LeadTemperature } from "./LeadTemperatureBadge";
import { cn } from "@/lib/utils";

interface Lead {
  id: string;
  customer_name: string;
  customer_company: string;
  product_name: string;
  quantity: number;
  lead_temperature?: string | null;
  is_mega_deal?: boolean | null;
  created_at: string;
  status: string;
  type: "enquiry" | "pipeline";
}

interface HotLeadsWidgetProps {
  enquiries: Lead[];
  pipelineOrders?: Lead[];
  onLeadClick?: (lead: Lead) => void;
  onViewAll?: () => void;
}

export function HotLeadsWidget({ 
  enquiries, 
  pipelineOrders = [], 
  onLeadClick,
  onViewAll 
}: HotLeadsWidgetProps) {
  // Combine and filter hot leads and mega deals
  const { hotLeads, megaDeals, stats } = useMemo(() => {
    const allLeads: Lead[] = [
      ...enquiries.map(e => ({ ...e, type: "enquiry" as const })),
      ...pipelineOrders.map(p => ({ ...p, type: "pipeline" as const }))
    ];

    const hot = allLeads.filter(
      lead => lead.lead_temperature === "hot" && 
      !["order_won", "order_lost", "cancelled"].includes(lead.status)
    );
    
    const mega = allLeads.filter(
      lead => lead.is_mega_deal === true && 
      !["order_won", "order_lost", "cancelled"].includes(lead.status)
    );

    // Unique mega deals (some might also be hot)
    const uniqueMega = mega.filter(m => m.lead_temperature !== "hot");

    return {
      hotLeads: hot.slice(0, 5),
      megaDeals: mega.slice(0, 5),
      stats: {
        totalHot: hot.length,
        totalMega: mega.length,
        hotEnquiries: hot.filter(l => l.type === "enquiry").length,
        hotPipeline: hot.filter(l => l.type === "pipeline").length,
        megaEnquiries: mega.filter(l => l.type === "enquiry").length,
        megaPipeline: mega.filter(l => l.type === "pipeline").length,
      }
    };
  }, [enquiries, pipelineOrders]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const LeadItem = ({ lead }: { lead: Lead }) => (
    <div 
      onClick={() => onLeadClick?.(lead)}
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border cursor-pointer",
        "transition-all duration-200 hover:shadow-md",
        lead.lead_temperature === "hot" 
          ? "bg-orange-500/5 border-orange-500/20 hover:bg-orange-500/10" 
          : "bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm truncate">{lead.customer_name}</span>
          <Badge variant="outline" className="text-xs shrink-0">
            {lead.type === "enquiry" ? "Enquiry" : "Pipeline"}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="w-3 h-3" />
          <span className="truncate">{lead.customer_company}</span>
          <span>•</span>
          <span className="truncate">{lead.product_name}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        <LeadTemperatureBadge 
          temperature={(lead.lead_temperature as LeadTemperature) || "warm"} 
          isMegaDeal={lead.is_mega_deal || false}
          showLabel={false}
          size="sm"
        />
        <span className="text-xs text-muted-foreground">{formatDate(lead.created_at)}</span>
      </div>
    </div>
  );

  if (stats.totalHot === 0 && stats.totalMega === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Hot Leads Card */}
      <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="relative">
                <Flame className="w-5 h-5 text-orange-500 animate-pulse" />
                <Flame className="w-5 h-5 text-orange-400 absolute top-0 left-0 animate-ping opacity-30" />
              </div>
              Hot Leads
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-orange-500/10 text-orange-600 dark:text-orange-400">
                {stats.totalHot} Total
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
            <span>{stats.hotEnquiries} Enquiries</span>
            <span>•</span>
            <span>{stats.hotPipeline} Pipeline</span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {hotLeads.length > 0 ? (
            <ScrollArea className="h-[200px] pr-4">
              <div className="space-y-2">
                {hotLeads.map((lead) => (
                  <LeadItem key={`${lead.type}-${lead.id}`} lead={lead} />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <TrendingUp className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No hot leads at the moment</p>
              <p className="text-xs">Mark leads as hot to see them here</p>
            </div>
          )}
          {stats.totalHot > 5 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full mt-3 text-orange-600 hover:text-orange-700 hover:bg-orange-500/10"
              onClick={onViewAll}
            >
              View All {stats.totalHot} Hot Leads
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Mega Deals Card */}
      <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
              Mega Deals
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
                {stats.totalMega} Total
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
            <span>{stats.megaEnquiries} Enquiries</span>
            <span>•</span>
            <span>{stats.megaPipeline} Pipeline</span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {megaDeals.length > 0 ? (
            <ScrollArea className="h-[200px] pr-4">
              <div className="space-y-2">
                {megaDeals.map((lead) => (
                  <LeadItem key={`${lead.type}-${lead.id}`} lead={lead} />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Star className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No mega deals tracked</p>
              <p className="text-xs">Mark high-value leads as mega deals</p>
            </div>
          )}
          {stats.totalMega > 5 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full mt-3 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
              onClick={onViewAll}
            >
              View All {stats.totalMega} Mega Deals
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
