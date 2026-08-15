import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { DataExportDialog } from "@/components/exports/DataExportDialog";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useSalesDashboardMetrics } from "@/hooks/useSalesDashboardMetrics";
import { usePipelineOrders } from "@/hooks/usePipelineOrders";
import { Trophy, Rocket, Lightbulb, Phone, BarChart3, Zap, Quote, ScrollText, Users, GitBranch, Bot, Target, HelpCircle, PieChart, ListTodo, TrendingUp, Package, AlertTriangle, CalendarCheck, Contact, CheckCircle2, XCircle, Star, Building2, Tv, FileText } from "lucide-react";
import { DailyActivityForm } from "@/components/sales/DailyActivityForm";
import { SalesLeaderboard } from "@/components/sales/SalesLeaderboard";
import { PointsDisplay } from "@/components/sales/PointsDisplay";
import { SuggestionBox } from "@/components/sales/SuggestionBox";
import { OutboundSalesPanel } from "@/components/sales/OutboundSalesPanel";
import { ManagerDashboard } from "@/components/sales/ManagerDashboard";
import { SalesCommandCenter } from "@/components/sales/SalesCommandCenter";
import { TestimonialsPanel } from "@/components/sales/TestimonialsPanel";
import { SalesRulesPanel } from "@/components/sales/SalesRulesPanel";
import { LeadsPanel } from "@/components/sales/LeadsPanel";
import { DispositionBucketView } from "@/components/sales/DispositionBucketView";
import { SalesFunnelDashboard } from "@/components/sales/SalesFunnelDashboard";
import { AISalesAssistant } from "@/components/AISalesAssistant";
import { SalesTargetsPanel } from "@/components/sales/SalesTargetsPanel";
import { SalesFAQPanel } from "@/components/sales/SalesFAQPanel";
import { SalesAnalyticsDashboard } from "@/components/sales/SalesAnalyticsDashboard";
import { CategoryFunnelDashboard } from "@/components/sales/CategoryFunnelDashboard";
import { LeadSourcePerformanceDashboard } from "@/components/sales/LeadSourcePerformanceDashboard";
import { QFormsElevenLabsConversionAnalytics } from "@/components/sales/QFormsElevenLabsConversionAnalytics";
import { TasksPanel } from "@/components/tasks/TasksPanel";
import { PipelineOrders } from "@/components/pipeline/PipelineOrders";
import { EnquiriesPanel } from "@/components/sales/EnquiriesPanel";
import { SlaBanner } from "@/components/sales/SlaBanner";
import { ProspectsSection } from "@/components/sales/ProspectsSection";
import { ProspectAutoFollowupPanel } from "@/components/sales/ProspectAutoFollowupPanel";
import { AttentionPanel } from "@/components/sales/AttentionPanel";
import { FollowupsPanel } from "@/components/sales/FollowupsPanel";
import { CallbacksPanel } from "@/components/sales/CallbacksPanel";
import { CompaniesPanel } from "@/components/crm/CompaniesPanel";
import { UntouchedLeadsPanel } from "@/components/sales/UntouchedLeadsPanel";
import { UntouchedLoginAlert } from "@/components/sales/UntouchedLoginAlert";
import { MyLeadsPanel } from "@/components/sales/MyLeadsPanel";
import { TeamAvailabilityPanel } from "@/components/sales/TeamAvailabilityPanel";
import { QuotesPanel } from "@/components/sales/QuotesPanel";
import { CalendarOff } from "lucide-react";


