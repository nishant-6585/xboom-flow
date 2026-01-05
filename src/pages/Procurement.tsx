import { useState } from "react";
import { Header } from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { ProcurementOrders } from "@/components/procurement/ProcurementOrders";
import { ProcurementLedger } from "@/components/procurement/ProcurementLedger";
import { ProcurementDashboard } from "@/components/procurement/ProcurementDashboard";
import { FileText, BookOpen, LayoutDashboard } from "lucide-react";

export default function Procurement() {
  const { role, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("orders");

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Only admin and supply_chain can access procurement
  if (role !== "admin" && role !== "supply_chain") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Procurement Management</h1>
          <p className="text-muted-foreground">
            Manage procurement orders, supplier payments and view analytics
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
            <TabsTrigger value="orders" className="gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Orders</span>
            </TabsTrigger>
            <TabsTrigger value="ledger" className="gap-2">
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Ledger</span>
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-2">
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="mt-6">
            <ProcurementOrders />
          </TabsContent>

          <TabsContent value="ledger" className="mt-6">
            <ProcurementLedger />
          </TabsContent>

          <TabsContent value="dashboard" className="mt-6">
            <ProcurementDashboard />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
