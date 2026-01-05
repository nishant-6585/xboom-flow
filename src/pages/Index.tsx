import { useState } from "react";
import { Header } from "@/components/Header";
import { QueryForm } from "@/components/QueryForm";
import { EnquiryCard } from "@/components/EnquiryCard";
import { EnquiryTable } from "@/components/EnquiryTable";
import { EnquiryConversionAnalytics } from "@/components/EnquiryConversionAnalytics";
import { StatsCards } from "@/components/StatsCards";
import { SlaStatsCards } from "@/components/SlaStatsCards";
import { SalesStatsCards } from "@/components/SalesStatsCards";
import { EnquiryDialog } from "@/components/EnquiryDialog";
import { useEnquiries, Enquiry, PRODUCT_CATEGORIES } from "@/hooks/useEnquiries";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, PlusCircle, Loader2, Package, Filter, TableIcon, LayoutGrid, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  const { enquiries, loading, createEnquiry, updateEnquiry, deleteEnquiry, escalateEnquiry, updateOutcome } = useEnquiries();
  const { role, user } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");

  const canCreateEnquiry = role === "sales" || role === "admin";
  const canViewSlaStats = role === "supply_chain" || role === "admin";
  const isSales = role === "sales";
  const isAdmin = role === "admin";

  // Filter enquiries by category
  const filteredEnquiries = categoryFilter === "all"
    ? enquiries
    : enquiries.filter((e) => e.product_category === categoryFilter);

  // Filter enquiries for sales user to show only their own
  const salesUserEnquiries = isSales && user
    ? filteredEnquiries.filter((e) => e.sales_person_id === user.id)
    : filteredEnquiries;
  
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

  // Sales user's own enquiries for their stats
  const salesStatsQueries = salesUserEnquiries.map((e) => ({
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
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="enquiries" className="gap-2">
              <TableIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Enquiries</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
            {canCreateEnquiry && (
              <TabsTrigger value="new" className="gap-2">
                <PlusCircle className="w-4 h-4" />
                <span className="hidden sm:inline">New Enquiry</span>
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
                {canViewSlaStats && <SlaStatsCards queries={statsQueries} />}
                {(isSales || isAdmin) && <SalesStatsCards queries={isAdmin ? statsQueries : salesStatsQueries} />}

                {/* Category Filter */}
                <div className="flex items-center gap-3">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[250px]">
                      <SelectValue placeholder="Filter by category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {PRODUCT_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {categoryFilter !== "all" && (
                    <span className="text-sm text-muted-foreground">
                      Showing {filteredEnquiries.length} of {enquiries.length} enquiries
                    </span>
                  )}
                </div>

                {filteredEnquiries.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      {enquiries.length === 0 ? "No enquiries yet" : "No enquiries in this category"}
                    </p>
                    {canCreateEnquiry && enquiries.length === 0 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Click "New Enquiry" to create one
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredEnquiries.slice(0, 6).map((enquiry) => (
                      <EnquiryCard
                        key={enquiry.id}
                        enquiry={enquiry}
                        onClick={() => handleEnquiryClick(enquiry)}
                      />
                    ))}
                  </div>
                )}
                {filteredEnquiries.length > 6 && (
                  <div className="text-center">
                    <Button variant="outline" onClick={() => setActiveTab("enquiries")}>
                      View All {filteredEnquiries.length} Enquiries
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="enquiries" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* Filters and View Toggle */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-[250px]">
                        <SelectValue placeholder="Filter by category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {PRODUCT_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {categoryFilter !== "all" && (
                      <span className="text-sm text-muted-foreground">
                        {filteredEnquiries.length} of {enquiries.length}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={viewMode === "table" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setViewMode("table")}
                    >
                      <TableIcon className="w-4 h-4 mr-1" />
                      Table
                    </Button>
                    <Button
                      variant={viewMode === "cards" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setViewMode("cards")}
                    >
                      <LayoutGrid className="w-4 h-4 mr-1" />
                      Cards
                    </Button>
                  </div>
                </div>

                {filteredEnquiries.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      {enquiries.length === 0 ? "No enquiries yet" : "No enquiries in this category"}
                    </p>
                  </div>
                ) : viewMode === "table" ? (
                  <EnquiryTable
                    enquiries={filteredEnquiries}
                    onUpdateOutcome={updateOutcome}
                    onEnquiryClick={handleEnquiryClick}
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredEnquiries.map((enquiry) => (
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

          <TabsContent value="analytics" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <EnquiryConversionAnalytics enquiries={isSales && user ? salesUserEnquiries : enquiries} />
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
        onEscalate={escalateEnquiry}
      />
    </div>
  );
};

export default Index;
