import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Trophy, Rocket, Lightbulb, Phone, BarChart3, Zap, Quote, ScrollText, Users, GitBranch, Bot, Target, HelpCircle, PieChart, ListTodo, TrendingUp, Package, AlertTriangle, CalendarCheck } from "lucide-react";
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
import { SalesFunnelDashboard } from "@/components/sales/SalesFunnelDashboard";
import { AISalesAssistant } from "@/components/AISalesAssistant";
import { SalesTargetsPanel } from "@/components/sales/SalesTargetsPanel";
import { SalesFAQPanel } from "@/components/sales/SalesFAQPanel";
import { SalesAnalyticsDashboard } from "@/components/sales/SalesAnalyticsDashboard";
import { TasksPanel } from "@/components/tasks/TasksPanel";
import { PipelineOrders } from "@/components/pipeline/PipelineOrders";
import { EnquiriesPanel } from "@/components/sales/EnquiriesPanel";
import { ProspectsPanel } from "@/components/sales/ProspectsPanel";
import { AttentionPanel } from "@/components/sales/AttentionPanel";
import { FollowupsPanel } from "@/components/sales/FollowupsPanel";
import { CallbacksPanel } from "@/components/sales/CallbacksPanel";



export default function Sales() {
  const { role } = useAuth();
  const [searchParams] = useSearchParams();
  const isManager = role === 'admin' || role === 'supply_chain';
  const [assistantOpen, setAssistantOpen] = useState(false);
  
  // Read tab and leadId from URL params (reactive to changes)
  const urlTab = searchParams.get("tab");
  const urlLeadId = searchParams.get("leadId");
  const [activeTab, setActiveTab] = useState(urlTab || "manager");

  // Handle URL params for tab navigation — react to every change
  useEffect(() => {
    if (urlTab) {
      setActiveTab(urlTab);
    }
  }, [urlTab, urlLeadId]);

  const triggerBase = "gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-muted/80 data-[state=active]:shadow-md";
  const triggerPrimary = `${triggerBase} data-[state=active]:bg-primary data-[state=active]:text-primary-foreground`;
  const triggerSecondary = `${triggerBase} text-xs px-3 py-2`;
  const triggerSecondaryPrimary = `${triggerSecondary} data-[state=active]:bg-primary data-[state=active]:text-primary-foreground`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
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
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="space-y-2.5">
            {/* Primary Navigation */}
            <div className="bg-card/80 backdrop-blur-sm border border-border/50 shadow-sm rounded-2xl p-1.5">
              <TabsList className="bg-transparent flex flex-wrap justify-center gap-1 h-auto p-0">
                <TabsTrigger value="manager" className={triggerPrimary}>
                  <BarChart3 className="w-4 h-4" />
                  Dashboard
                </TabsTrigger>
                <TabsTrigger value="tasks" className={triggerPrimary}>
                  <ListTodo className="w-4 h-4" />
                  Tasks
                </TabsTrigger>
                <TabsTrigger value="leads" className={triggerPrimary}>
                  <Users className="w-4 h-4" />
                  Leads
                </TabsTrigger>
                <TabsTrigger value="enquiries" className={triggerPrimary}>
                  <Package className="w-4 h-4" />
                  Enquiries
                </TabsTrigger>
                <TabsTrigger value="pipeline" className={triggerPrimary}>
                  <TrendingUp className="w-4 h-4" />
                  Pipeline
                </TabsTrigger>
                <TabsTrigger value="prospects" className={`${triggerBase} data-[state=active]:bg-warning data-[state=active]:text-warning-foreground`}>
                  <Target className="w-4 h-4" />
                  Prospects
                </TabsTrigger>
                <TabsTrigger value="followups" className={`${triggerBase} data-[state=active]:bg-amber-600 data-[state=active]:text-white`}>
                  <CalendarCheck className="w-4 h-4" />
                  Follow-ups
                </TabsTrigger>
                <TabsTrigger value="attention" className={`${triggerBase} data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground`}>
                  <AlertTriangle className="w-4 h-4" />
                  Attention
                </TabsTrigger>
                <TabsTrigger value="activity" className={triggerPrimary}>
                  <Rocket className="w-4 h-4" />
                  Activity
                </TabsTrigger>
                <TabsTrigger value="funnel" className={triggerPrimary}>
                  <GitBranch className="w-4 h-4" />
                  Funnel
                </TabsTrigger>
                <TabsTrigger value="leaderboard" className={triggerPrimary}>
                  <Trophy className="w-4 h-4" />
                  Leaderboard
                </TabsTrigger>
                <TabsTrigger value="outbound" className={triggerPrimary}>
                  <Phone className="w-4 h-4" />
                  Outbound
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
                <TabsTrigger value="analytics" className={triggerSecondaryPrimary}>
                  <PieChart className="w-3.5 h-3.5" />
                  Analytics
                </TabsTrigger>
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

          <TabsContent value="manager" className="space-y-6">
            <SalesCommandCenter />
            <ManagerDashboard />
          </TabsContent>

          <TabsContent value="funnel" className="space-y-6">
            <SalesFunnelDashboard />
          </TabsContent>

          <TabsContent value="activity" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <DailyActivityForm />
              </div>
              <div className="space-y-6">
                <PointsDisplay />
                <SalesLeaderboard />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="leads" className="space-y-6">
            <LeadsPanel />
          </TabsContent>

          <TabsContent value="enquiries" className="space-y-6">
            <EnquiriesPanel selectedLeadId={urlLeadId} />
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-6">
            <PipelineOrders selectedLeadId={urlLeadId} />
          </TabsContent>

          <TabsContent value="prospects" className="space-y-6">
            <ProspectsPanel />
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

          <TabsContent value="leaderboard" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <SalesLeaderboard />
              </div>
              <PointsDisplay />
            </div>
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

          <TabsContent value="analytics" className="space-y-6">
            <SalesAnalyticsDashboard />
          </TabsContent>
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