export default function Sales() {
  const { role, roles } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isManager = role === 'admin' || role === 'supply_chain';
  const canAccessEnquiries = role === 'admin' || role === 'sales_manager';
  const canSeeAnalytics = role === 'admin' || role === 'sales_manager';
  const isSalesRep = role === 'sales';
  const canManageAvailability =
    (roles ?? []).some((r) => r === 'admin' || r === 'sales_manager') ||
    role === 'admin' ||
    role === 'sales_manager';
  const [assistantOpen, setAssistantOpen] = useState(false);
  const now = new Date();
  const [dashboardDateRange, setDashboardDateRange] = useState({
    start: format(now, 'yyyy-MM-dd'),
    end: format(now, 'yyyy-MM-dd'),
  });
  const handleDateRangeChange = useCallback((s: string, e: string) => setDashboardDateRange({ start: s, end: e }), []);

  // ---- Live header state (today's funnel + yesterday's lost value) ----
  const todayStr = format(now, 'yyyy-MM-dd');
  const yesterdayStr = format(new Date(now.getTime() - 86400000), 'yyyy-MM-dd');
  const { metrics } = useSalesDashboardMetrics({ startDate: todayStr, endDate: todayStr });
  const { pipelineOrders } = usePipelineOrders();
  const lostYesterdayValue = (pipelineOrders ?? []).reduce(
    (sum, p: any) =>
      p.status === 'lost' && (p.updated_at || '').slice(0, 10) === yesterdayStr
        ? sum + (p.expected_price || 0)
        : sum,
    0,
  );
  const fmtCurrency = (v: number) => {
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
    if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
    if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
    return `₹${v.toFixed(0)}`;
  };

  // Read tab and leadId from URL params (reactive to changes)
  const urlTab = searchParams.get("tab");
  const urlLeadId = searchParams.get("leadId");
  const urlSearch = searchParams.get("search");
  const [activeTab, setActiveTab] = useState(
    urlTab || (role === 'sales' ? 'my_leads' : 'manager'),
  );

  // Handle URL params for tab navigation — react to every change
  useEffect(() => {
    if (urlTab) {
      setActiveTab(urlTab);
    }
  }, [urlTab, urlLeadId]);

  // If role resolves after first render, redirect sales reps off restricted default
  useEffect(() => {
    if (urlTab) return;
    if (role === 'sales' && activeTab === 'manager') setActiveTab('my_leads');
  }, [role, urlTab, activeTab]);

  const neutralTrigger =
    "gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/60 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:font-medium data-[state=active]:shadow-sm whitespace-nowrap [&_svg]:w-3.5 [&_svg]:h-3.5 [&_svg]:text-muted-foreground";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Sales Arena</h1>
            <p className="text-muted-foreground text-sm tabular-nums">
              {metrics.totals.total_leads} leads today · {metrics.totals.total_prospects} prospects ·{' '}
              {metrics.totals.orders_won} orders won ·{' '}
              <span className="text-destructive">{fmtCurrency(lostYesterdayValue)} lost yesterday</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => navigate('/sales/tv')}
            className="gap-2"
            title="Open full-screen auto-rotating sales scoreboard"
          >
            <Tv className="w-4 h-4" />
            TV View
          </Button>
          {role === "admin" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DataExportDialog
                  triggerLabel="Download data"
                  trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Download data</DropdownMenuItem>}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="rounded-lg bg-muted/40 p-1 overflow-x-auto scrollbar-hide">
            <TabsList className="bg-transparent flex flex-nowrap gap-0.5 h-auto p-0 w-max">
              <TabsTrigger value="orders_won" className={neutralTrigger}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Orders Won
              </TabsTrigger>
              <TabsTrigger value="orders_lost" className={neutralTrigger}>
                <XCircle className="w-3.5 h-3.5" />
                Orders Lost
              </TabsTrigger>
              <TabsTrigger value="attention" className={neutralTrigger}>
                <AlertTriangle className="w-3.5 h-3.5" />
                Attention
              </TabsTrigger>
              <TabsTrigger value="disp_qualified" className={neutralTrigger}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Qualified
              </TabsTrigger>
              <TabsTrigger value="disp_not_qualified" className={neutralTrigger}>
                <XCircle className="w-3.5 h-3.5" />
                Not Qualified
              </TabsTrigger>
              <TabsTrigger value="testimonials" className={neutralTrigger}>
                <Quote className="w-3.5 h-3.5" />
                Testimonials
              </TabsTrigger>
              <TabsTrigger value="targets" className={neutralTrigger}>
                <Target className="w-3.5 h-3.5" />
                Targets
              </TabsTrigger>
              {canSeeAnalytics && (
                <TabsTrigger value="analytics" className={neutralTrigger}>
                  <PieChart className="w-3.5 h-3.5" />
                  Analytics
                </TabsTrigger>
              )}
              {canSeeAnalytics && (
                <TabsTrigger value="category_funnel" className={neutralTrigger}>
                  <GitBranch className="w-3.5 h-3.5" />
                  Category Funnel
                </TabsTrigger>
              )}
              <TabsTrigger value="faq" className={neutralTrigger}>
                <HelpCircle className="w-3.5 h-3.5" />
                FAQ
              </TabsTrigger>
              <TabsTrigger value="rules" className={neutralTrigger}>
                <ScrollText className="w-3.5 h-3.5" />
                Rules
              </TabsTrigger>
              <TabsTrigger value="suggestions" className={neutralTrigger}>
                <Lightbulb className="w-3.5 h-3.5" />
                Ideas
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="tasks" className="space-y-6">
            <TasksPanel />
          </TabsContent>

          {canSeeAnalytics && (
            <TabsContent value="source_performance" className="space-y-6">
              <LeadSourcePerformanceDashboard />
              <QFormsElevenLabsConversionAnalytics />
            </TabsContent>
          )}

          <TabsContent value="my_leads" className="space-y-6">
            <MyLeadsPanel />
          </TabsContent>

          {canSeeAnalytics && (
            <TabsContent value="manager" className="space-y-6">
              <UntouchedLoginAlert />
              <SalesCommandCenter onDateRangeChange={handleDateRangeChange} />
              <ManagerDashboard startDate={dashboardDateRange.start} endDate={dashboardDateRange.end} />
            </TabsContent>
          )}

          <TabsContent value="untouched" className="space-y-6">
            <UntouchedLeadsPanel />
          </TabsContent>



          <TabsContent value="leads" className="space-y-6">
            <LeadsPanel initialSearch={urlSearch} />
          </TabsContent>

          {canAccessEnquiries && (
          <TabsContent value="enquiries" className="space-y-6">
            <SlaBanner />
            <EnquiriesPanel selectedLeadId={urlLeadId} />
          </TabsContent>
          )}

          <TabsContent value="pipeline" className="space-y-6">
            <PipelineOrders selectedLeadId={urlLeadId} />
          </TabsContent>

          <TabsContent value="quotes" className="space-y-6">
            <QuotesPanel />
          </TabsContent>

          <TabsContent value="prospects" className="space-y-6">
            <Tabs defaultValue="prospects-list" className="space-y-4">
              <TabsList>
                <TabsTrigger value="prospects-list">🎯 Prospects</TabsTrigger>
                <TabsTrigger value="prospects-auto">🤖 Auto Follow-up</TabsTrigger>
              </TabsList>
              <TabsContent value="prospects-list"><ProspectsSection selectedLeadId={urlLeadId} /></TabsContent>
              <TabsContent value="prospects-auto"><ProspectAutoFollowupPanel /></TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="followups" className="space-y-6">
            <Tabs defaultValue="followups-list" className="space-y-4">
              <TabsList>
                <TabsTrigger value="followups-list">📅 Follow-ups</TabsTrigger>
                <TabsTrigger value="callbacks-list">📞 Callbacks</TabsTrigger>
              </TabsList>
              <TabsContent value="followups-list">
                <FollowupsPanel />
              </TabsContent>
              <TabsContent value="callbacks-list">
                <CallbacksPanel />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="attention" className="space-y-6">
            <AttentionPanel />
          </TabsContent>

          <TabsContent value="disp_qualified" className="space-y-6">
            <DispositionBucketView target="qualified" />
          </TabsContent>

          <TabsContent value="disp_not_qualified" className="space-y-6">
            <DispositionBucketView target="not_qualified" />
          </TabsContent>


          <TabsContent value="mega_deals" className="space-y-6">
            <PipelineOrders megaDealsOnly />
          </TabsContent>

          <TabsContent value="companies" className="space-y-6">
            <CompaniesPanel selectedLeadId={urlLeadId} />
          </TabsContent>

          <TabsContent value="orders_won" className="space-y-6">
            <PipelineOrders statusPreFilter="won" />
          </TabsContent>

          <TabsContent value="orders_lost" className="space-y-6">
            <PipelineOrders statusPreFilter="lost" />
          </TabsContent>

          <TabsContent value="outbound" className="space-y-6">
            <OutboundSalesPanel />
          </TabsContent>


          <TabsContent value="testimonials" className="space-y-6">
            <TestimonialsPanel />
          </TabsContent>


          <TabsContent value="suggestions" className="space-y-6">
            <div className="max-w-2xl mx-auto">
              <SuggestionBox />
            </div>
          </TabsContent>

          <TabsContent value="rules" className="space-y-6">
            <SalesRulesPanel />
          </TabsContent>

          <TabsContent value="targets" className="space-y-6">
            <SalesTargetsPanel />
          </TabsContent>

          <TabsContent value="faq" className="space-y-6">
            <SalesFAQPanel />
          </TabsContent>

          {canSeeAnalytics && (
            <TabsContent value="analytics" className="space-y-6">
              <SalesAnalyticsDashboard />
            </TabsContent>
          )}

          {canSeeAnalytics && (
            <TabsContent value="category_funnel" className="space-y-6">
              <CategoryFunnelDashboard />
            </TabsContent>
          )}

          {canManageAvailability && (
            <TabsContent value="availability" className="space-y-6">
              <TeamAvailabilityPanel />
            </TabsContent>
          )}
        </Tabs>
      </main>

      {/* Floating AI Assistant Button */}
      <Button
        onClick={() => setAssistantOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 z-40"
        size="icon"
      >
        <Bot className="w-6 h-6" />
      </Button>

      {/* AI Sales Assistant Dialog */}
      <AISalesAssistant isOpen={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  );
}
