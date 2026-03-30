import { useState, useEffect, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Users, ScrollText, Megaphone } from "lucide-react";
import { GoogleAdsOverviewTab } from "./google-ads/GoogleAdsOverviewTab";
import { GoogleAdsCampaignTab } from "./google-ads/GoogleAdsCampaignTab";
import { GoogleAdsLeadsTab } from "./google-ads/GoogleAdsLeadsTab";
import { GoogleAdsSyncLogsTab } from "./google-ads/GoogleAdsSyncLogsTab";
import { subDays, format } from "date-fns";

interface EnquiryRow {
  campaign_id: string | null;
  campaign_name: string | null;
  lead_temperature: string | null;
  order_outcome: string | null;
  created_at: string;
}

interface CampaignData {
  campaign_id: string;
  campaign_name: string;
  leads: number;
  conversions: number;
  revenue: number;
  spend: number;
}

export function GoogleAdsSyncPanel() {
  const [enquiries, setEnquiries] = useState<EnquiryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("enquiries")
        .select("campaign_id, campaign_name, lead_temperature, order_outcome, created_at")
        .eq("lead_source", "google_ads")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (data) setEnquiries(data as EnquiryRow[]);
      setLoading(false);
    }
    load();
  }, []);

  // Aggregate campaign data
  const campaigns: CampaignData[] = useMemo(() => {
    const map = new Map<string, CampaignData>();
    for (const e of enquiries) {
      const cid = e.campaign_id || "unknown";
      if (!map.has(cid)) {
        map.set(cid, {
          campaign_id: cid,
          campaign_name: e.campaign_name || `Campaign ${cid}`,
          leads: 0,
          conversions: 0,
          revenue: 0,
          spend: 0,
        });
      }
      const c = map.get(cid)!;
      c.leads++;
      if (e.order_outcome === "won") {
        c.conversions++;
        c.revenue += 85000; // Estimated avg order value
      }
      // Estimated spend per lead (Google Ads avg for India)
      c.spend += 350;
    }
    return Array.from(map.values());
  }, [enquiries]);

  const totalLeads = enquiries.length;
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);

  // Build chart data for last 14 days
  const chartData = useMemo(() => {
    const days: { date: string; revenue: number; spend: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dateStr = format(d, "yyyy-MM-dd");
      const label = format(d, "dd MMM");
      const dayEnquiries = enquiries.filter(
        (e) => e.created_at.slice(0, 10) === dateStr
      );
      const dayLeads = dayEnquiries.length;
      const dayConversions = dayEnquiries.filter((e) => e.order_outcome === "won").length;
      days.push({
        date: label,
        spend: dayLeads * 350,
        revenue: dayConversions * 85000,
      });
    }
    return days;
  }, [enquiries]);

  // AI Insights
  const aiInsights = useMemo(() => {
    if (campaigns.length === 0) return [];
    const insights: string[] = [];

    const bestCampaign = [...campaigns].sort((a, b) => {
      const roasA = a.spend > 0 ? a.revenue / a.spend : 0;
      const roasB = b.spend > 0 ? b.revenue / b.spend : 0;
      return roasB - roasA;
    })[0];

    if (bestCampaign && bestCampaign.revenue > 0) {
      const roas = bestCampaign.spend > 0 ? (bestCampaign.revenue / bestCampaign.spend).toFixed(1) : "∞";
      insights.push(`"${bestCampaign.campaign_name}" is your top performer with ${roas}x ROAS. Consider increasing its budget.`);
    }

    const worstCampaign = [...campaigns]
      .filter((c) => c.spend > 0)
      .sort((a, b) => {
        const roasA = a.spend > 0 ? a.revenue / a.spend : 0;
        const roasB = b.spend > 0 ? b.revenue / b.spend : 0;
        return roasA - roasB;
      })[0];

    if (worstCampaign && worstCampaign.conversions === 0 && worstCampaign.leads > 5) {
      insights.push(`"${worstCampaign.campaign_name}" has ${worstCampaign.leads} leads but zero conversions. Review targeting or pause.`);
    }

    const convRate = totalLeads > 0 ? (totalConversions / totalLeads) * 100 : 0;
    if (convRate < 5 && totalLeads > 20) {
      insights.push(`Overall conversion rate is ${convRate.toFixed(1)}% — below the 5% benchmark. Focus on lead quality.`);
    } else if (convRate >= 10) {
      insights.push(`Excellent ${convRate.toFixed(1)}% conversion rate! Your lead quality is strong.`);
    }

    if (totalLeads > 0 && insights.length === 0) {
      insights.push(`${totalLeads} leads captured from Google Ads. Track outcomes to unlock deeper insights.`);
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
          campaigns={campaigns}
          totalLeads={totalLeads}
          totalConversions={totalConversions}
          totalRevenue={totalRevenue}
          totalSpend={totalSpend}
          chartData={chartData}
          aiInsights={aiInsights}
        />
      </TabsContent>

      <TabsContent value="campaigns">
        <GoogleAdsCampaignTab campaigns={campaigns} />
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
