import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUpDown, Trophy, AlertTriangle, TrendingUp, Pause, Settings, AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface CampaignData {
  campaign_id: string;
  campaign_name: string;
  leads: number;
  conversions: number;
  revenue: number;
  spend: number;
}

interface GoogleAdsCampaignTabProps {
  campaigns: CampaignData[];
}

function formatINR(value: number): string {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
}

function safeDivide(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

type ActionType = "SCALE" | "OPTIMIZE" | "PAUSE" | "CRITICAL";

function getRecommendedAction(c: { spend: number; conversions: number; roas: number }): { action: ActionType; message: string } {
  if (c.conversions === 0 && c.spend > 0) {
    return { action: "CRITICAL", message: "High spend with zero conversions. Pause campaign or fix sales follow-up immediately." };
  }
  if (c.roas >= 3) {
    return { action: "SCALE", message: "High ROI campaign. Increase budget to maximize revenue." };
  }
  if (c.roas >= 1) {
    return { action: "OPTIMIZE", message: "Moderate performance. Optimize targeting or creatives to improve ROI." };
  }
  return { action: "PAUSE", message: "Loss-making campaign. Reduce or stop spend immediately." };
}

const actionStyles: Record<ActionType, { bg: string; text: string; icon: typeof TrendingUp }> = {
  SCALE: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", icon: TrendingUp },
  OPTIMIZE: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", icon: Settings },
  PAUSE: { bg: "bg-destructive/10 border-destructive/20", text: "text-destructive", icon: Pause },
  CRITICAL: { bg: "bg-red-900/10 border-red-900/30", text: "text-red-900", icon: AlertOctagon },
};

type SortKey = "campaign_name" | "spend" | "leads" | "conversions" | "revenue" | "cpl" | "roas";

export function GoogleAdsCampaignTab({ campaigns }: GoogleAdsCampaignTabProps) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortAsc, setSortAsc] = useState(false);

  const enriched = useMemo(() => {
    return campaigns.map((c) => {
      const roas = safeDivide(c.revenue, c.spend);
      const recommendation = getRecommendedAction({ spend: c.spend, conversions: c.conversions, roas });
      return {
        ...c,
        cpl: safeDivide(c.spend, c.leads),
        roas,
        convRate: safeDivide(c.conversions, c.leads) * 100,
        ...recommendation,
      };
    });
  }, [campaigns]);

  const sorted = useMemo(() => {
    return [...enriched].sort((a, b) => {
      if (sortKey === "campaign_name") {
        const av = a.campaign_name || "";
        const bv = b.campaign_name || "";
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortAsc ? av - bv : bv - av;
    });
  }, [enriched, sortKey, sortAsc]);

  const bestIdx = enriched.length > 0
    ? enriched.reduce((best, c, i) => (c.roas > enriched[best].roas ? i : best), 0)
    : -1;
  const worstIdx = enriched.length > 0
    ? enriched.reduce((worst, c, i) => (c.roas < enriched[worst].roas ? i : worst), 0)
    : -1;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const SortBtn = ({ label, field }: { label: string; field: SortKey }) => (
    <Button variant="ghost" size="sm" className="h-auto p-0 font-medium text-muted-foreground hover:text-foreground" onClick={() => handleSort(field)}>
      {label}
      <ArrowUpDown className="w-3 h-3 ml-1" />
    </Button>
  );

  if (campaigns.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No campaign data available yet. Leads synced from Google Ads will appear here grouped by campaign.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Campaign Performance & Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortBtn label="Campaign" field="campaign_name" /></TableHead>
                <TableHead className="text-right"><SortBtn label="Spend" field="spend" /></TableHead>
                <TableHead className="text-center"><SortBtn label="Leads" field="leads" /></TableHead>
                <TableHead className="text-center"><SortBtn label="Conv." field="conversions" /></TableHead>
                <TableHead className="text-right"><SortBtn label="Revenue" field="revenue" /></TableHead>
                <TableHead className="text-right"><SortBtn label="CPL" field="cpl" /></TableHead>
                <TableHead className="text-right"><SortBtn label="ROAS" field="roas" /></TableHead>
                <TableHead className="text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((c) => {
                const origIdx = enriched.findIndex((e) => e.campaign_id === c.campaign_id);
                const isBest = origIdx === bestIdx && enriched.length > 1;
                const isWorst = origIdx === worstIdx && enriched.length > 1;
                const style = actionStyles[c.action];
                const ActionIcon = style.icon;

                return (
                  <TableRow
                    key={c.campaign_id}
                    className={
                      isBest
                        ? "bg-emerald-500/5 hover:bg-emerald-500/10"
                        : isWorst
                        ? "bg-destructive/5 hover:bg-destructive/10"
                        : ""
                    }
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {c.campaign_name || `Campaign ${c.campaign_id}`}
                        {isBest && (
                          <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[10px] px-1.5 py-0">
                            <Trophy className="w-3 h-3 mr-0.5" /> Best
                          </Badge>
                        )}
                        {isWorst && (
                          <Badge variant="outline" className="text-destructive border-destructive/20 bg-destructive/5 text-[10px] px-1.5 py-0">
                            <AlertTriangle className="w-3 h-3 mr-0.5" /> Low
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatINR(c.spend)}</TableCell>
                    <TableCell className="text-center">{c.leads}</TableCell>
                    <TableCell className="text-center">{c.conversions}</TableCell>
                    <TableCell className="text-right font-medium text-emerald-600">{formatINR(c.revenue)}</TableCell>
                    <TableCell className="text-right">{formatINR(c.cpl)}</TableCell>
                    <TableCell className="text-right">
                      <span className={c.roas >= 3 ? "text-emerald-600 font-semibold" : c.roas >= 1 ? "text-amber-600" : "text-destructive"}>
                        {c.roas.toFixed(1)}x
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className={`text-[10px] px-2 py-0.5 cursor-help ${style.bg} ${style.text}`}>
                            <ActionIcon className="w-3 h-3 mr-1" />
                            {c.action}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[250px]">
                          <p className="text-xs">{c.message}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
