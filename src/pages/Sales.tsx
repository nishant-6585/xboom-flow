import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Trophy, Rocket, Lightbulb, Phone, BarChart3, Zap, Quote, ScrollText, Users, GitBranch, Bot, Target, HelpCircle, PieChart, ListTodo, TrendingUp, Package, AlertTriangle, CalendarCheck, Contact, CheckCircle2, XCircle, Star, Building2, Tv, FileText, Award } from "lucide-react";
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
import { ProspectsPanel } from "@/components/sales/ProspectsPanel";
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
import { ClaimWebsiteOrderPanel } from "@/components/sales/ClaimWebsiteOrderPanel";


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

  const triggerBase = "gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-muted/80 data-[state=active]:shadow-md";
  const triggerPrimary = `${triggerBase} data-[state=active]:bg-primary data-[state=active]:text-primary-foreground`;
  const triggerSecondary = `${triggerBase} text-xs px-3 py-2`;
  const triggerSecondaryPrimary = `${triggerSecondary} data-[state=active]:bg-primary data-[state=active]:text-primary-foreground`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
              <Zap className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Sales Arena
              </h1>
              <p className="text-muted-foreground text-sm">Track, compete, and conquer your sales goals</p>
            </div>
          </div>
          <Button
            onClick={() => navigate('/sales/tv')}
            size="lg"
            className="gap-2 bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500 hover:opacity-90 text-white shadow-lg shadow-orange-500/30"
            title="Open full-screen auto-rotating sales scoreboard"
          >
            <Tv className="w-5 h-5" />
            TV View
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="space-y-2.5">
            {/* Primary Navigation - Row 1 */}
            <div className="bg-card/80 backdrop-blur-sm border border-border/50 shadow-sm rounded-2xl p-1.5">
              <TabsList className="bg-transparent flex flex-wrap justify-center gap-1 h-auto p-0">
                <TabsTrigger value="my_leads" className={`${triggerBase} data-[state=active]:bg-emerald-600 data-[state=active]:text-white font-semibold`}>
                  <Contact className="w-4 h-4" />
                  My Leads
                </TabsTrigger>
                {canSeeAnalytics && (
                  <TabsTrigger value="manager" className={triggerPrimary}>
                    <BarChart3 className="w-4 h-4" />
                    Dashboard
                  </TabsTrigger>
                )}
                <TabsTrigger value="leads" className={triggerPrimary}>
                  <Users className="w-4 h-4" />
                  Leads
                </TabsTrigger>
                <TabsTrigger value="prospects" className={`${triggerBase} data-[state=active]:bg-warning data-[state=active]:text-warning-foreground`}>
                  <Target className="w-4 h-4" />
                  Prospects
                </TabsTrigger>
                <TabsTrigger value="pipeline" className={triggerPrimary}>
                  <TrendingUp className="w-4 h-4" />
                  Pipeline
                </TabsTrigger>
                <TabsTrigger value="quotes" className={`${triggerBase} data-[state=active]:bg-sky-600 data-[state=active]:text-white`}>
                  <FileText className="w-4 h-4" />
                  Quotes
                </TabsTrigger>
                <TabsTrigger value="untouched" className={`${triggerBase} data-[state=active]:bg-red-600 data-[state=active]:text-white`}>
                  <AlertTriangle className="w-4 h-4" />
                  Untouched
                </TabsTrigger>
                <TabsTrigger value="followups" className={`${triggerBase} data-[state=active]:bg-amber-600 data-[state=active]:text-white`}>
                  <CalendarCheck className="w-4 h-4" />
                  Follow-ups
                </TabsTrigger>
                <TabsTrigger value="mega_deals" className={`${triggerBase} data-[state=active]:bg-amber-500 data-[state=active]:text-white text-base font-bold px-5 py-3`}>
                  <Star className="w-5 h-5" />
                  Mega Deals
                </TabsTrigger>
                <TabsTrigger value="companies" className={triggerPrimary}>
                  <Building2 className="w-4 h-4" />
                  Companies
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Row 2 */}
            <div className="bg-card/80 backdrop-blur-sm border border-border/50 shadow-sm rounded-2xl p-1.5">
              <TabsList className="bg-transparent flex flex-wrap justify-center gap-1 h-auto p-0">
                <TabsTrigger value="orders_won" className={`${triggerBase} data-[state=active]:bg-green-600 data-[state=active]:text-white`}>
                  <CheckCircle2 className="w-4 h-4" />
                  Orders Won
                </TabsTrigger>
                <TabsTrigger value="orders_lost" className={`${triggerBase} data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground`}>
                  <XCircle className="w-4 h-4" />
                  Orders Lost
                </TabsTrigger>
                <TabsTrigger value="attention" className={`${triggerBase} data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground`}>
                  <AlertTriangle className="w-4 h-4" />
                  Attention
                </TabsTrigger>
                <TabsTrigger value="disp_qualified" className={`${triggerBase} data-[state=active]:bg-green-600 data-[state=active]:text-white`}>
                  <CheckCircle2 className="w-4 h-4" />
                  Qualified
                </TabsTrigger>
                <TabsTrigger value="disp_not_qualified" className={`${triggerBase} data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground`}>
                  <XCircle className="w-4 h-4" />
                  Not Qualified
                </TabsTrigger>
                {canAccessEnquiries && (
                <TabsTrigger value="enquiries" className={triggerPrimary}>
                  <Package className="w-4 h-4" />
                  Enquiries
                </TabsTrigger>
                )}
                <TabsTrigger value="tasks" className={triggerPrimary}>
                  <ListTodo className="w-4 h-4" />
                  Tasks
                </TabsTrigger>
                <TabsTrigger value="claim_website_order" className={`${triggerBase} data-[state=active]:bg-violet-600 data-[state=active]:text-white`}>
                  <Award className="w-4 h-4" />
                  Claim Order
                </TabsTrigger>
                {canSeeAnalytics && (
                  <TabsTrigger value="source_performance" className={`${triggerBase} data-[state=active]:bg-indigo-600 data-[state=active]:text-white`}>
                    <BarChart3 className="w-4 h-4" />
                    Source Tracker
                  </TabsTrigger>
                )}
                {canManageAvailability && (
                  <TabsTrigger value="availability" className={`${triggerBase} data-[state=active]:bg-amber-600 data-[state=active]:text-white`}>
                    <CalendarOff className="w-4 h-4" />
                    Availability
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {/* Outbound - Standalone */}
            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border-2 border-primary/30 shadow-sm rounded-2xl p-1.5">
              <TabsList className="bg-transparent flex justify-center h-auto p-0">
                <TabsTrigger value="outbound" className={`${triggerBase} text-base font-bold px-6 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground`}>
                  <Phone className="w-5 h-5" />
                  Outbound Sales
                </TabsTrigger>
              </TabsList>
            </div>
            
            {/* Secondary Navigation */}
            <div className="bg-muted/20 border border-dashed border-border/40 rounded-xl p-1.5">
              <div className="flex items-center justify-center gap-3 mb-1">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border/60 to-transparent" />
                <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">Resources</span>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border/60 to-transparent" />
              </div>
              <TabsList className="bg-transparent flex flex-wrap justify-center gap-1 h-auto p-0">
                <TabsTrigger value="testimonials" className={triggerSecondaryPrimary}>
                  <Quote className="w-3.5 h-3.5" />
                  Testimonials
                </TabsTrigger>
                <TabsTrigger value="targets" className={triggerSecondaryPrimary}>
                  <Target className="w-3.5 h-3.5" />
                  Targets
                </TabsTrigger>
                {canSeeAnalytics && (
                  <TabsTrigger value="analytics" className={triggerSecondaryPrimary}>
                    <PieChart className="w-3.5 h-3.5" />
                    Analytics
                  </TabsTrigger>
                )}
                {canSeeAnalytics && (
                  <TabsTrigger value="category_funnel" className={`${triggerSecondary} data-[state=active]:bg-emerald-600 data-[state=active]:text-white`}>
                    <GitBranch className="w-3.5 h-3.5" />
                    Category Funnel
                  </TabsTrigger>
                )}
                <TabsTrigger value="faq" className={triggerSecondaryPrimary}>
                  <HelpCircle className="w-3.5 h-3.5" />
                  FAQ
                </TabsTrigger>
                <TabsTrigger value="rules" className={triggerSecondaryPrimary}>
                  <ScrollText className="w-3.5 h-3.5" />
                  Rules
                </TabsTrigger>
                <TabsTrigger value="suggestions" className={triggerSecondaryPrimary}>
                  <Lightbulb className="w-3.5 h-3.5" />
                  Ideas
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="tasks" className="space-y-6">
            <TasksPanel />
          </TabsContent>

          <TabsContent value="claim_website_order" className="space-y-6">
            <ClaimWebsiteOrderPanel />
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
              <TabsContent value="prospects-list"><ProspectsPanel selectedLeadId={urlLeadId} /></TabsContent>
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
