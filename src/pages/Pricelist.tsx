import { useState, useMemo, useRef } from "react";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { usePricelist, PricelistFormData } from "@/hooks/usePricelist";
import { useEnquiries } from "@/hooks/useEnquiries";
import { PricelistAnalytics, PriceFilterType } from "@/components/pricelist/PricelistAnalytics";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  Upload,
  FileSpreadsheet,
  Plus,
  MessageSquarePlus,
  Trash2,
  Edit,
  RefreshCw,
  BarChart3,
  List,
  Bot,
  ExternalLink,
  Globe,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { AISalesAssistant } from "@/components/AISalesAssistant";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const PRODUCT_CATEGORIES = [
  "Consumer Drones",
  "Enterprise Drones",
  "Agriculture Drones",
  "Accessories",
  "Batteries",
  "Payloads",
  "Software",
  "Services",
];

const AVAILABILITY_OPTIONS = ["In Stock", "Limited Stock", "Out of Stock", "Pre-Order", "On Request"];

export default function Pricelist() {
  const { user, profile, role, loading: authLoading } = useAuth();
  const { items, loading, createItem, updateItem, deleteItem, clearAndReplace, syncFromWebsite } = usePricelist();
  const { createEnquiry } = useEnquiries();
  
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilterType>("all");
  const [activeTab, setActiveTab] = useState<string>("products");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 70;
  
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [enquiryDialogOpen, setEnquiryDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [enquiryQuantity, setEnquiryQuantity] = useState(1);
  const [enquiryNotes, setEnquiryNotes] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  
  const [formData, setFormData] = useState<PricelistFormData>({
    product_name: "",
    product_category: "Consumer Drones",
    brand: "",
    description: "",
    unit_price: undefined,
    cost_price: undefined,
    website_price: undefined,
    dealer_price: undefined,
    currency: "INR",
    availability: "In Stock",
    lead_time: "",
    notes: "",
    marketing_collateral_url: "",
    marketing_collateral_name: "",
  });
  // weight_grams lives outside the shared reset defaults so we can leave
  // it undefined (rather than 0) to avoid overwriting existing values.

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canManage = role === "admin" || role === "supply_chain";
  const canSync = canManage || role === "sales";

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.product_name.toLowerCase().includes(search.toLowerCase()) ||
        (item.brand?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
        (item.description?.toLowerCase().includes(search.toLowerCase()) ?? false);
      
      const matchesCategory = categoryFilter === "all" || item.product_category === categoryFilter;
      
      const matchesBrand = brandFilter === "all" || 
        (brandFilter === "_blank" ? (!item.brand || item.brand.trim() === "") : item.brand === brandFilter);
      
      const matchesAvailability = availabilityFilter === "all" || 
        (availabilityFilter === "_blank" ? (!item.availability || item.availability.trim() === "") : item.availability === availabilityFilter);
      
      // Price filter logic
      let matchesPrice = true;
      if (priceFilter === "with_price") {
        matchesPrice = (item.website_price && item.website_price > 0) || (item.dealer_price && item.dealer_price > 0);
      } else if (priceFilter === "missing_price") {
        matchesPrice = !(item.website_price && item.website_price > 0) && !(item.dealer_price && item.dealer_price > 0);
      } else if (priceFilter === "website") {
        matchesPrice = !!(item.website_price && item.website_price > 0);
      } else if (priceFilter === "dealer") {
        matchesPrice = !!(item.dealer_price && item.dealer_price > 0);
      } else if (priceFilter === "cost") {
        matchesPrice = !!(item.cost_price && item.cost_price > 0);
      }
      
      return matchesSearch && matchesCategory && matchesBrand && matchesAvailability && matchesPrice;
    });
  }, [items, search, categoryFilter, brandFilter, availabilityFilter, priceFilter]);

  const sortedItems = useMemo(() => {
    if (!sortBy) return filteredItems;
    const dir = sortDir === "asc" ? 1 : -1;
    const getVal = (it: any) => {
      switch (sortBy) {
        case "product_name": return (it.product_name || "").toLowerCase();
        case "product_category": return (it.product_category || "").toLowerCase();
        case "brand": return (it.brand || "").toLowerCase();
        case "price": return it.unit_price ?? it.website_price ?? it.dealer_price ?? null;
        case "website_price": return it.website_price ?? null;
        case "dealer_price": return it.dealer_price ?? null;
        case "cost_price": return it.cost_price ?? null;
        case "margin":
          return it.dealer_price && it.cost_price
            ? ((it.dealer_price - it.cost_price) / it.dealer_price) * 100
            : null;
        case "availability": return (it.availability || "").toLowerCase();
        default: return null;
      }
    };
    return [...filteredItems].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      const aNull = av === null || av === undefined || av === "";
      const bNull = bv === null || bv === undefined || bv === "";
      if (aNull && bNull) return 0;
      if (aNull) return 1; // nulls last regardless of direction
      if (bNull) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filteredItems, sortBy, sortDir]);

  // Reset to page 1 when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, brandFilter, availabilityFilter, priceFilter, sortBy, sortDir]);

  const totalPages = Math.ceil(sortedItems.length / itemsPerPage);
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedItems.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedItems, currentPage, itemsPerPage]);

  const categories = useMemo(() => {
    const cats = new Set(items.map((i) => i.product_category).filter(Boolean));
    return Array.from(cats).sort();
  }, [items]);

  const brands = useMemo(() => {
    const brandSet = new Set(items.map((i) => i.brand).filter(Boolean) as string[]);
    return Array.from(brandSet).sort();
  }, [items]);

  if (authLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const parsedItems: PricelistFormData[] = jsonData.map((row: any) => ({
        product_name: row["Product Name"] || row["product_name"] || row["Product"] || row["Name"] || row["product"] || row["name"] || "",
        product_category: row["Category"] || row["product_category"] || row["Product Category"] || "Consumer Drones",
        brand: row["Brand"] || row["brand"] || "",
        description: row["Description"] || row["description"] || "",
        unit_price: parseFloat(row["Price"] || row["unit_price"] || row["Unit Price"] || row["Selling Price"] || 0) || undefined,
        cost_price: parseFloat(row["Cost Price"] || row["cost_price"] || row["Cost"] || 0) || undefined,
        website_price: parseFloat(row["Website Price"] || row["website_price"] || row["website price"] || 0) || undefined,
        dealer_price: parseFloat(row["Dealer Price"] || row["dealer_price"] || row["dealer price"] || 0) || undefined,
        currency: row["Currency"] || row["currency"] || "INR",
        availability: row["Availability"] || row["availability"] || "In Stock",
        lead_time: row["Lead Time"] || row["lead_time"] || "",
        notes: row["Notes"] || row["notes"] || "",
      })).filter((item: PricelistFormData) => item.product_name);

      if (parsedItems.length === 0) {
        toast.error("No valid products found in Excel file");
        return;
      }

      const success = await clearAndReplace(parsedItems);
      if (success) {
        setUploadDialogOpen(false);
      }
    } catch (error) {
      console.error("Error parsing Excel file:", error);
      toast.error("Failed to parse Excel file");
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSyncFromWebsite = async () => {
    setSyncing(true);
    try {
      await syncFromWebsite();
    } finally {
      setSyncing(false);
    }
  };

  const handleAddProduct = async () => {
    if (!formData.product_name) {
      toast.error("Product name is required");
      return;
    }

    const success = await createItem(formData);
    if (success) {
      setAddDialogOpen(false);
      resetForm();
    }
  };

  const handleEditProduct = async () => {
    if (!selectedItem || !formData.product_name) {
      toast.error("Product name is required");
      return;
    }

    const success = await updateItem(selectedItem.id, formData);
    if (success) {
      setEditDialogOpen(false);
      setSelectedItem(null);
      resetForm();
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm("Are you sure you want to delete this product?")) {
      await deleteItem(id);
    }
  };

  const handleRaiseEnquiry = async () => {
    if (!selectedItem || !profile) return;

    const success = await createEnquiry({
      productName: selectedItem.product_name,
      productCode: selectedItem.product_name,
      productCategory: selectedItem.product_category,
      quantity: enquiryQuantity,
      customerName: "Price Confirmation Request",
      customerCompany: "Internal Request",
      urgency: "medium",
      requestedTimeline: "",
      notes: `Price/Availability confirmation requested for: ${selectedItem.product_name}\n${selectedItem.brand ? `Brand: ${selectedItem.brand}\n` : ""}Listed Price: ${selectedItem.currency} ${selectedItem.unit_price?.toLocaleString() || "N/A"}\nListed Availability: ${selectedItem.availability}\n\nAdditional Notes: ${enquiryNotes}`,
    });

    if (success) {
      toast.success("Enquiry raised for price confirmation");
      setEnquiryDialogOpen(false);
      setSelectedItem(null);
      setEnquiryQuantity(1);
      setEnquiryNotes("");
    }
  };

  const openEditDialog = (item: any) => {
    setSelectedItem(item);
    setFormData({
      product_name: item.product_name,
      product_category: item.product_category,
      brand: item.brand || "",
      description: item.description || "",
      unit_price: item.unit_price || undefined,
      cost_price: item.cost_price || undefined,
      website_price: item.website_price || undefined,
      dealer_price: item.dealer_price || undefined,
      currency: item.currency || "INR",
      availability: item.availability || "In Stock",
      lead_time: item.lead_time || "",
      notes: item.notes || "",
      marketing_collateral_url: item.marketing_collateral_url || "",
      marketing_collateral_name: item.marketing_collateral_name || "",
      weight_grams: item.weight_grams ?? undefined,
    });
    setEditDialogOpen(true);
  };

  const openEnquiryDialog = (item: any) => {
    setSelectedItem(item);
    setEnquiryQuantity(1);
    setEnquiryDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      product_name: "",
      product_category: "Consumer Drones",
      brand: "",
      description: "",
      unit_price: undefined,
      cost_price: undefined,
      website_price: undefined,
      dealer_price: undefined,
      currency: "INR",
      availability: "In Stock",
      lead_time: "",
      notes: "",
      marketing_collateral_url: "",
      marketing_collateral_name: "",
      weight_grams: undefined,
    });
  };

  const getAvailabilityColor = (availability: string) => {
    switch (availability) {
      case "In Stock":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "Limited Stock":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "Out of Stock":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "Pre-Order":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const handleAnalyticsFilterClick = (filter: PriceFilterType, category?: string) => {
    setPriceFilter(filter);
    if (category) {
      setCategoryFilter(category);
    }
    setActiveTab("products");
  };

  const getPriceFilterLabel = (filter: PriceFilterType): string => {
    switch (filter) {
      case "with_price": return "With Price";
      case "missing_price": return "Missing Price";
      case "website": return "Website Price";
      case "dealer": return "Dealer Price";
      case "cost": return "Cost Price";
      default: return "";
    }
  };

  const toggleSort = (key: string) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ k }: { k: string }) => {
    if (sortBy !== k) return <ArrowUpDown className="w-3 h-3 opacity-50" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const SortableHead = ({ k, children, className }: { k: string; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {children}
        <SortIcon k={k} />
      </button>
    </TableHead>
  );

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-4 sm:py-6 flex-1 overflow-x-hidden">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Product Pricelist</h1>
            <p className="text-muted-foreground">
              View products, pricing and raise enquiries for confirmation
            </p>
          </div>
          {(canSync || canManage) && (
            <div className="flex gap-2">
              {canSync && (
                <Button variant="outline" onClick={handleSyncFromWebsite} disabled={syncing}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing..." : "Sync from Website"}
                </Button>
              )}
              {canManage && (
                <>
                  <Button variant="outline" onClick={() => setAddDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Product
                  </Button>
                  <Button onClick={() => setUploadDialogOpen(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Excel
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <List className="w-4 h-4" />
              Products
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="products" forceMount className="data-[state=inactive]:hidden mt-0 data-[state=active]:mt-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5" />
                  Products ({filteredItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by product name, brand, description..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={brandFilter} onValueChange={setBrandFilter}>
                    <SelectTrigger className="w-full sm:w-[150px]">
                      <SelectValue placeholder="Brand" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Brands</SelectItem>
                      <SelectItem value="_blank">— Blank —</SelectItem>
                      {brands.map((brand) => (
                        <SelectItem key={brand} value={brand}>
                          {brand}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
                    <SelectTrigger className="w-full sm:w-[150px]">
                      <SelectValue placeholder="Availability" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="_blank">— Blank —</SelectItem>
                      {AVAILABILITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Active price filter indicator */}
                {priceFilter !== "all" && (
                  <div className="flex items-center gap-2 mb-4">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      Price Filter: {getPriceFilterLabel(priceFilter)}
                      <button
                        onClick={() => setPriceFilter("all")}
                        className="ml-1 hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  </div>
                )}

                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="animate-pulse text-muted-foreground">Loading pricelist...</div>
                  </div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableHead k="product_name">Product</SortableHead>
                          <SortableHead k="product_category">Category</SortableHead>
                          <SortableHead k="brand">Brand</SortableHead>
                          <SortableHead k="price">Price</SortableHead>
                          <SortableHead k="website_price">Website Price</SortableHead>
                          <SortableHead k="dealer_price">Dealer Price</SortableHead>
                          {canManage && <SortableHead k="cost_price">Cost Price</SortableHead>}
                          {canManage && <SortableHead k="margin">Margin</SortableHead>}
                          <TableHead>Lead Time</TableHead>
                          <SortableHead k="availability">Availability</SortableHead>
                          <TableHead>Source</TableHead>
                          {canManage && <TableHead>Woo Stock</TableHead>}
                          <TableHead>Collateral</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={canManage ? 15 : 12} className="text-center py-8 text-muted-foreground">
                              No products found
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedItems.map((item) => (
                            <TableRow
                              key={item.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => {
                                setSelectedItem(item);
                                setDetailDialogOpen(true);
                              }}
                            >
                              <TableCell>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium">{item.product_name}</p>
                                    {item.woo_product_id && (
                                      <Badge
                                        variant="outline"
                                        className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1"
                                        title={
                                          item.website_synced_at
                                            ? `Synced from xboom.in on ${new Date(item.website_synced_at).toLocaleString()}`
                                            : "Synced from xboom.in"
                                        }
                                      >
                                        <Globe className="w-3 h-3" />
                                        Website
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>{item.product_category}</TableCell>
                              <TableCell>{item.brand || "-"}</TableCell>
                              <TableCell>
                                {(() => {
                                  const price = item.unit_price ?? item.website_price ?? item.dealer_price;
                                  if (!price) {
                                    return <span className="text-muted-foreground">On Request</span>;
                                  }
                                  return (
                                    <span className="font-semibold">
                                      {item.currency === "USD" ? "$" : "₹"}
                                      {price.toLocaleString()}
                                    </span>
                                  );
                                })()}
                              </TableCell>
                              <TableCell>
                                {item.website_price ? (
                                  <span className="font-medium">
                                    {item.currency === "USD" ? "$" : "₹"}
                                    {item.website_price.toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">On Request</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {item.dealer_price ? (
                                  <span className="font-medium">
                                    {item.currency === "USD" ? "$" : "₹"}
                                    {item.dealer_price.toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">On Request</span>
                                )}
                              </TableCell>
                              {canManage && (
                                <TableCell>
                                  {item.cost_price ? (
                                    <span className="font-medium text-muted-foreground">
                                      {item.currency === "USD" ? "$" : "₹"}
                                      {item.cost_price.toLocaleString()}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                              )}
                              {canManage && (
                                <TableCell>
                                  {item.dealer_price && item.cost_price ? (
                                    <span className={`font-medium ${
                                      ((item.dealer_price - item.cost_price) / item.dealer_price) * 100 >= 20 
                                        ? "text-green-600" 
                                        : ((item.dealer_price - item.cost_price) / item.dealer_price) * 100 >= 10 
                                          ? "text-yellow-600" 
                                          : "text-red-600"
                                    }`}>
                                      {(((item.dealer_price - item.cost_price) / item.dealer_price) * 100).toFixed(1)}%
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                              )}
                              <TableCell>{item.lead_time || "-"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={getAvailabilityColor(item.availability)}>
                                  {item.availability}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {item.woo_product_id || item.sync_source === 'woocommerce' ? (
                                  <Badge
                                    variant="outline"
                                    className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1"
                                    title={
                                      item.website_synced_at
                                        ? `Last synced ${new Date(item.website_synced_at).toLocaleString()}`
                                        : 'Synced from xboom.in'
                                    }
                                  >
                                    <Globe className="w-3 h-3" />
                                    Synced
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="bg-amber-500/10 text-amber-600 border-amber-500/20"
                                    title="Availability was set manually (Excel import or Add Product). Not verified against the website."
                                  >
                                    Manual
                                  </Badge>
                                )}
                              </TableCell>
                              {canManage && (
                                <TableCell>
                                  {item.woo_stock_status ? (
                                    <code className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                      {item.woo_stock_status}
                                    </code>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  )}
                                </TableCell>
                              )}
                              <TableCell>
                                {item.marketing_collateral_url ? (
                                  <a
                                    href={item.marketing_collateral_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-primary hover:underline text-sm"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    {item.marketing_collateral_name || "View"}
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground text-sm">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEnquiryDialog(item)}
                                    title="Raise Enquiry"
                                  >
                                    <MessageSquarePlus className="w-4 h-4" />
                                  </Button>
                                  {canManage && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openEditDialog(item)}
                                        title="Edit"
                                      >
                                        <Edit className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteProduct(item.id)}
                                        title="Delete"
                                        className="text-destructive hover:text-destructive"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Pagination Controls */}
                {filteredItems.length > itemsPerPage && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length} products
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                      >
                        First
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-sm px-3">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                      >
                        Last
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" forceMount className="data-[state=inactive]:hidden mt-0 data-[state=active]:mt-2">
            <PricelistAnalytics items={items} onFilterClick={handleAnalyticsFilterClick} />
          </TabsContent>
        </Tabs>

        {/* Upload Dialog */}
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Pricelist Excel</DialogTitle>
              <DialogDescription>
                Upload an Excel file to replace the current pricelist. Expected columns: Product Name, Category, Brand, Description, Price, Currency, Availability, Lead Time, Notes
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="excel-upload"
                />
                <label htmlFor="excel-upload">
                  <Button variant="outline" asChild>
                    <span className="cursor-pointer">
                      <Upload className="w-4 h-4 mr-2" />
                      Select Excel File
                    </span>
                  </Button>
                </label>
                <p className="text-xs text-muted-foreground mt-2">
                  This will replace all existing products
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add/Edit Product Dialog */}
        <Dialog open={addDialogOpen || editDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setAddDialogOpen(false);
            setEditDialogOpen(false);
            setSelectedItem(null);
            resetForm();
          }
        }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editDialogOpen ? "Edit Product" : "Add Product"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <Label>Product Name *</Label>
                <Input
                  value={formData.product_name}
                  onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                  placeholder="Enter product name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={formData.product_category}
                    onValueChange={(value) => setFormData({ ...formData, product_category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Brand</Label>
                  <Input
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="Brand name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Product description"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Website Price</Label>
                  <Input
                    type="number"
                    value={formData.website_price || ""}
                    onChange={(e) => setFormData({ ...formData, website_price: parseFloat(e.target.value) || undefined })}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Dealer Price</Label>
                  <Input
                    type="number"
                    value={formData.dealer_price || ""}
                    onChange={(e) => setFormData({ ...formData, dealer_price: parseFloat(e.target.value) || undefined })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cost Price</Label>
                  <Input
                    type="number"
                    value={formData.cost_price || ""}
                    onChange={(e) => setFormData({ ...formData, cost_price: parseFloat(e.target.value) || undefined })}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit Price (Legacy)</Label>
                  <Input
                    type="number"
                    value={formData.unit_price || ""}
                    onChange={(e) => setFormData({ ...formData, unit_price: parseFloat(e.target.value) || undefined })}
                    placeholder="0"
                  />
                </div>
              </div>
              {canManage && (
                <div className="space-y-2">
                  <Label>Weight (grams)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    value={formData.weight_grams ?? ""}
                    onChange={(e) => setFormData({
                      ...formData,
                      weight_grams: e.target.value === "" ? undefined : parseFloat(e.target.value),
                    })}
                    placeholder="e.g. 350"
                  />
                  <p className="text-xs text-muted-foreground">
                    Orders with any item over 249 g require customer confirmation before dispatch.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData({ ...formData, currency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Lead Time</Label>
                <Input
                  value={formData.lead_time || ""}
                  onChange={(e) => setFormData({ ...formData, lead_time: e.target.value })}
                  placeholder="e.g., 2-3 weeks, 7 days"
                />
              </div>
              <div className="space-y-2">
                <Label>Availability</Label>
                <Select
                  value={formData.availability}
                  onValueChange={(value) => setFormData({ ...formData, availability: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABILITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Marketing Collateral Name</Label>
                <Input
                  value={formData.marketing_collateral_name || ""}
                  onChange={(e) => setFormData({ ...formData, marketing_collateral_name: e.target.value })}
                  placeholder="e.g., Product Brochure, Datasheet"
                />
              </div>
              <div className="space-y-2">
                <Label>Marketing Collateral URL (Google Drive)</Label>
                <Input
                  value={formData.marketing_collateral_url || ""}
                  onChange={(e) => setFormData({ ...formData, marketing_collateral_url: e.target.value })}
                  placeholder="https://drive.google.com/..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setAddDialogOpen(false);
                setEditDialogOpen(false);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button onClick={editDialogOpen ? handleEditProduct : handleAddProduct}>
                {editDialogOpen ? "Save Changes" : "Add Product"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Raise Enquiry Dialog */}
        <Dialog open={enquiryDialogOpen} onOpenChange={setEnquiryDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Price Confirmation</DialogTitle>
              <DialogDescription>
                Raise an enquiry to the Supply Chain team for price and availability confirmation
              </DialogDescription>
            </DialogHeader>
            {selectedItem && (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="font-medium">{selectedItem.product_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedItem.product_category}</p>
                  {selectedItem.brand && (
                    <p className="text-sm text-muted-foreground">Brand: {selectedItem.brand}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-sm">
                      Listed Price:{" "}
                      <strong>
                        {selectedItem.currency === "USD" ? "$" : "₹"}
                        {selectedItem.unit_price?.toLocaleString() || "On Request"}
                      </strong>
                    </span>
                    <Badge variant="outline" className={getAvailabilityColor(selectedItem.availability)}>
                      {selectedItem.availability}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Quantity Required</Label>
                  <Input
                    type="number"
                    value={enquiryQuantity}
                    onChange={(e) => setEnquiryQuantity(parseInt(e.target.value) || 1)}
                    min={1}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Additional Notes</Label>
                  <Textarea
                    value={enquiryNotes}
                    onChange={(e) => setEnquiryNotes(e.target.value)}
                    placeholder="Any specific requirements or questions..."
                    rows={3}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEnquiryDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleRaiseEnquiry}>
                <MessageSquarePlus className="w-4 h-4 mr-2" />
                Raise Enquiry
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>

      {/* Product details dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <span>{selectedItem.product_name}</span>
                  {(selectedItem.woo_product_id || selectedItem.sync_source === "woocommerce") && (
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1">
                      <Globe className="w-3 h-3" /> Website
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {selectedItem.product_category}
                  {selectedItem.brand ? ` • ${selectedItem.brand}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  ["Price", selectedItem.unit_price],
                  ["Website Price", selectedItem.website_price],
                  ["Dealer Price", selectedItem.dealer_price],
                  ...(canManage ? [["Cost Price", selectedItem.cost_price] as const] : []),
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="text-muted-foreground">{label}</p>
                    <p className="font-medium">
                      {value
                        ? `${selectedItem.currency === "USD" ? "$" : "₹"}${Number(value).toLocaleString()}`
                        : "On Request"}
                    </p>
                  </div>
                ))}
                {canManage && selectedItem.dealer_price && selectedItem.cost_price && (
                  <div>
                    <p className="text-muted-foreground">Margin</p>
                    <p className="font-medium">
                      {(((selectedItem.dealer_price - selectedItem.cost_price) / selectedItem.dealer_price) * 100).toFixed(1)}%
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Lead Time</p>
                  <p className="font-medium">{selectedItem.lead_time || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Availability</p>
                  <Badge variant="outline" className={getAvailabilityColor(selectedItem.availability)}>
                    {selectedItem.availability}
                  </Badge>
                </div>
                {canManage && selectedItem.woo_stock_status && (
                  <div>
                    <p className="text-muted-foreground">Woo Stock</p>
                    <code className="text-xs px-1.5 py-0.5 rounded bg-muted">{selectedItem.woo_stock_status}</code>
                  </div>
                )}
                {selectedItem.website_synced_at && (
                  <div>
                    <p className="text-muted-foreground">Last Synced</p>
                    <p className="font-medium">{new Date(selectedItem.website_synced_at).toLocaleString()}</p>
                  </div>
                )}
              </div>

              {selectedItem.description && (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">Description</p>
                  <p className="whitespace-pre-wrap">{selectedItem.description}</p>
                </div>
              )}

              {selectedItem.marketing_collateral_url && (
                <a
                  href={selectedItem.marketing_collateral_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline text-sm"
                >
                  <ExternalLink className="w-3 h-3" />
                  {selectedItem.marketing_collateral_name || "View collateral"}
                </a>
              )}

              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDetailDialogOpen(false);
                    openEnquiryDialog(selectedItem);
                  }}
                >
                  <MessageSquarePlus className="w-4 h-4 mr-1" /> Raise Enquiry
                </Button>
                {canManage && (
                  <Button
                    onClick={() => {
                      setDetailDialogOpen(false);
                      openEditDialog(selectedItem);
                    }}
                  >
                    <Edit className="w-4 h-4 mr-1" /> Edit
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* AI Sales Assistant Floating Button */}
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
