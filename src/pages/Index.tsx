import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { QueryForm } from "@/components/QueryForm";
import { EnquiryCard } from "@/components/EnquiryCard";
import { EnquiryTable } from "@/components/EnquiryTable";
import { EnquiryConversionAnalytics } from "@/components/EnquiryConversionAnalytics";
import { StatsCards } from "@/components/StatsCards";
import { KeyMetricsDashboard } from "@/components/KeyMetricsDashboard";
import { KeyMetricsTrendChart } from "@/components/KeyMetricsTrendChart";
import { QuickActions } from "@/components/QuickActions";
import { EnquiryDialog } from "@/components/EnquiryDialog";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { HotLeadsWidget } from "@/components/HotLeadsWidget";
import { LeadTemperatureAnalytics } from "@/components/LeadTemperatureAnalytics";
import { DashboardNoticesWidget } from "@/components/notices/DashboardNoticesWidget";
import { TopSellingProducts } from "@/components/admin/TopSellingProducts";
import { NoticePopup } from "@/components/notices/NoticePopup";
import { MonthlyPulseWidget } from "@/components/dashboard/MonthlyPulseWidget";
import { MonthlyPulsePopup } from "@/components/dashboard/MonthlyPulsePopup";
import { HolidayCalendarWidget } from "@/components/dashboard/HolidayCalendarWidget";
import { HolidayPopup } from "@/components/dashboard/HolidayPopup";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FollowupCallbackWidget } from "@/components/dashboard/FollowupCallbackWidget";
import { HRPendingApprovalsWidget } from "@/components/dashboard/HRPendingApprovalsWidget";
import { OnLeaveTodayWidget } from "@/components/dashboard/OnLeaveTodayWidget";
import { BirthdayCard } from "@/components/dashboard/BirthdayCard";
import {
  useEnquiries,
  Enquiry,
  PRODUCT_CATEGORIES,
  QueryStatus,
  ENQUIRY_STATUSES,
  LostReason,
} from "@/hooks/useEnquiries";
import { usePipelineOrders } from "@/hooks/usePipelineOrders";
import { getSlaStatus, UrgencyLevel } from "@/lib/sla";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ClipboardList,
  PlusCircle,
  Loader2,
  Package,
  Filter,
  TableIcon,
  LayoutGrid,
  BarChart3,
  User,
  ListFilter,
  X,
  IndianRupee,
  Flame,
  Thermometer,
  Snowflake,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeadTemperature } from "@/hooks/useEnquiries";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { startOfDay, endOfDay, isWithinInterval, startOfMonth, startOfWeek, format } from "date-fns";

interface SalesTeamMember {
  user_id: string;
  name: string;
}

