import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Trophy, Rocket, Lightbulb, Phone, BarChart3, Zap, Quote, ScrollText, Users, GitBranch, Bot, Target, HelpCircle, PieChart, ListTodo, TrendingUp, Package } from "lucide-react";
import { DailyActivityForm } from "@/components/sales/DailyActivityForm";
import { SalesLeaderboard } from "@/components/sales/SalesLeaderboard";
import { PointsDisplay } from "@/components/sales/PointsDisplay";
import { SuggestionBox } from "@/components/sales/SuggestionBox";
import { OutboundSalesPanel } from "@/components/sales/OutboundSalesPanel";
import { ManagerDashboard } from "@/components/sales/ManagerDashboard";
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

export default function Sales() {
  const { role } = useAuth();
  const [searchParams] = useSearchParams();
  const isManager = role === 'admin' || role === 'supply_chain';
  const [assistantOpen, setAssistantOpen] = useState(false);
  
  // Read tab and leadId from URL params
  const urlTab = searchParams.get("tab");
  const urlLeadId = searchParams.get("leadId");
  const [activeTab, setActiveTab] = useState(urlTab || "manager");

  // Handle URL params for tab navigation
  useEffect(() => {
    if (urlTab) {
      setActiveTab(urlTab);
    }
  }, [urlTab]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-primary/70">
                <Zap className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  Sales Arena
                </h1>
                <p className="text-muted-foreground">Track, compete, and conquer your sales goals</p>
              </div>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="space-y-2">
            {/* Primary Navigation Row */}
            <TabsList className="bg-card border shadow-sm flex flex-wrap justify-center gap-1 p-1.5 rounded-xl h-auto">
              <TabsTrigger value="manager" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2">
                <BarChart3 className="w-4 h-4" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="tasks" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2">
                <ListTodo className="w-4 h-4" />
                Tasks
              </TabsTrigger>
              <TabsTrigger value="leads" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2">
                <Users className="w-4 h-4" />
                Leads
              </TabsTrigger>
              <TabsTrigger value="enquiries" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2">
                <Package className="w-4 h-4" />
                Enquiries
              </TabsTrigger>
              <TabsTrigger value="pipeline" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2">
                <TrendingUp className="w-4 h-4" />
                Pipeline
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2">
                <Rocket className="w-4 h-4" />
                Activity
              </TabsTrigger>
              <TabsTrigger value="funnel" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2">
                <GitBranch className="w-4 h-4" />
                Funnel
              </TabsTrigger>
              <TabsTrigger value="leaderboard" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2">
                <Trophy className="w-4 h-4" />
                Leaderboard
              </TabsTrigger>
              <TabsTrigger value="outbound" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2">
                <Phone className="w-4 h-4" />
                Outbound
              </TabsTrigger>
            </TabsList>
            
            {/* Secondary Navigation Row */}
            <TabsList className="bg-muted/50 border border-dashed flex flex-wrap justify-center gap-1 p-1.5 rounded-xl h-auto">
              <TabsTrigger value="testimonials" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2">
                <Quote className="w-4 h-4" />
                Testimonials
              </TabsTrigger>
              <TabsTrigger value="targets" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2">
                <Target className="w-4 h-4" />
                Targets
              </TabsTrigger>
              <TabsTrigger value="analytics" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2">
                <PieChart className="w-4 h-4" />
                Analytics
              </TabsTrigger>
              <TabsTrigger value="faq" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2">
                <HelpCircle className="w-4 h-4" />
                FAQ
              </TabsTrigger>
              <TabsTrigger value="rules" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2">
                <ScrollText className="w-4 h-4" />
                Rules
              </TabsTrigger>
              <TabsTrigger value="suggestions" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-2">
                <Lightbulb className="w-4 h-4" />
                Ideas
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="tasks" className="space-y-6">
            <TasksPanel />
          </TabsContent>

          <TabsContent value="manager" className="space-y-6">
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
            <EnquiriesPanel />
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-6">
            <PipelineOrders selectedLeadId={urlLeadId} />
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
