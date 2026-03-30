import { useState, useEffect, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Users, ScrollText, Megaphone } from "lucide-react";
import { GoogleAdsOverviewTab } from "./google-ads/GoogleAdsOverviewTab";
import { GoogleAdsCampaignTab } from "./google-ads/GoogleAdsCampaignTab";
import { GoogleAdsLeadsTab } from "./google-ads/GoogleAdsLeadsTab";
import { GoogleAdsSyncLogsTab } from "./google-ads/GoogleAdsSyncLogsTab";
import { subDays, format, differenceInHours } from "date-fns";

interface CampaignPerformance {
  campaign_id: string;
  campaign_name: string;
  total_spend: number;
  total_leads: number;
  qualified_leads: number;
  conversions: number;
  revenue: number;
  cpl: number;
  roas: number;
  profit: number;
}

interface DailyPerformance {
  date: string;
  leads: number;
  conversions: number;
  revenue: number;
  spend: number;
}

interface SalespersonPerf {
  salesperson_id: string;
  salesperson_name: string;
  leads: number;
  conversions: number;
  revenue: number;
  conversion_rate: number;
}

export function GoogleAdsSyncPanel() {
  const [campaigns, setCampaigns] = useState<CampaignPerformance[]>([]);
  const [dailyData, setDailyData] = useState<DailyPerformance[]>([]);
  const [salesPerformance, setSalesPerformance] = useState<SalespersonPerf[]>([]);
  const [avgConversionHours, setAvgConversionHours] = useState(0);
  const [agingLeadsCount, setAgingLeadsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [campRes, dailyRes, salesRes, agingRes, convTimeRes] = await Promise.all([
        supabase.from("campaign_performance").select("*"),
        supabase.from("daily_performance").select("*").order("date", { ascending: true }).limit(30),
        // Sales performance: group Google Ads leads by salesperson
        supabase
          .from("enquiries")
          .select("sales_person_id, sales_person_name, is_converted, conversion_value")
          .eq("lead_source", "google_ads")
          .not("sales_person_id", "is", null),
        // Aging leads: unconverted > 24h
        supabase
          .from("enquiries")
          .select("id", { count: "exact", head: true })
          .eq("lead_source", "google_ads")
          .eq("is_converted", false)
          .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        // Conversion time
        supabase
          .from("enquiries")
          .select("created_at, conversion_date")
          .eq("lead_source", "google_ads")
          .eq("is_converted", true)
          .not("conversion_date", "is", null),
      ]);

      if (campRes.data) {
        setCampaigns(campRes.data.map((c: any) => ({
          campaign_id: c.campaign_id || "unknown",
          campaign_name: c.campaign_name || "Unknown Campaign",
          total_spend: Number(c.total_spend) || 0,
          total_leads: Number(c.total_leads) || 0,
          qualified_leads: Number(c.qualified_leads) || 0,
          conversions: Number(c.conversions) || 0,
          revenue: Number(c.revenue) || 0,
          cpl: Number(c.cpl) || 0,
          roas: Number(c.roas) || 0,
          profit: Number(c.profit) || 0,
        })));
      }

      if (dailyRes.data) {
        setDailyData(dailyRes.data.map((d: any) => ({
          date: format(new Date(d.date), "dd MMM"),
          leads: Number(d.leads) || 0,
          conversions: Number(d.conversions) || 0,
          revenue: Number(d.revenue) || 0,
          spend: Number(d.spend) || 0,
        })));
      }

      // Aggregate sales performance
      if (salesRes.data && salesRes.data.length > 0) {
        const spMap = new Map<string, SalespersonPerf>();
        salesRes.data.forEach((e: any) => {
          const id = e.sales_person_id;
          if (!spMap.has(id)) {
            spMap.set(id, {
              salesperson_id: id,
              salesperson_name: e.sales_person_name || "Unknown",
              leads: 0,
              conversions: 0,
              revenue: 0,
              conversion_rate: 0,
            });
          }
          const sp = spMap.get(id)!;
          sp.leads += 1;
          if (e.is_converted) {
            sp.conversions += 1;
            sp.revenue += Number(e.conversion_value) || 0;
          }
        });
        const perfList = Array.from(spMap.values()).map((sp) => ({
          ...sp,
          conversion_rate: sp.leads > 0 ? (sp.conversions / sp.leads) * 100 : 0,
        }));
        setSalesPerformance(perfList.sort((a, b) => b.revenue - a.revenue));
      }

      // Aging count
      setAgingLeadsCount(agingRes.count || 0);

      // Avg conversion time
      if (convTimeRes.data && convTimeRes.data.length > 0) {
        const totalHours = convTimeRes.data.reduce((sum: number, e: any) => {
          return sum + differenceInHours(new Date(e.conversion_date), new Date(e.created_at));
        }, 0);
        setAvgConversionHours(totalHours / convTimeRes.data.length);
      }

      setLoading(false);
    }
    load();
  }, []);

  const totalLeads = campaigns.reduce((s, c) => s + c.total_leads, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
  const totalSpend = campaigns.reduce((s, c) => s + c.total_spend, 0);
  const qualifiedLeads = campaigns.reduce((s, c) => s + c.qualified_leads, 0);

  const chartData = useMemo(() => {
    if (dailyData.length > 0) return dailyData;
    const days: { date: string; revenue: number; spend: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      days.push({ date: format(subDays(new Date(), i), "dd MMM"), revenue: 0, spend: 0 });
    }
    return days;
  }, [dailyData]);

  // AI Insights (legacy — kept for backward compatibility, decision engine is primary now)
  const aiInsights = useMemo(() => {
    if (campaigns.length === 0) return [];
    const insights: string[] = [];
    const bestCampaign = [...campaigns].sort((a, b) => b.roas - a.roas)[0];
    if (bestCampaign && bestCampaign.revenue > 0) {
      insights.push(`"${bestCampaign.campaign_name}" is your top performer with ${bestCampaign.roas.toFixed(1)}x ROAS.`);
    }
    const convRate = totalLeads > 0 ? (totalConversions / totalLeads) * 100 : 0;
    if (convRate >= 10) {
      insights.push(`Excellent ${convRate.toFixed(1)}% conversion rate! Your lead quality is strong.`);
    }
    return insights;
  }, [campaigns, totalLeads, totalConversions]);

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">Loading Google Ads data...</div>;
  }

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList>
        <TabsTrigger value="overview" className="gap-1.5">
          <BarChart3 className="w-4 h-4" />
          Overview
        </TabsTrigger>
        <TabsTrigger value="campaigns" className="gap-1.5">
          <Megaphone className="w-4 h-4" />
          Campaigns
        </TabsTrigger>
        <TabsTrigger value="leads" className="gap-1.5">
          <Users className="w-4 h-4" />
          Leads
        </TabsTrigger>
        <TabsTrigger value="sync-logs" className="gap-1.5">
          <ScrollText className="w-4 h-4" />
          Sync Logs
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <GoogleAdsOverviewTab
          campaigns={campaigns.map(c => ({
            campaign_id: c.campaign_id,
            campaign_name: c.campaign_name,
            leads: c.total_leads,
            conversions: c.conversions,
            revenue: c.revenue,
            spend: c.total_spend,
          }))}
          totalLeads={totalLeads}
          totalConversions={totalConversions}
          totalRevenue={totalRevenue}
          totalSpend={totalSpend}
          qualifiedLeads={qualifiedLeads}
          chartData={chartData}
          aiInsights={aiInsights}
          salesPerformance={salesPerformance}
          avgConversionHours={avgConversionHours}
          agingLeadsCount={agingLeadsCount}
        />
      </TabsContent>

      <TabsContent value="campaigns">
        <GoogleAdsCampaignTab campaigns={campaigns.map(c => ({
          campaign_id: c.campaign_id,
          campaign_name: c.campaign_name,
          leads: c.total_leads,
          conversions: c.conversions,
          revenue: c.revenue,
          spend: c.total_spend,
        }))} />
      </TabsContent>

      <TabsContent value="leads">
        <GoogleAdsLeadsTab />
      </TabsContent>

      <TabsContent value="sync-logs">
        <GoogleAdsSyncLogsTab />
      </TabsContent>
    </Tabs>
  );
}
