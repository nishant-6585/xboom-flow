import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUpDown, Trophy, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

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

type SortKey = "campaign_name" | "spend" | "leads" | "conversions" | "revenue" | "cpl" | "roas";

export function GoogleAdsCampaignTab({ campaigns }: GoogleAdsCampaignTabProps) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortAsc, setSortAsc] = useState(false);

  const enriched = useMemo(() => {
    return campaigns.map((c) => ({
      ...c,
      cpl: safeDivide(c.spend, c.leads),
      roas: safeDivide(c.revenue, c.spend),
      convRate: safeDivide(c.conversions, c.leads) * 100,
    }));
  }, [campaigns]);

  const sorted = useMemo(() => {
    return [...enriched].sort((a, b) => {
      const av = a[sortKey as keyof typeof a] as number;
      const bv = b[sortKey as keyof typeof b] as number;
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Campaign Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortBtn label="Campaign" field="campaign_name" /></TableHead>
              <TableHead className="text-right"><SortBtn label="Spend" field="spend" /></TableHead>
              <TableHead className="text-center"><SortBtn label="Leads" field="leads" /></TableHead>
              <TableHead className="text-center"><SortBtn label="Conversions" field="conversions" /></TableHead>
              <TableHead className="text-right"><SortBtn label="Revenue" field="revenue" /></TableHead>
              <TableHead className="text-right"><SortBtn label="CPL" field="cpl" /></TableHead>
              <TableHead className="text-right"><SortBtn label="ROAS" field="roas" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((c) => {
              const origIdx = enriched.findIndex((e) => e.campaign_id === c.campaign_id);
              const isBest = origIdx === bestIdx && enriched.length > 1;
              const isWorst = origIdx === worstIdx && enriched.length > 1;

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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
