import { useState } from "react";
import { Header } from "@/components/Header";
import { QueryForm } from "@/components/QueryForm";
import { QueryList } from "@/components/QueryList";
import { StatsCards } from "@/components/StatsCards";
import { SlaStatsCards } from "@/components/SlaStatsCards";
import { QueryResponseDialog } from "@/components/QueryResponseDialog";
import { ProductQuery, QueryStatus } from "@/types/query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList, PlusCircle } from "lucide-react";

// Sample data for demonstration
const sampleQueries: ProductQuery[] = [
  {
    id: "1",
    productName: "Industrial Sensor XR-500",
    productCode: "XB-2024-001",
    quantity: 150,
    customerName: "John Smith",
    customerCompany: "TechCorp Industries",
    salesPerson: "Alice Johnson",
    urgency: "high",
    notes: "Customer needs urgent delivery for Q1 project deadline",
    status: "pending",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: "2",
    productName: "Control Module CM-200",
    productCode: "XB-2024-015",
    quantity: 50,
    customerName: "Sarah Chen",
    customerCompany: "AutomateNow",
    salesPerson: "Bob Williams",
    urgency: "medium",
    notes: "",
    status: "in_review",
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
  },
  {
    id: "3",
    productName: "Power Supply Unit PS-750",
    productCode: "XB-2024-022",
    quantity: 200,
    customerName: "Mike Brown",
    customerCompany: "PowerGrid Solutions",
    salesPerson: "Alice Johnson",
    urgency: "low",
    notes: "Standard order, no rush",
    status: "confirmed",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    response: {
      pricing: "$45.50/unit",
      availability: "In Stock",
      leadTime: "5-7 days",
    },
  },
  {
    id: "4",
    productName: "Connector Kit CK-100",
    productCode: "XB-2024-008",
    quantity: 500,
    customerName: "Lisa Wang",
    customerCompany: "ConnectPlus",
    salesPerson: "Charlie Davis",
    urgency: "critical",
    notes: "Production line stopped, need immediate response",
    status: "pending",
    createdAt: new Date(Date.now() - 30 * 60 * 1000),
    updatedAt: new Date(Date.now() - 30 * 60 * 1000),
  },
  {
    id: "5",
    productName: "Display Panel DP-400",
    productCode: "XB-2024-031",
    quantity: 25,
    customerName: "Tom Anderson",
    customerCompany: "DisplayTech",
    salesPerson: "Bob Williams",
    urgency: "medium",
    notes: "Replacement for warranty claim",
    status: "rejected",
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
  },
];

const Index = () => {
  const [queries, setQueries] = useState<ProductQuery[]>(sampleQueries);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedQuery, setSelectedQuery] = useState<ProductQuery | null>(null);
  const [responseDialogOpen, setResponseDialogOpen] = useState(false);

  const handleSubmitQuery = (queryData: Omit<ProductQuery, "id" | "status" | "createdAt" | "updatedAt">) => {
    const newQuery: ProductQuery = {
      ...queryData,
      id: Date.now().toString(),
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setQueries([newQuery, ...queries]);
    setActiveTab("dashboard");
  };

  const handleQueryClick = (query: ProductQuery) => {
    setSelectedQuery(query);
    setResponseDialogOpen(true);
  };

  const handleSubmitResponse = (
    queryId: string,
    status: QueryStatus,
    response: ProductQuery["response"]
  ) => {
    setQueries(
      queries.map((q) =>
        q.id === queryId
          ? { ...q, status, response, updatedAt: new Date() }
          : q
      )
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Product Enquiry System</h2>
          <p className="text-muted-foreground">
            Submit and track pricing, availability, and lead time queries with the supply chain team
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="inline-flex">
            <TabsTrigger value="dashboard" className="gap-2">
              <ClipboardList className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="new" className="gap-2">
              <PlusCircle className="w-4 h-4" />
              New Enquiry
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <StatsCards queries={queries} />
            <SlaStatsCards queries={queries} />
            <QueryList queries={queries} onQueryClick={handleQueryClick} />
          </TabsContent>

          <TabsContent value="new">
            <div className="max-w-2xl">
              <QueryForm onSubmit={handleSubmitQuery} />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <QueryResponseDialog
        query={selectedQuery}
        open={responseDialogOpen}
        onOpenChange={setResponseDialogOpen}
        onSubmitResponse={handleSubmitResponse}
      />
    </div>
  );
};

export default Index;
