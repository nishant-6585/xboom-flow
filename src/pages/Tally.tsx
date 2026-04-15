import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { TallyDashboard } from "@/components/tally/TallyDashboard";

export default function Tally() {
  const { role, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (role !== "admin" && role !== "finance") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-4 sm:py-6 flex-1 overflow-x-hidden">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Tally</h1>
          <p className="text-muted-foreground">
            Order vs Procurement analysis — sales value, payments, costs & profit
          </p>
        </div>
        <TallyDashboard />
      </main>
    </div>
  );
}
