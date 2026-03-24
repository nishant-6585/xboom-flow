import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { DailyFlowPanel } from "@/components/dailyflow/DailyFlowPanel";
import { CalendarClock } from "lucide-react";

export default function DailyFlow() {
  const { loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-4 sm:py-6 flex-1 overflow-x-hidden">
        <div className="mb-6 flex items-center gap-3">
          <CalendarClock className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Daily Flow</h1>
            <p className="text-muted-foreground">
              Plan, track and analyse daily work schedules for each employee
            </p>
          </div>
        </div>
        <DailyFlowPanel />
      </main>
    </div>
  );
}
