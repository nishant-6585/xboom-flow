import { useState } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSuppliers, Supplier } from '@/hooks/useSuppliers';
import { SupplierCard } from '@/components/SupplierCard';
import { SupplierForm } from '@/components/SupplierForm';
import { SupplierLedgerDialog } from '@/components/SupplierLedgerDialog';
import { Plus, Search, Loader2, Building2, Filter } from 'lucide-react';

export default function Suppliers() {
  const { suppliers, loading, createSupplier, updateSupplier } = useSuppliers();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [preferenceFilter, setPreferenceFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [ledgerSupplier, setLedgerSupplier] = useState<Supplier | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Get unique categories from suppliers
  const categories = [...new Set(suppliers.map(s => s.product_category))];

  // Filter suppliers
  const filteredSuppliers = suppliers.filter((supplier) => {
    const matchesSearch = 
      supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.brand_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.contact_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.city?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.products?.some(p => p.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesPreference = preferenceFilter === 'all' || supplier.preference === preferenceFilter;
    const matchesCategory = categoryFilter === 'all' || supplier.product_category === categoryFilter;

    return matchesSearch && matchesPreference && matchesCategory;
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
          <Button onClick={() => handleOpenForm()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Supplier
          </Button>
        </div>

        {/* Filters */}
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

        {/* Ledger Dialog */}
        <SupplierLedgerDialog
          supplier={ledgerSupplier}
          open={!!ledgerSupplier}
          onOpenChange={(open) => !open && setLedgerSupplier(null)}
        />
      </main>
    </div>
  );
}
