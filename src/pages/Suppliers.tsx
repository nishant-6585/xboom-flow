import { useState, useRef } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSuppliers, Supplier, SupplierPreference } from '@/hooks/useSuppliers';
import { useAuth } from '@/hooks/useAuth';
import { SupplierCard } from '@/components/SupplierCard';
import { SupplierTable } from '@/components/SupplierTable';
import { SupplierForm } from '@/components/SupplierForm';
import { SupplierLedgerDialog } from '@/components/SupplierLedgerDialog';
import { SupplierAnalytics } from '@/components/SupplierAnalytics';
import { Plus, Search, Loader2, Building2, Filter, Upload, FileSpreadsheet, Download, X, BarChart3, LayoutGrid, TableIcon, Truck } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { CourierPartnersDialog } from '@/components/CourierPartnersDialog';

export default function Suppliers() {
  const { role } = useAuth();
  const { suppliers, loading, createSupplier, bulkImportSuppliers, updateSupplier } = useSuppliers();
  
  const canManage = role === 'admin' || role === 'supply_chain';
  const canView = role === 'admin' || role === 'supply_chain' || role === 'finance';
  
  const [searchQuery, setSearchQuery] = useState('');
  const [preferenceFilter, setPreferenceFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<{ type: string; value: string } | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [courierDialogOpen, setCourierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [ledgerSupplier, setLedgerSupplier] = useState<Supplier | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get unique categories from suppliers
  const categories = [...new Set(suppliers.map(s => s.product_category))];

  // Filter suppliers
  const filteredSuppliers = suppliers.filter((supplier) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      (supplier.name?.toLowerCase().includes(query) ?? false) ||
      supplier.brand_name?.toLowerCase().includes(query) ||
      (supplier.contact_name?.toLowerCase().includes(query) ?? false) ||
      supplier.city?.toLowerCase().includes(query) ||
      (supplier.product_category?.toLowerCase().includes(query) ?? false) ||
      supplier.products?.some(p => p.toLowerCase().includes(query));
    
    const matchesPreference = preferenceFilter === 'all' || supplier.preference === preferenceFilter;
    const matchesCategory = categoryFilter === 'all' || supplier.product_category === categoryFilter;

    // Analytics filter
    let matchesAnalyticsFilter = true;
    if (activeFilter) {
      switch (activeFilter.type) {
        case 'category':
          matchesAnalyticsFilter = supplier.product_category === activeFilter.value || 
            (activeFilter.value === 'Uncategorized' && !supplier.product_category);
          break;
        case 'brand':
          matchesAnalyticsFilter = supplier.brand_name === activeFilter.value || 
            (activeFilter.value === 'No Brand' && !supplier.brand_name);
          break;
        case 'city':
          matchesAnalyticsFilter = supplier.city === activeFilter.value || 
            (activeFilter.value === 'Unknown' && !supplier.city);
          break;
        case 'product':
          matchesAnalyticsFilter = supplier.products?.includes(activeFilter.value) || false;
          break;
      }
    }

    return matchesSearch && matchesPreference && matchesCategory && matchesAnalyticsFilter;
  });

  const handleOpenForm = (supplier?: Supplier) => {
    setEditingSupplier(supplier || null);
    setFormDialogOpen(true);
  };

  const handleSubmitForm = async (data: Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
    setFormLoading(true);
    let success: boolean;

    if (editingSupplier) {
      success = await updateSupplier(editingSupplier.id, data);
    } else {
      success = await createSupplier(data);
    }

    setFormLoading(false);
    return success;
  };

  const handleCloseForm = () => {
    setFormDialogOpen(false);
    setEditingSupplier(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const parsedSuppliers = jsonData.map((row: any) => ({
        name: row['Supplier Name'] || row['name'] || row['Name'] || row['Company'] || row['company'] || '',
        brand_name: row['Brand Name'] || row['brand_name'] || row['Brand'] || row['brand'] || null,
        gst_number: row['GST Number'] || row['gst_number'] || row['GST'] || row['gst'] || null,
        contact_name: row['Contact Name'] || row['contact_name'] || row['Contact'] || row['contact'] || row['Contact Person'] || '',
        phone: row['Phone'] || row['phone'] || row['Telephone'] || null,
        mobile: row['Mobile'] || row['mobile'] || row['Cell'] || row['cell'] || null,
        email: row['Email'] || row['email'] || row['E-mail'] || null,
        city: row['City'] || row['city'] || null,
        address: row['Address'] || row['address'] || null,
        bank_name: row['Bank Name'] || row['bank_name'] || row['Bank'] || null,
        bank_account_number: row['Account Number'] || row['bank_account_number'] || row['Account No'] || null,
        bank_ifsc: row['IFSC'] || row['bank_ifsc'] || row['IFSC Code'] || null,
        bank_account_holder: row['Account Holder'] || row['bank_account_holder'] || null,
        product_category: row['Product Category'] || row['product_category'] || row['Category'] || 'Consumer Drones',
        products: row['Products'] || row['products'] ? 
          (typeof (row['Products'] || row['products']) === 'string' 
            ? (row['Products'] || row['products']).split(',').map((p: string) => p.trim()).filter(Boolean)
            : null) 
          : null,
        preference: (['high', 'medium', 'low'].includes((row['Preference'] || row['preference'] || '').toLowerCase()) 
          ? (row['Preference'] || row['preference']).toLowerCase() 
          : 'medium') as SupplierPreference,
        status: row['Status'] || row['status'] || 'active',
        notes: row['Notes'] || row['notes'] || null,
        is_active: row['Active'] === false || row['is_active'] === false ? false : true,
      })).filter((item: any) => item.name && item.contact_name);

      if (parsedSuppliers.length === 0) {
        toast.error('No valid suppliers found in Excel file. Ensure "Supplier Name" and "Contact Name" columns exist.');
        setImportLoading(false);
        return;
      }

      const success = await bulkImportSuppliers(parsedSuppliers);
      if (success) {
        setImportDialogOpen(false);
      }
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      toast.error('Failed to parse Excel file');
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        'Supplier Name': 'Example Supplier',
        'Brand Name': 'Example Brand',
        'GST Number': '22AAAAA0000A1Z5',
        'Contact Name': 'John Doe',
        'Phone': '+91 9876543210',
        'Mobile': '+91 9876543211',
        'Email': 'supplier@example.com',
        'City': 'Mumbai',
        'Address': '123 Business Park',
        'Bank Name': 'State Bank',
        'Account Number': '1234567890',
        'IFSC': 'SBIN0001234',
        'Account Holder': 'Example Supplier Pvt Ltd',
        'Product Category': 'Consumer Drones',
        'Products': 'Product 1, Product 2, Product 3',
        'Preference': 'high',
        'Status': 'active',
        'Notes': 'Sample notes',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Suppliers');
    XLSX.writeFile(wb, 'suppliers_import_template.xlsx');
    toast.success('Template downloaded');
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-4 sm:py-8 flex-1 overflow-x-hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Building2 className="h-8 w-8" />
              Suppliers
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage supplier information and track payments
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant={showAnalytics ? "default" : "outline"} 
              size="sm"
              onClick={() => setShowAnalytics(!showAnalytics)}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </Button>
            {canView && (
              <Button variant="outline" size="sm" onClick={() => setCourierDialogOpen(true)}>
                <Truck className="h-4 w-4 mr-2" />
                Courier Partners
              </Button>
            )}
            {canManage && (
              <>
                <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Excel
                </Button>
                <Button size="sm" onClick={() => handleOpenForm()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Supplier
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Analytics Section */}
        {showAnalytics && !loading && suppliers.length > 0 && (
          <div className="mb-6">
            <SupplierAnalytics
              suppliers={suppliers}
              activeFilter={activeFilter}
              onFilterByCategory={(category) => {
                if (activeFilter?.type === 'category' && activeFilter?.value === category) {
                  setActiveFilter(null);
                } else {
                  setActiveFilter({ type: 'category', value: category });
                }
              }}
              onFilterByBrand={(brand) => {
                if (activeFilter?.type === 'brand' && activeFilter?.value === brand) {
                  setActiveFilter(null);
                } else {
                  setActiveFilter({ type: 'brand', value: brand });
                }
              }}
              onFilterByCity={(city) => {
                if (activeFilter?.type === 'city' && activeFilter?.value === city) {
                  setActiveFilter(null);
                } else {
                  setActiveFilter({ type: 'city', value: city });
                }
              }}
              onFilterByProduct={(product) => {
                if (activeFilter?.type === 'product' && activeFilter?.value === product) {
                  setActiveFilter(null);
                } else {
                  setActiveFilter({ type: 'product', value: product });
                }
              }}
            />
          </div>
        )}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search suppliers, brands, contacts, products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Select value={preferenceFilter} onValueChange={setPreferenceFilter}>
                  <SelectTrigger className="w-[160px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="high">High Priority</SelectItem>
                    <SelectItem value="medium">Medium Priority</SelectItem>
                    <SelectItem value="low">Low Priority</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeFilter && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setActiveFilter(null)}
                    className="text-muted-foreground"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear: {activeFilter.value}
                  </Button>
                )}
                <div className="flex border rounded-md">
                  <Button
                    variant={viewMode === 'card' ? 'default' : 'ghost'}
                    size="icon"
                    className="rounded-r-none"
                    onClick={() => setViewMode('card')}
                    title="Card View"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'table' ? 'default' : 'ghost'}
                    size="icon"
                    className="rounded-l-none"
                    onClick={() => setViewMode('table')}
                    title="Table View"
                  >
                    <TableIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Supplier List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">
                  {suppliers.length === 0 ? 'No suppliers yet' : 'No matching suppliers'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {suppliers.length === 0
                    ? 'Add your first supplier to get started'
                    : 'Try adjusting your filters'}
                </p>
                {suppliers.length === 0 && (
                  <Button onClick={() => handleOpenForm()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Supplier
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : viewMode === 'table' ? (
          <SupplierTable
            suppliers={filteredSuppliers}
            onEdit={handleOpenForm}
            onViewLedger={setLedgerSupplier}
          />
        ) : (
          <div className="space-y-4">
            {filteredSuppliers.map((supplier) => (
              <SupplierCard
                key={supplier.id}
                supplier={supplier}
                onEdit={handleOpenForm}
                onViewLedger={setLedgerSupplier}
              />
            ))}
          </div>
        )}

        {/* Form Dialog */}
        <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
              </DialogTitle>
              <DialogDescription>
                {editingSupplier
                  ? 'Update supplier information'
                  : 'Enter supplier details including contact and bank information'}
              </DialogDescription>
            </DialogHeader>
            <SupplierForm
              initialData={editingSupplier || undefined}
              onSubmit={handleSubmitForm}
              onCancel={handleCloseForm}
              isLoading={formLoading}
            />
          </DialogContent>
        </Dialog>

        {/* Import Dialog */}
        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Import Suppliers
              </DialogTitle>
              <DialogDescription>
                Upload an Excel file to bulk import suppliers. Download the template for the correct format.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Required columns: <strong>Supplier Name</strong>, <strong>Contact Name</strong>
                </p>
                <p className="text-sm text-muted-foreground">
                  Optional columns: Brand Name, GST Number, Phone, Mobile, Email, City, Address, Bank Name, Account Number, IFSC, Account Holder, Product Category, Products (comma-separated), Preference, Status, Notes
                </p>
              </div>
              <Button variant="outline" onClick={downloadTemplate} className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
              <div className="border-t pt-4">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="w-full"
                  disabled={importLoading}
                >
                  {importLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Select Excel File
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Ledger Dialog */}
        <SupplierLedgerDialog
          supplier={ledgerSupplier}
          open={!!ledgerSupplier}
          onOpenChange={(open) => !open && setLedgerSupplier(null)}
        />

        {/* Courier Partners Dialog */}
        <CourierPartnersDialog
          open={courierDialogOpen}
          onOpenChange={setCourierDialogOpen}
          canManage={canManage}
        />
      </main>
    </div>
  );
}
