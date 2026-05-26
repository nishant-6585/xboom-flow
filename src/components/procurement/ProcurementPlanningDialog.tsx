import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Check, Trash2, Building2, Phone, Package, Star } from 'lucide-react';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useSupplierQuotations, SupplierQuotation } from '@/hooks/useSupplierQuotations';
import { useSupplierScores } from '@/hooks/useSupplierRatings';
import { SupplierPreferenceTag } from './SupplierPreferenceTag';
import { SupplierScoreBadge } from './SupplierScoreBadge';

interface ProcurementPlanningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: string;
    order_number: string | null;
    product_name: string;
    product_category: string | null;
    quantity: number;
    customer_company: string;
  };
  orderItem?: {
    id: string;
    product_name: string;
    product_category: string | null;
    quantity: number;
  };
  onSupplierSelected?: (supplierId: string, quotation: SupplierQuotation) => void;
}

export const ProcurementPlanningDialog: React.FC<ProcurementPlanningDialogProps> = ({
  open,
  onOpenChange,
  order,
  orderItem,
  onSupplierSelected
}) => {
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const { quotations, loading: quotationsLoading, createQuotation, selectQuotation, deleteQuotation } = 
    useSupplierQuotations(order.id, orderItem?.id);

  const [showAddQuotation, setShowAddQuotation] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [quantity, setQuantity] = useState(orderItem?.quantity?.toString() || order.quantity?.toString() || '1');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [leadTime, setLeadTime] = useState('');
  const [validityDate, setValidityDate] = useState('');
  const [notes, setNotes] = useState('');

  // Filter suppliers by product category
  const productCategory = orderItem?.product_category || order.product_category || '';
  const productName = orderItem?.product_name || order.product_name || '';

  const matchingSuppliers = suppliers.filter(supplier => {
    // Match by category
    const categoryMatch = supplier.product_category?.toLowerCase() === productCategory?.toLowerCase();
    
    // Match by product in products array (defensive: products may be a string from older cache)
    const productsArr = Array.isArray(supplier.products)
      ? supplier.products
      : typeof supplier.products === 'string'
        ? (supplier.products as string).split(',').map((p) => p.trim()).filter(Boolean)
        : [];
    const productMatch = productsArr.some(p =>
      p.toLowerCase().includes(productName.toLowerCase()) ||
      productName.toLowerCase().includes(p.toLowerCase())
    );

    return categoryMatch || productMatch;
  });

  // Get supplier IDs for score fetching
  const supplierIds = useMemo(() => matchingSuppliers.map(s => s.id), [matchingSuppliers]);
  const { scores: supplierScores } = useSupplierScores(supplierIds);

  // Sort suppliers by preference and score
  const sortedSuppliers = [...matchingSuppliers].sort((a, b) => {
    const prefOrder = { high: 0, medium: 1, low: 2 };
    const prefDiff = prefOrder[a.preference] - prefOrder[b.preference];
    if (prefDiff !== 0) return prefDiff;
    
    // If same preference, sort by score
    const scoreA = supplierScores[a.id]?.overall_score || 0;
    const scoreB = supplierScores[b.id]?.overall_score || 0;
    return scoreB - scoreA;
  });

  // Suppliers already quoted
  const quotedSupplierIds = quotations.map(q => q.supplier_id);
  const availableSuppliers = sortedSuppliers.filter(s => !quotedSupplierIds.includes(s.id));

  const handleAddQuotation = async () => {
    if (!selectedSupplierId || !unitPrice) {
      return;
    }

    const success = await createQuotation({
      order_id: order.id,
      order_item_id: orderItem?.id || null,
      supplier_id: selectedSupplierId,
      unit_price: parseFloat(unitPrice),
      quantity: parseInt(quantity) || 1,
      payment_terms: paymentTerms || null,
      lead_time: leadTime || null,
      validity_date: validityDate || null,
      notes: notes || null,
      is_selected: false,
      quoted_by: null
    });

    if (success) {
      setShowAddQuotation(false);
      resetForm();
    }
  };

  const handleSelectQuotation = async (quotation: SupplierQuotation) => {
    const success = await selectQuotation(quotation.id, order.id, orderItem?.id);
    if (success && onSupplierSelected) {
      onSupplierSelected(quotation.supplier_id, quotation);
    }
  };

  const resetForm = () => {
    setSelectedSupplierId('');
    setUnitPrice('');
    setQuantity(orderItem?.quantity?.toString() || order.quantity?.toString() || '1');
    setPaymentTerms('');
    setLeadTime('');
    setValidityDate('');
    setNotes('');
  };

  const selectedQuotation = quotations.find(q => q.is_selected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Procurement Planning - {order.order_number || 'Order'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Order/Item Info */}
          <Card className="mb-4">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Product:</span>
                  <p className="font-medium">{orderItem?.product_name || order.product_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Category:</span>
                  <p className="font-medium">{orderItem?.product_category || order.product_category}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Quantity:</span>
                  <p className="font-medium">{orderItem?.quantity || order.quantity}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Customer:</span>
                  <p className="font-medium">{order.customer_company}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100%-120px)]">
            {/* Matching Suppliers */}
            <Card className="flex flex-col">
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Matching Suppliers ({sortedSuppliers.length})</span>
                  <Badge variant="outline" className="text-xs">
                    By Category: {productCategory}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0">
                <ScrollArea className="h-[300px]">
                  {sortedSuppliers.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      No suppliers found for this category
                    </div>
                  ) : (
                    <div className="space-y-2 p-4">
                      {sortedSuppliers.map(supplier => (
                        <div 
                          key={supplier.id} 
                          className={`p-3 border rounded-lg ${
                            quotedSupplierIds.includes(supplier.id) 
                              ? 'bg-muted/50 border-primary/30' 
                              : 'hover:bg-muted/30'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium truncate">{supplier.name}</span>
                                <SupplierPreferenceTag preference={supplier.preference} />
                                <SupplierScoreBadge score={supplierScores[supplier.id]} size="sm" />
                                {quotedSupplierIds.includes(supplier.id) && (
                                  <Badge variant="secondary" className="text-xs">Quoted</Badge>
                                )}
                              </div>
                              {supplier.brand_name && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Brand: {supplier.brand_name}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Building2 className="h-3 w-3" />
                                  {supplier.contact_name}
                                </span>
                                {supplier.mobile && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {supplier.mobile}
                                  </span>
                                )}
                              </div>
                            </div>
                            {!quotedSupplierIds.includes(supplier.id) && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  setSelectedSupplierId(supplier.id);
                                  setShowAddQuotation(true);
                                }}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Quote
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Quotations Comparison */}
            <Card className="flex flex-col">
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Quotation Comparison ({quotations.length})</span>
                  {selectedQuotation && (
                    <Badge className="bg-green-500 text-white">
                      Selected: {selectedQuotation.supplier?.name}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-0">
                <ScrollArea className="h-[300px]">
                  {quotations.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      No quotations added yet. Add quotations from matching suppliers.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Supplier</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Terms</TableHead>
                          <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {quotations.map((quotation, index) => (
                          <TableRow 
                            key={quotation.id}
                            className={quotation.is_selected ? 'bg-green-500/10' : ''}
                          >
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">{quotation.supplier?.name}</span>
                                  {index === 0 && (
                                    <Badge variant="secondary" className="text-xs bg-amber-500 text-white">
                                      Lowest
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {quotation.supplier && (
                                    <>
                                      <SupplierPreferenceTag 
                                        preference={quotation.supplier.preference} 
                                        size="sm" 
                                      />
                                      <SupplierScoreBadge 
                                        score={supplierScores[quotation.supplier.id]} 
                                        size="sm" 
                                      />
                                    </>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              ₹{quotation.unit_price.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium">
                              ₹{(quotation.total_amount || 0).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <div className="text-xs space-y-0.5">
                                {quotation.payment_terms && (
                                  <p>Pay: {quotation.payment_terms}</p>
                                )}
                                {quotation.lead_time && (
                                  <p>Lead: {quotation.lead_time}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {!quotation.is_selected && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-100"
                                    onClick={() => handleSelectQuotation(quotation)}
                                    title="Select this supplier"
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => deleteQuotation(quotation.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Add Quotation Form */}
        {showAddQuotation && (
          <>
            <Separator className="my-4" />
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">
                  Add Quotation from {suppliers.find(s => s.id === selectedSupplierId)?.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label>Unit Price (₹) *</Label>
                    <Input
                      type="number"
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(e.target.value)}
                      placeholder="Enter price"
                    />
                  </div>
                  <div>
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Payment Terms</Label>
                    <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select terms" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="advance">100% Advance</SelectItem>
                        <SelectItem value="50_advance">50% Advance</SelectItem>
                        <SelectItem value="cod">Cash on Delivery</SelectItem>
                        <SelectItem value="net_7">Net 7 Days</SelectItem>
                        <SelectItem value="net_15">Net 15 Days</SelectItem>
                        <SelectItem value="net_30">Net 30 Days</SelectItem>
                        <SelectItem value="net_45">Net 45 Days</SelectItem>
                        <SelectItem value="net_60">Net 60 Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Lead Time</Label>
                    <Input
                      value={leadTime}
                      onChange={(e) => setLeadTime(e.target.value)}
                      placeholder="e.g., 5-7 days"
                    />
                  </div>
                  <div>
                    <Label>Validity Date</Label>
                    <Input
                      type="date"
                      value={validityDate}
                      onChange={(e) => setValidityDate(e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-3">
                    <Label>Notes</Label>
                    <Input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any additional notes..."
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={() => { setShowAddQuotation(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddQuotation} disabled={!unitPrice}>
                    Add Quotation
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
