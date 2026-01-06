import { useState, useMemo, useRef } from "react";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { usePricelist, PricelistFormData } from "@/hooks/usePricelist";
import { useEnquiries } from "@/hooks/useEnquiries";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
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
  const { items, loading, createItem, updateItem, deleteItem, clearAndReplace } = usePricelist();
  const { createEnquiry } = useEnquiries();
  
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");
  
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [enquiryDialogOpen, setEnquiryDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [enquiryQuantity, setEnquiryQuantity] = useState(1);
  const [enquiryNotes, setEnquiryNotes] = useState("");
  
  const [formData, setFormData] = useState<PricelistFormData>({
    product_name: "",
    product_category: "Consumer Drones",
    brand: "",
    description: "",
    unit_price: undefined,
    cost_price: undefined,
    currency: "INR",
    availability: "In Stock",
    lead_time: "",
    notes: "",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canManage = role === "admin" || role === "supply_chain";

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.product_name.toLowerCase().includes(search.toLowerCase()) ||
        (item.brand?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
        (item.description?.toLowerCase().includes(search.toLowerCase()) ?? false);
      
      const matchesCategory = categoryFilter === "all" || item.product_category === categoryFilter;
      const matchesAvailability = availabilityFilter === "all" || item.availability === availabilityFilter;
      
      return matchesSearch && matchesCategory && matchesAvailability;
    });
  }, [items, search, categoryFilter, availabilityFilter]);

  const categories = useMemo(() => {
    const cats = new Set(items.map((i) => i.product_category).filter(Boolean));
    return Array.from(cats);
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
        product_name: row["Product Name"] || row["product_name"] || row["Name"] || "",
        product_category: row["Category"] || row["product_category"] || "Consumer Drones",
        brand: row["Brand"] || row["brand"] || "",
        description: row["Description"] || row["description"] || "",
        unit_price: parseFloat(row["Price"] || row["unit_price"] || row["Unit Price"] || row["Selling Price"] || 0) || undefined,
        cost_price: parseFloat(row["Cost Price"] || row["cost_price"] || row["Cost"] || 0) || undefined,
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
      currency: item.currency || "INR",
      availability: item.availability || "In Stock",
      lead_time: item.lead_time || "",
      notes: item.notes || "",
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
      currency: "INR",
      availability: "In Stock",
      lead_time: "",
      notes: "",
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
          {canManage && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAddDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
              <Button onClick={() => setUploadDialogOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Excel
              </Button>
            </div>
          )}
        </div>

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
              <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Availability" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {AVAILABILITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-pulse text-muted-foreground">Loading pricelist...</div>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Price</TableHead>
                      {canManage && <TableHead>Cost Price</TableHead>}
                      {canManage && <TableHead>Margin</TableHead>}
                      <TableHead>Lead Time</TableHead>
                      <TableHead>Availability</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={canManage ? 10 : 8} className="text-center py-8 text-muted-foreground">
                          No products found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.product_name}</p>
                              {item.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1">
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{item.product_category}</TableCell>
                          <TableCell>{item.brand || "-"}</TableCell>
                          <TableCell>
                            {item.unit_price ? (
                              <span className="font-medium">
                                {item.currency === "USD" ? "$" : "₹"}
                                {item.unit_price.toLocaleString()}
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
                              {item.unit_price && item.cost_price ? (
                                <span className={`font-medium ${
                                  ((item.unit_price - item.cost_price) / item.unit_price) * 100 >= 20 
                                    ? "text-green-600" 
                                    : ((item.unit_price - item.cost_price) / item.unit_price) * 100 >= 10 
                                      ? "text-yellow-600" 
                                      : "text-red-600"
                                }`}>
                                  {(((item.unit_price - item.cost_price) / item.unit_price) * 100).toFixed(1)}%
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
                          <TableCell className="text-right">
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
          </CardContent>
        </Card>

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
                  <Label>Selling Price</Label>
                  <Input
                    type="number"
                    value={formData.unit_price || ""}
                    onChange={(e) => setFormData({ ...formData, unit_price: parseFloat(e.target.value) || undefined })}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cost Price</Label>
                  <Input
                    type="number"
                    value={formData.cost_price || ""}
                    onChange={(e) => setFormData({ ...formData, cost_price: parseFloat(e.target.value) || undefined })}
                    placeholder="0"
                  />
                </div>
              </div>
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
    </div>
  );
}