const Index = () => {
  const {
    enquiries,
    loading,
    createEnquiry,
    updateEnquiry,
    deleteEnquiry,
    escalateEnquiry,
    updateStatus,
    submitAdminResponse,
    updateLeadTemperature,
    toggleMegaDeal,
    updateFollowupNote,
  } = useEnquiries();
  const { pipelineOrders } = usePipelineOrders();
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>("all");
  const [salesTeam, setSalesTeam] = useState<SalesTeamMember[]>([]);
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<QueryStatus | "all">("all");
  const [lostReasonFilter, setLostReasonFilter] = useState<LostReason | null>(null);
  const [slaStatusFilter, setSlaStatusFilter] = useState<string>("all");
  const [valueFilter, setValueFilter] = useState<string>("all");
  const [valueFilterDate, setValueFilterDate] = useState<Date | null>(null);
  const [leadFilter, setLeadFilter] = useState<"all" | LeadTemperature | "mega">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [appliedSearch, setAppliedSearch] = useState<string>("");
  const [topStartDate, setTopStartDate] = useState<Date | undefined>(undefined);
  const [topEndDate, setTopEndDate] = useState<Date | undefined>(undefined);
  const clearTopDateFilter = () => {
    setTopStartDate(undefined);
    setTopEndDate(undefined);
  };

  // Handle URL params for value filter from Admin analytics
  useEffect(() => {
    const urlValueFilter = searchParams.get("valueFilter");
    const urlValueDate = searchParams.get("valueDate");

    if (urlValueFilter) {
      setValueFilter(urlValueFilter);
      if (urlValueDate) {
        setValueFilterDate(new Date(urlValueDate));
      }
      setActiveTab("enquiries");
      // Clear params after applying
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  // Fetch sales team for filter dropdown (admin/supply_chain/finance only)
  useEffect(() => {
    const fetchSalesTeam = async () => {
      if (role === "admin" || role === "supply_chain" || role === "finance") {
        const { data } = await supabase.rpc("get_sales_team");
        if (data) {
          setSalesTeam(data);
        }
      }
    };
    fetchSalesTeam();
  }, [role]);

  const canCreateEnquiry = role === "sales" || role === "admin";
  const isSales = role === "sales";
  const isAdmin = role === "admin";
  const isFinance = role === "finance";

  const canFilterBySalesPerson = role === "admin" || role === "supply_chain" || role === "finance";

  // Filter enquiries by category, date, sales person, status, lost reason, SLA status, value filter, and lead filter
  const filteredEnquiries = useMemo(() => {
    return enquiries.filter((e) => {
      const matchesCategory = categoryFilter === "all" || e.product_category === categoryFilter;
      const matchesSalesPerson = salesPersonFilter === "all" || e.sales_person_id === salesPersonFilter;
      const matchesStatus = statusFilter === "all" || e.status === statusFilter;
      const matchesLostReason = !lostReasonFilter || e.lost_reason === lostReasonFilter;

      const enquiryDate = new Date(e.created_at);
      let matchesDate = true;
      if (startDate && endDate) {
        matchesDate = isWithinInterval(enquiryDate, { start: startOfDay(startDate), end: endOfDay(endDate) });
      } else if (startDate) {
        matchesDate = enquiryDate >= startOfDay(startDate);
      } else if (endDate) {
        matchesDate = enquiryDate <= endOfDay(endDate);
      }

      // SLA status filter
      let matchesSlaStatus = true;
      if (slaStatusFilter !== "all") {
        const isResponded = e.status !== "pending";
        const respondedAt = isResponded ? new Date(e.updated_at) : null;
        const slaStatus = getSlaStatus(new Date(e.created_at), respondedAt, e.urgency as UrgencyLevel, isResponded);
        matchesSlaStatus = slaStatus === slaStatusFilter;
      }

      // Value period filter
      let matchesValueFilter = true;
      if (valueFilter !== "all") {
        const now = new Date();
        if (valueFilter === "mtd") {
          matchesValueFilter = isWithinInterval(enquiryDate, { start: startOfMonth(now), end: now });
        } else if (valueFilter === "wtd") {
          matchesValueFilter = isWithinInterval(enquiryDate, {
            start: startOfWeek(now, { weekStartsOn: 1 }),
            end: now,
          });
        } else if (valueFilter === "today") {
          const todayStart = startOfDay(now);
          matchesValueFilter = startOfDay(enquiryDate).getTime() === todayStart.getTime();
        } else if (valueFilter === "specific_day" && valueFilterDate) {
          const filterDayStart = startOfDay(valueFilterDate);
          matchesValueFilter = startOfDay(enquiryDate).getTime() === filterDayStart.getTime();
        }
      }

      // Lead temperature / mega deal filter
      let matchesLead = true;
      if (leadFilter === "hot") matchesLead = e.lead_temperature === "hot";
      else if (leadFilter === "warm") matchesLead = e.lead_temperature === "warm";
      else if (leadFilter === "cold") matchesLead = e.lead_temperature === "cold";
      else if (leadFilter === "mega") matchesLead = e.is_mega_deal === true;

      // Free-text search across common fields
      let matchesSearch = true;
      const q = appliedSearch.trim().toLowerCase();
      if (q) {
        const haystack = [
          e.customer_name,
          e.customer_company,
          e.product_name,
          e.product_code,
          e.product_category,
          e.sales_person_name,
          e.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        matchesSearch = haystack.includes(q);
      }

      return (
        matchesCategory &&
        matchesDate &&
        matchesSalesPerson &&
        matchesStatus &&
        matchesLostReason &&
        matchesSlaStatus &&
        matchesValueFilter &&
        matchesLead &&
        matchesSearch
      );
    });
  }, [
    enquiries,
    categoryFilter,
    salesPersonFilter,
    statusFilter,
    lostReasonFilter,
    startDate,
    endDate,
    slaStatusFilter,
    valueFilter,
    valueFilterDate,
    leadFilter,
    appliedSearch,
  ]);

  const clearDateFilter = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  // Filter enquiries for sales user to show only their own
  const salesUserEnquiries =
    isSales && user ? filteredEnquiries.filter((e) => e.sales_person_id === user.id) : filteredEnquiries;

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

  // Handler for analytics card/chart clicks - navigates to list with filter
  const handleAnalyticsStatusClick = (status: QueryStatus | "all") => {
    setStatusFilter(status);
    setLostReasonFilter(null); // Clear lost reason filter when status changes
    setActiveTab("dashboard");
  };

  const handleAnalyticsLostReasonClick = (reason: LostReason) => {
    setStatusFilter("order_lost");
    setLostReasonFilter(reason);
    setActiveTab("dashboard");
  };

  const handleSlaStatusClick = (status: string) => {
    setSlaStatusFilter(status);
    setActiveTab("dashboard");
  };

  const getValueFilterLabel = (filter: string): string => {
    switch (filter) {
      case "mtd":
        return "Month to Date";
      case "wtd":
        return "Week to Date";
      case "today":
        return "Today";
      case "specific_day":
        return valueFilterDate ? format(valueFilterDate, "MMM dd") : "Specific Day";
      default:
        return "";
    }
  };

  const clearValueFilter = () => {
    setValueFilter("all");
    setValueFilterDate(null);
  };

  const getSlaStatusLabel = (status: string): string => {
    switch (status) {
      case "met":
        return "SLA Met";
      case "delayed":
        return "Delayed";
      case "at_risk":
        return "At Risk";
      case "breached":
        return "SLA Breached";
      default:
        return "";
    }
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
    status: e.status,
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
    status: e.status,
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

  // Handler for stats card clicks - shows filtered data
  const handleStatsClick = (status: QueryStatus | "all") => {
    setActiveTab("enquiries");
    // The filtering will be handled by a new state
    setStatusFilter(status);
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Header />

      <main className="container mx-auto px-4 py-6 sm:py-8 flex-1 overflow-x-hidden">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Xboom OS Dashboard</h2>
          <p className="text-muted-foreground">
            Track daily operations across Sales, Supply Chain, and Finance for customer delight
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
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-4">
                    <QuickActions />
                    <HRPendingApprovalsWidget />
                    <FollowupCallbackWidget />
                  </div>
                  <div>
                    <DashboardNoticesWidget />
                    <div className="mt-4">
                      <BirthdayCard />
                    </div>
                    <div className="mt-4">
                      <OnLeaveTodayWidget />
                    </div>
                    <div className="mt-4">
                      <MonthlyPulseWidget />
                    </div>
                    <div className="mt-4">
                      <HolidayCalendarWidget />
                    </div>
                  </div>
                </div>
                <HotLeadsWidget
                  enquiries={enquiries.map((e) => ({
                    id: e.id,
                    customer_name: e.customer_name,
                    customer_company: e.customer_company,
                    product_name: e.product_name,
                    quantity: e.quantity,
                    lead_temperature: e.lead_temperature,
                    is_mega_deal: e.is_mega_deal,
                    created_at: e.created_at,
                    status: e.status,
                    type: "enquiry" as const,
                  }))}
                  pipelineOrders={pipelineOrders.map((p) => ({
                    id: p.id,
                    customer_name: p.customer_name,
                    customer_company: p.customer_company,
                    product_name: p.product_name,
                    quantity: p.quantity,
                    lead_temperature: p.lead_temperature,
                    is_mega_deal: p.is_mega_deal,
                    created_at: p.created_at,
                    status: p.status,
                    type: "pipeline" as const,
                  }))}
                  onLeadClick={(lead) => {
                    if (lead.type === "enquiry") {
                      const enquiry = enquiries.find((e) => e.id === lead.id);
                      if (enquiry) handleEnquiryClick(enquiry);
                    } else if (lead.type === "pipeline") {
                      // Navigate to Sales page with Pipeline tab and the specific lead ID
                      navigate(`/sales?tab=pipeline&leadId=${lead.id}`);
                    }
                  }}
                  onViewAll={() => setActiveTab("enquiries")}
                />
                <StatsCards queries={statsQueries} onStatusClick={handleStatsClick} />
                <KeyMetricsDashboard />
                <KeyMetricsTrendChart />
                {isAdmin && (
                  <TopSellingProducts
                    startDate={topStartDate}
                    endDate={topEndDate}
                    onStartDateChange={setTopStartDate}
                    onEndDateChange={setTopEndDate}
                    onClear={clearTopDateFilter}
                  />
                )}
                {/* Category and Date Filters */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="flex items-center gap-3">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-[200px]">
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
                  </div>
                  <DateRangeFilter
                    startDate={startDate}
                    endDate={endDate}
                    onStartDateChange={setStartDate}
                    onEndDateChange={setEndDate}
                    onClear={clearDateFilter}
                  />
                  {(categoryFilter !== "all" || startDate || endDate) && (
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
                      <p className="text-sm text-muted-foreground mt-2">Click "New Enquiry" to create one</p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredEnquiries.slice(0, 6).map((enquiry) => (
                      <EnquiryCard key={enquiry.id} enquiry={enquiry} onClick={() => handleEnquiryClick(enquiry)} />
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
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <form
                      className="flex items-center gap-2 w-full sm:w-auto"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setAppliedSearch(searchQuery);
                      }}
                    >
                      <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="search"
                          placeholder="Search enquiries..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-8 pr-8"
                        />
                        {(searchQuery || appliedSearch) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSearchQuery("");
                              setAppliedSearch("");
                            }}
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                            aria-label="Clear search"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <Button type="submit" size="sm" variant="default">
                        <Search className="h-4 w-4 mr-1" />
                        Search
                      </Button>
                    </form>
                    <div className="flex items-center gap-3">
                      <Filter className="w-4 h-4 text-muted-foreground" />
                      <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger className="w-[200px]">
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
                    </div>
                    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as QueryStatus | "all")}>
                      <SelectTrigger className="w-[160px]">
                        <ListFilter className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {ENQUIRY_STATUSES.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {canFilterBySalesPerson && (
                      <Select value={salesPersonFilter} onValueChange={setSalesPersonFilter}>
                        <SelectTrigger className="w-[180px]">
                          <User className="h-4 w-4 mr-2" />
                          <SelectValue placeholder="Sales Person" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sales Persons</SelectItem>
                          {salesTeam.map((member) => (
                            <SelectItem key={member.user_id} value={member.user_id}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Select value={leadFilter} onValueChange={(value) => setLeadFilter(value as typeof leadFilter)}>
                      <SelectTrigger className="w-[150px]">
                        <Flame className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Lead Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Leads</SelectItem>
                        <SelectItem value="hot">
                          <div className="flex items-center gap-2">
                            <Flame className="h-3.5 w-3.5 text-orange-500" />
                            Hot Leads
                          </div>
                        </SelectItem>
                        <SelectItem value="warm">
                          <div className="flex items-center gap-2">
                            <Thermometer className="h-3.5 w-3.5 text-yellow-500" />
                            Warm Leads
                          </div>
                        </SelectItem>
                        <SelectItem value="cold">
                          <div className="flex items-center gap-2">
                            <Snowflake className="h-3.5 w-3.5 text-blue-500" />
                            Cold Leads
                          </div>
                        </SelectItem>
                        <SelectItem value="mega">
                          <div className="flex items-center gap-2">
                            <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                            Mega Deals
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <DateRangeFilter
                      startDate={startDate}
                      endDate={endDate}
                      onStartDateChange={setStartDate}
                      onEndDateChange={setEndDate}
                      onClear={clearDateFilter}
                    />
                    {lostReasonFilter && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-destructive/10 border border-destructive/20 rounded-md text-sm">
                        <span className="text-destructive font-medium">Lost: {lostReasonFilter}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLostReasonFilter(null)}
                          className="h-5 w-5 p-0 hover:bg-destructive/20"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {slaStatusFilter !== "all" && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 border border-primary/20 rounded-md text-sm">
                        <span className="text-primary font-medium">SLA: {getSlaStatusLabel(slaStatusFilter)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSlaStatusFilter("all")}
                          className="h-5 w-5 p-0 hover:bg-primary/20"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {valueFilter !== "all" && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-success/10 border border-success/20 rounded-md text-sm">
                        <IndianRupee className="h-3 w-3 text-success" />
                        <span className="text-success font-medium">{getValueFilterLabel(valueFilter)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearValueFilter}
                          className="h-5 w-5 p-0 hover:bg-success/20"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {leadFilter !== "all" && (
                      <div
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-sm ${
                          leadFilter === "hot"
                            ? "bg-orange-500/10 border border-orange-500/20"
                            : leadFilter === "warm"
                              ? "bg-yellow-500/10 border border-yellow-500/20"
                              : leadFilter === "cold"
                                ? "bg-blue-500/10 border border-blue-500/20"
                                : "bg-amber-500/10 border border-amber-500/20"
                        }`}
                      >
                        {leadFilter === "hot" && <Flame className="h-3 w-3 text-orange-500" />}
                        {leadFilter === "warm" && <Thermometer className="h-3 w-3 text-yellow-500" />}
                        {leadFilter === "cold" && <Snowflake className="h-3 w-3 text-blue-500" />}
                        {leadFilter === "mega" && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                        <span
                          className={`font-medium ${
                            leadFilter === "hot"
                              ? "text-orange-600"
                              : leadFilter === "warm"
                                ? "text-yellow-600"
                                : leadFilter === "cold"
                                  ? "text-blue-600"
                                  : "text-amber-600"
                          }`}
                        >
                          {leadFilter === "hot"
                            ? "Hot"
                            : leadFilter === "warm"
                              ? "Warm"
                              : leadFilter === "cold"
                                ? "Cold"
                                : "Mega"}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLeadFilter("all")}
                          className="h-5 w-5 p-0 hover:bg-muted"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {(categoryFilter !== "all" ||
                      startDate ||
                      endDate ||
                      salesPersonFilter !== "all" ||
                      statusFilter !== "all" ||
                      lostReasonFilter ||
                      slaStatusFilter !== "all" ||
                      valueFilter !== "all" ||
                      leadFilter !== "all") && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {filteredEnquiries.length} of {enquiries.length}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCategoryFilter("all");
                            setSalesPersonFilter("all");
                            setStatusFilter("all");
                            setLostReasonFilter(null);
                            setSlaStatusFilter("all");
                            setLeadFilter("all");
                            clearValueFilter();
                            clearDateFilter();
                          }}
                          className="h-6 px-2 text-xs"
                        >
                          <X className="h-3 w-3 mr-1" />
                          Clear
                        </Button>
                      </div>
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
                    onUpdateStatus={updateStatus}
                    onEnquiryClick={handleEnquiryClick}
                    onUpdateTemperature={updateLeadTemperature}
                    onToggleMegaDeal={toggleMegaDeal}
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredEnquiries.map((enquiry) => (
                      <EnquiryCard key={enquiry.id} enquiry={enquiry} onClick={() => handleEnquiryClick(enquiry)} />
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
              <>
                <EnquiryConversionAnalytics
                  enquiries={isSales && user ? salesUserEnquiries : enquiries}
                  onStatusClick={handleAnalyticsStatusClick}
                  onLostReasonClick={handleAnalyticsLostReasonClick}
                />
                <LeadTemperatureAnalytics
                  enquiries={(isSales && user ? salesUserEnquiries : enquiries).map((e) => ({
                    id: e.id,
                    lead_temperature: e.lead_temperature,
                    is_mega_deal: e.is_mega_deal,
                    status: e.status,
                    created_at: e.created_at,
                  }))}
                  pipelineOrders={pipelineOrders.map((p) => ({
                    id: p.id,
                    lead_temperature: p.lead_temperature,
                    is_mega_deal: p.is_mega_deal,
                    status: p.status,
                    created_at: p.created_at,
                  }))}
                  onFilterClick={(filter) => {
                    setLeadFilter(filter);
                    setActiveTab("enquiries");
                  }}
                />
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
        onEscalate={escalateEnquiry}
        onSubmitAdminResponse={submitAdminResponse}
        onUpdateFollowupNote={updateFollowupNote}
      />

      {/* Notice popup on login */}
      <ErrorBoundary fallback={null}><NoticePopup /></ErrorBoundary>
      <ErrorBoundary fallback={null}><MonthlyPulsePopup /></ErrorBoundary>
      <ErrorBoundary fallback={null}><HolidayPopup /></ErrorBoundary>
    </div>
  );
};

export default Index;
