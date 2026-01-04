import { useState } from "react";
import { Header } from "@/components/Header";
import { QueryForm } from "@/components/QueryForm";
import { EnquiryCard } from "@/components/EnquiryCard";
import { StatsCards } from "@/components/StatsCards";
import { SlaStatsCards } from "@/components/SlaStatsCards";
import { EnquiryDialog } from "@/components/EnquiryDialog";
import { useEnquiries, Enquiry } from "@/hooks/useEnquiries";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList, PlusCircle, Loader2, Package } from "lucide-react";

const Index = () => {
  const { enquiries, loading, createEnquiry, updateEnquiry, deleteEnquiry } = useEnquiries();
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const canCreateEnquiry = role === "sales" || role === "admin";

  const handleEnquiryClick = (enquiry: Enquiry) => {
    setSelectedEnquiry(enquiry);
    setDialogOpen(true);
  };

  const handleSubmitEnquiry = async (data: Parameters<typeof createEnquiry>[0]) => {
    const success = await createEnquiry(data);
    if (success) {
      setActiveTab("dashboard");
    }
    return success;
  };

  // Convert enquiries to the format expected by stats components
  const statsQueries = enquiries.map((e) => ({
    id: e.id,
    productName: e.product_name,
    productCode: e.product_code,
    quantity: e.quantity,
    customerName: e.customer_name,
    customerCompany: e.customer_company,
    salesPerson: e.sales_person_name,
    urgency: e.urgency as "low" | "medium" | "high" | "critical",
    notes: e.notes,
    status: e.status as "pending" | "in_review" | "confirmed" | "rejected",
    createdAt: new Date(e.created_at),
    updatedAt: new Date(e.updated_at),
    response: e.response_pricing
      ? {
          pricing: e.response_pricing || undefined,
          availability: e.response_availability || undefined,
          leadTime: e.response_lead_time || undefined,
        }
      : undefined,
  }));

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
            {canCreateEnquiry && (
              <TabsTrigger value="new" className="gap-2">
                <PlusCircle className="w-4 h-4" />
                New Enquiry
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <StatsCards queries={statsQueries} />
                <SlaStatsCards queries={statsQueries} />

                {enquiries.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No enquiries yet</p>
                    {canCreateEnquiry && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Click "New Enquiry" to create one
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {enquiries.map((enquiry) => (
                      <EnquiryCard
                        key={enquiry.id}
                        enquiry={enquiry}
                        onClick={() => handleEnquiryClick(enquiry)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {canCreateEnquiry && (
            <TabsContent value="new">
              <div className="max-w-2xl">
                <QueryForm onSubmit={handleSubmitEnquiry} />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </main>

      <EnquiryDialog
        enquiry={selectedEnquiry}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmitResponse={updateEnquiry}
        onDelete={deleteEnquiry}
      />
    </div>
  );
};

export default Index;
