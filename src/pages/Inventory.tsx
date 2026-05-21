import { useState } from 'react';
import { Header } from '@/components/Header';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useInventory, InventoryItem, TRANSACTION_TYPES } from '@/hooks/useInventory';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, Plus, Search, ArrowUpCircle, ArrowDownCircle, RotateCcw, Settings, Loader2, AlertTriangle, History, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { PRODUCT_CATEGORIES } from '@/hooks/useEnquiries';
import { ProductSelect } from '@/components/ProductSelect';
import { PricelistItem } from '@/hooks/usePricelist';
import { DemandForecastWidget } from '@/components/inventory/DemandForecastWidget';

function InventoryContent() {
  const { role } = useAuth();
  const [txnPage, setTxnPage] = useState(1);
  const TXN_PAGE_SIZE = 50;
  const {
    inventory,
    transactions,
    loading,
    canManage,
    createInventoryItem,
    adjustStock,
    addStockFromProcurement,
    fetchTransactions,
  } = useInventory();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [transactionType, setTransactionType] = useState<'procurement_in' | 'adjustment'>('procurement_in');
  
  // Form states
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('Consumer Drones');
  const [newMinStock, setNewMinStock] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [transactionQty, setTransactionQty] = useState('');
  const [transactionNotes, setTransactionNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleProductSelect = (productName: string, product?: PricelistItem) => {
    setNewProductName(productName);
    if (product?.product_category) {
      setNewProductCategory(product.product_category);
    }
  };

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.product_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || item.product_category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const lowStockItems = inventory.filter(i => i.current_stock <= i.min_stock_level);
  const totalItems = inventory.length;
  const totalStock = inventory.reduce((sum, i) => sum + i.current_stock, 0);

  const handleAddItem = async () => {
    if (!newProductName.trim()) return;
    setSaving(true);
    const result = await createInventoryItem({
      product_name: newProductName,
      product_category: newProductCategory,
      min_stock_level: parseInt(newMinStock) || 0,
      notes: newNotes || undefined,
    });
    setSaving(false);
    if (result) {
      setShowAddDialog(false);
      setNewProductName('');
      setNewProductCategory('Consumer Drones');
      setNewMinStock('');
      setNewNotes('');
    }
  };

  const handleTransaction = async () => {
    if (!selectedItem || !transactionQty) return;
    setSaving(true);
    
    const qty = parseInt(transactionQty);
    let success = false;
    
    if (transactionType === 'procurement_in') {
      success = await addStockFromProcurement(
        selectedItem.product_name,
        selectedItem.product_category,
        qty,
        transactionNotes
      );
    } else {
      success = await adjustStock(selectedItem.id, qty, transactionNotes);
    }
    
    setSaving(false);
    if (success) {
      setShowTransactionDialog(false);
      setSelectedItem(null);
      setTransactionQty('');
      setTransactionNotes('');
    }
  };

  const openTransactionDialog = (item: InventoryItem, type: 'procurement_in' | 'adjustment') => {
    setSelectedItem(item);
    setTransactionType(type);
    setShowTransactionDialog(true);
    fetchTransactions(item.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{totalItems}</p>
                <p className="text-sm text-muted-foreground">Total Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ArrowUpCircle className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{totalStock}</p>
                <p className="text-sm text-muted-foreground">Total Units in Stock</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">{lowStockItems.length}</p>
                <p className="text-sm text-muted-foreground">Low Stock Alerts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <History className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{transactions.length}</p>
                <p className="text-sm text-muted-foreground">Recent Transactions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="inventory" className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <TabsList>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="low-stock">Low Stock Alerts</TabsTrigger>
            <TabsTrigger value="forecast">Demand Forecast</TabsTrigger>
          </TabsList>

          {canManage && (
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Inventory Item</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Product Name *</Label>
                    <ProductSelect
                      value={newProductName}
                      onChange={handleProductSelect}
                      placeholder="Select or type product..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={newProductCategory} onValueChange={setNewProductCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCT_CATEGORIES.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Minimum Stock Level</Label>
                    <Input
                      type="number"
                      min={0}
                      value={newMinStock}
                      onChange={(e) => setNewMinStock(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      placeholder="Optional notes"
                      rows={2}
                    />
                  </div>
                  <Button onClick={handleAddItem} disabled={saving || !newProductName.trim()} className="w-full">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Add Item
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {PRODUCT_CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Inventory Tab */}
        <TabsContent value="inventory">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-center">Current Stock</TableHead>
                    <TableHead className="text-center">Min Level</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 6 : 5} className="text-center py-8 text-muted-foreground">
                        No inventory items found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInventory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.product_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.product_category}</Badge>
                        </TableCell>
                        <TableCell className="text-center font-bold">{item.current_stock}</TableCell>
                        <TableCell className="text-center text-muted-foreground">{item.min_stock_level}</TableCell>
                        <TableCell>
                          {item.current_stock <= item.min_stock_level ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Low Stock
                            </Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                              In Stock
                            </Badge>
                          )}
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openTransactionDialog(item, 'procurement_in')}
                              >
                                <ArrowUpCircle className="h-4 w-4 mr-1" />
                                Add Stock
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openTransactionDialog(item, 'adjustment')}
                              >
                                <Settings className="h-4 w-4 mr-1" />
                                Adjust
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Transactions</CardTitle>
              <CardDescription>Stock movements across all inventory items</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">Quantity</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No transactions recorded
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions
                      .slice((txnPage - 1) * TXN_PAGE_SIZE, txnPage * TXN_PAGE_SIZE)
                      .map((txn) => {
                      const typeInfo = TRANSACTION_TYPES.find(t => t.value === txn.transaction_type);
                      return (
                        <TableRow key={txn.id}>
                          <TableCell>{format(new Date(txn.created_at), 'dd MMM yyyy HH:mm')}</TableCell>
                          <TableCell>
                            <Badge className={typeInfo?.color}>{typeInfo?.label}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={txn.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                              {txn.quantity > 0 ? '+' : ''}{txn.quantity}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{txn.notes || '-'}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
            {transactions.length > TXN_PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
                <span className="text-muted-foreground">
                  Showing {(txnPage - 1) * TXN_PAGE_SIZE + 1}–{Math.min(txnPage * TXN_PAGE_SIZE, transactions.length)} of {transactions.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={txnPage === 1} onClick={() => setTxnPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span>Page {txnPage} of {Math.ceil(transactions.length / TXN_PAGE_SIZE)}</span>
                  <Button variant="outline" size="sm" disabled={txnPage * TXN_PAGE_SIZE >= transactions.length} onClick={() => setTxnPage(p => p + 1)}>
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Low Stock Tab */}
        <TabsContent value="low-stock">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                Low Stock Alerts
              </CardTitle>
              <CardDescription>Items that need restocking</CardDescription>
            </CardHeader>
            <CardContent>
              {lowStockItems.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">All items are adequately stocked</p>
              ) : (
                <div className="space-y-3">
                  {lowStockItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/10 rounded-lg border border-orange-200 dark:border-orange-900/30">
                      <div>
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-muted-foreground">{item.product_category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-orange-600">{item.current_stock} units</p>
                        <p className="text-xs text-muted-foreground">Min: {item.min_stock_level}</p>
                      </div>
                      {canManage && (
                        <Button
                          size="sm"
                          onClick={() => openTransactionDialog(item, 'procurement_in')}
                        >
                          Restock
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Demand Forecast Tab */}
        <TabsContent value="forecast">
          <DemandForecastWidget />
        </TabsContent>
      </Tabs>

      {/* Transaction Dialog */}
      <Dialog open={showTransactionDialog} onOpenChange={setShowTransactionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {transactionType === 'procurement_in' ? 'Add Stock' : 'Adjust Stock'} - {selectedItem?.product_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Current Stock</p>
              <p className="text-2xl font-bold">{selectedItem?.current_stock} units</p>
            </div>
            <div className="space-y-2">
              <Label>
                {transactionType === 'procurement_in' ? 'Quantity to Add' : 'Adjustment (+/-)'}
              </Label>
              <Input
                type="number"
                value={transactionQty}
                onChange={(e) => setTransactionQty(e.target.value)}
                placeholder={transactionType === 'procurement_in' ? '10' : '+5 or -3'}
              />
              {transactionType === 'adjustment' && (
                <p className="text-xs text-muted-foreground">
                  Use positive numbers to add, negative to subtract
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={transactionNotes}
                onChange={(e) => setTransactionNotes(e.target.value)}
                placeholder="Reason for this transaction..."
                rows={2}
              />
            </div>
            <Button onClick={handleTransaction} disabled={saving || !transactionQty} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {transactionType === 'procurement_in' ? 'Add to Stock' : 'Record Adjustment'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Inventory() {
  return (
    <ProtectedRoute>
      <div className="min-h-[100dvh] bg-background flex flex-col">
        <Header />
        <main className="container mx-auto px-4 py-4 sm:py-8 flex-1 overflow-x-hidden">
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold">Inventory Management</h1>
            <p className="text-muted-foreground">Track stock levels and movements</p>
          </div>
          <InventoryContent />
        </main>
      </div>
    </ProtectedRoute>
  );
}