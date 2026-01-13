import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Rocket, Lightbulb, Phone, BarChart3, Zap, Quote, ScrollText, Users } from "lucide-react";
import { DailyActivityForm } from "@/components/sales/DailyActivityForm";
import { SalesLeaderboard } from "@/components/sales/SalesLeaderboard";
import { PointsDisplay } from "@/components/sales/PointsDisplay";
import { SuggestionBox } from "@/components/sales/SuggestionBox";
import { OutboundSalesPanel } from "@/components/sales/OutboundSalesPanel";
import { ManagerDashboard } from "@/components/sales/ManagerDashboard";
import { TestimonialsPanel } from "@/components/sales/TestimonialsPanel";
import { SalesRulesPanel } from "@/components/sales/SalesRulesPanel";
import { LeadsPanel } from "@/components/sales/LeadsPanel";

export default function Sales() {
  const { role } = useAuth();
  const isManager = role === 'admin' || role === 'supply_chain';

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        <div className="mb-8">
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

        <Tabs defaultValue={isManager ? "manager" : "activity"} className="space-y-6">
          <TabsList className="bg-muted/50 backdrop-blur-sm">
            {isManager && (
              <TabsTrigger value="manager" className="gap-2">
                <BarChart3 className="w-4 h-4" />
                Manager Dashboard
              </TabsTrigger>
            )}
            <TabsTrigger value="activity" className="gap-2">
              <Rocket className="w-4 h-4" />
              Daily Activity
            </TabsTrigger>
            <TabsTrigger value="leads" className="gap-2">
              <Users className="w-4 h-4" />
              Leads
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="gap-2">
              <Trophy className="w-4 h-4" />
              Leaderboard
            </TabsTrigger>
            <TabsTrigger value="outbound" className="gap-2">
              <Phone className="w-4 h-4" />
              Outbound
            </TabsTrigger>
            <TabsTrigger value="testimonials" className="gap-2">
              <Quote className="w-4 h-4" />
              Testimonials
            </TabsTrigger>
            <TabsTrigger value="suggestions" className="gap-2">
              <Lightbulb className="w-4 h-4" />
              Suggestions
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-2">
              <ScrollText className="w-4 h-4" />
              Rules
            </TabsTrigger>
          </TabsList>

          {isManager && (
            <TabsContent value="manager" className="space-y-6">
              <ManagerDashboard />
            </TabsContent>
          )}

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
        </Tabs>
      </main>
    </div>
  );
}
