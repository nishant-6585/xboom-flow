import { useState, useEffect, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Users, ScrollText, Megaphone } from "lucide-react";
import { GoogleAdsOverviewTab } from "./google-ads/GoogleAdsOverviewTab";
import { GoogleAdsCampaignTab } from "./google-ads/GoogleAdsCampaignTab";
import { GoogleAdsLeadsTab } from "./google-ads/GoogleAdsLeadsTab";
import { GoogleAdsSyncLogsTab } from "./google-ads/GoogleAdsSyncLogsTab";
import { subDays, format } from "date-fns";

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

export function GoogleAdsSyncPanel() {
  const [campaigns, setCampaigns] = useState<CampaignPerformance[]>([]);
  const [dailyData, setDailyData] = useState<DailyPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Fetch from the campaign_performance view
      const [campRes, dailyRes] = await Promise.all([
        supabase.from("campaign_performance").select("*"),
        supabase.from("daily_performance").select("*").order("date", { ascending: true }).limit(30),
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

      setLoading(false);
    }
    load();
  }, []);

  const totalLeads = campaigns.reduce((s, c) => s + c.total_leads, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
  const totalSpend = campaigns.reduce((s, c) => s + c.total_spend, 0);
  const qualifiedLeads = campaigns.reduce((s, c) => s + c.qualified_leads, 0);

  // AI Insights from real data
  const aiInsights = useMemo(() => {
    if (campaigns.length === 0) return [];
    const insights: string[] = [];

    const bestCampaign = [...campaigns].sort((a, b) => b.roas - a.roas)[0];
    if (bestCampaign && bestCampaign.revenue > 0) {
      insights.push(`"${bestCampaign.campaign_name}" is your top performer with ${bestCampaign.roas.toFixed(1)}x ROAS. Consider increasing its budget.`);
    }

    const worstCampaign = [...campaigns]
      .filter((c) => c.total_spend > 0)
      .sort((a, b) => a.roas - b.roas)[0];

    if (worstCampaign && worstCampaign.conversions === 0 && worstCampaign.total_leads > 5) {
      insights.push(`"${worstCampaign.campaign_name}" has ${worstCampaign.total_leads} leads but zero conversions. Review targeting or pause.`);
    }

    const convRate = totalLeads > 0 ? (totalConversions / totalLeads) * 100 : 0;
    if (convRate < 5 && totalLeads > 20) {
      insights.push(`Overall conversion rate is ${convRate.toFixed(1)}% — below the 5% benchmark. Focus on lead quality.`);
    } else if (convRate >= 10) {
      insights.push(`Excellent ${convRate.toFixed(1)}% conversion rate! Your lead quality is strong.`);
    }

    if (totalSpend > 0 && totalRevenue === 0) {
      insights.push(`₹${totalSpend.toLocaleString("en-IN")} spent but no revenue tracked yet. Mark converted enquiries to unlock ROI insights.`);
    }

    if (totalLeads > 0 && insights.length === 0) {
      insights.push(`${totalLeads} leads captured from Google Ads. Track outcomes to unlock deeper insights.`);
    }

    return insights;
  }, [campaigns, totalLeads, totalConversions, totalSpend, totalRevenue]);

  // Chart data from daily_performance view
  const chartData = useMemo(() => {
    if (dailyData.length > 0) return dailyData;
    // Fallback: empty 14 days
    const days: { date: string; revenue: number; spend: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      days.push({ date: format(subDays(new Date(), i), "dd MMM"), revenue: 0, spend: 0 });
    }
    return days;
  }, [dailyData]);

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
