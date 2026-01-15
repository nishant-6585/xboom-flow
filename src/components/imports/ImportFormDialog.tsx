import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSuppliers } from "@/hooks/useSuppliers";
import { Import, IMPORT_STATUSES, PAYMENT_STATUSES, SHIPPING_METHODS } from "@/hooks/useImports";
import { Package, Building2, Ship, FileText, CreditCard, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Omit<Import, 'id' | 'created_at' | 'updated_at'>) => Promise<any>;
  editingImport?: Import | null;
}

const STEPS = [
  { id: 1, title: 'Product', icon: Package },
  { id: 2, title: 'Supplier', icon: Building2 },
  { id: 3, title: 'Shipping', icon: Ship },
  { id: 4, title: 'Documents', icon: FileText },
  { id: 5, title: 'Payment', icon: CreditCard },
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CNY', 'AED'];

export function ImportFormDialog({
  open,
  onOpenChange,
  onSubmit,
  editingImport,
}: ImportFormDialogProps) {
  const { suppliers } = useSuppliers();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    import_number: '',
    supplier_id: '',
    supplier_name: '',
    product_name: '',
    product_category: '',
    quantity: 1,
    unit_price: 0,
    total_amount: 0,
    currency: 'USD',
    origin_country: '',
    port_of_origin: '',
    port_of_destination: '',
    shipping_method: '',
    shipping_line: '',
    container_number: '',
    bl_number: '',
    order_date: '',
    expected_arrival: '',
    actual_arrival: '',
    clearance_date: '',
    status: 'pending' as string,
    po_document_url: '',
    payment_proof_url: '',
    courier_document_url: '',
    bill_of_entry_url: '',
    packing_list_url: '',
    commercial_invoice_url: '',
    other_documents_urls: [] as string[],
    payment_status: 'pending' as string,
    payment_amount: 0,
    payment_date: '',
    notes: '',
    created_by: null as string | null,
    created_by_name: null as string | null,
  });

  useEffect(() => {
    if (editingImport) {
      setFormData({
        import_number: editingImport.import_number || '',
        supplier_id: editingImport.supplier_id || '',
        supplier_name: editingImport.supplier_name || '',
        product_name: editingImport.product_name || '',
        product_category: editingImport.product_category || '',
        quantity: editingImport.quantity || 1,
        unit_price: editingImport.unit_price || 0,
        total_amount: editingImport.total_amount || 0,
        currency: editingImport.currency || 'USD',
        origin_country: editingImport.origin_country || '',
        port_of_origin: editingImport.port_of_origin || '',
        port_of_destination: editingImport.port_of_destination || '',
        shipping_method: editingImport.shipping_method || '',
        shipping_line: editingImport.shipping_line || '',
        container_number: editingImport.container_number || '',
        bl_number: editingImport.bl_number || '',
        order_date: editingImport.order_date || '',
        expected_arrival: editingImport.expected_arrival || '',
        actual_arrival: editingImport.actual_arrival || '',
        clearance_date: editingImport.clearance_date || '',
        status: editingImport.status || 'pending',
        po_document_url: editingImport.po_document_url || '',
        payment_proof_url: editingImport.payment_proof_url || '',
        courier_document_url: editingImport.courier_document_url || '',
        bill_of_entry_url: editingImport.bill_of_entry_url || '',
        packing_list_url: editingImport.packing_list_url || '',
        commercial_invoice_url: editingImport.commercial_invoice_url || '',
        other_documents_urls: editingImport.other_documents_urls || [],
        payment_status: editingImport.payment_status || 'pending',
        payment_amount: editingImport.payment_amount || 0,
        payment_date: editingImport.payment_date || '',
        notes: editingImport.notes || '',
        created_by: editingImport.created_by,
        created_by_name: editingImport.created_by_name,
      });
    } else {
      resetForm();
    }
  }, [editingImport, open]);

  const resetForm = () => {
    setFormData({
      import_number: '',
      supplier_id: '',
      supplier_name: '',
      product_name: '',
      product_category: '',
      quantity: 1,
      unit_price: 0,
      total_amount: 0,
      currency: 'USD',
      origin_country: '',
      port_of_origin: '',
      port_of_destination: '',
      shipping_method: '',
      shipping_line: '',
      container_number: '',
      bl_number: '',
      order_date: '',
      expected_arrival: '',
      actual_arrival: '',
      clearance_date: '',
      status: 'pending',
      po_document_url: '',
      payment_proof_url: '',
      courier_document_url: '',
      bill_of_entry_url: '',
      packing_list_url: '',
      commercial_invoice_url: '',
      other_documents_urls: [],
      payment_status: 'pending',
      payment_amount: 0,
      payment_date: '',
      notes: '',
      created_by: null,
      created_by_name: null,
    });
    setStep(1);
  };

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    setFormData(prev => ({
      ...prev,
      supplier_id: supplierId,
      supplier_name: supplier?.name || '',
    }));
  };

  const calculateTotal = () => {
    const total = formData.quantity * formData.unit_price;
    setFormData(prev => ({ ...prev, total_amount: total }));
  };

  useEffect(() => {
    calculateTotal();
  }, [formData.quantity, formData.unit_price]);

  const handleSubmit = async () => {
    if (!formData.product_name) return;
    
    setLoading(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
      resetForm();
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.product_name.trim() !== '';
      default:
        return true;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingImport ? 'Edit Import' : 'Add New Import'}
          </DialogTitle>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-6 px-2">
          {STEPS.map((s, index) => (
            <div key={s.id} className="flex items-center">
              <button
                onClick={() => setStep(s.id)}
                className={cn(
                  "flex flex-col items-center gap-1 transition-colors",
                  step >= s.id ? "text-primary" : "text-muted-foreground"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                  step > s.id 
                    ? "bg-primary border-primary text-primary-foreground" 
                    : step === s.id 
                      ? "border-primary bg-primary/10" 
                      : "border-muted"
                )}>
                  {step > s.id ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <s.icon className="w-5 h-5" />
                  )}
                </div>
                <span className="text-xs font-medium hidden sm:block">{s.title}</span>
              </button>
              {index < STEPS.length - 1 && (
                <div className={cn(
                  "w-8 sm:w-12 h-0.5 mx-1",
                  step > s.id ? "bg-primary" : "bg-muted"
                )} />
              )}
            </div>
          ))}
        </div>

        <div className="space-y-4">
          {/* Step 1: Product Details */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                Product Details
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="product_name">Product Name *</Label>
                  <Input
                    id="product_name"
                    value={formData.product_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, product_name: e.target.value }))}
                    placeholder="Enter product name"
                  />
                </div>
                
                <div>
                  <Label htmlFor="product_category">Category</Label>
                  <Input
                    id="product_category"
                    value={formData.product_category}
                    onChange={(e) => setFormData(prev => ({ ...prev, product_category: e.target.value }))}
                    placeholder="e.g., Electronics"
                  />
                </div>
                
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min={1}
                    value={formData.quantity}
                    onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="unit_price">Unit Price</Label>
                  <Input
                    id="unit_price"
                    type="number"
                    min={0}
                    step={0.01}
                    value={formData.unit_price}
                    onChange={(e) => setFormData(prev => ({ ...prev, unit_price: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    value={formData.currency}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="col-span-2">
                  <Label>Total Amount</Label>
                  <div className="text-2xl font-bold text-primary">
                    {formData.currency} {formData.total_amount.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Supplier Details */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Supplier Details
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="supplier">Select Supplier</Label>
                  <Select
                    value={formData.supplier_id}
                    onValueChange={handleSupplierChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map(supplier => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="origin_country">Origin Country</Label>
                  <Input
                    id="origin_country"
                    value={formData.origin_country}
                    onChange={(e) => setFormData(prev => ({ ...prev, origin_country: e.target.value }))}
                    placeholder="e.g., China"
                  />
                </div>
                
                <div>
                  <Label htmlFor="order_date">Order Date</Label>
                  <Input
                    id="order_date"
                    type="date"
                    value={formData.order_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, order_date: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Shipping Details */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Ship className="w-5 h-5 text-primary" />
                Shipping Details
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="shipping_method">Shipping Method</Label>
                  <Select
                    value={formData.shipping_method}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, shipping_method: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      {SHIPPING_METHODS.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="shipping_line">Shipping Line</Label>
                  <Input
                    id="shipping_line"
                    value={formData.shipping_line}
                    onChange={(e) => setFormData(prev => ({ ...prev, shipping_line: e.target.value }))}
                    placeholder="e.g., Maersk"
                  />
                </div>
                
                <div>
                  <Label htmlFor="port_of_origin">Port of Origin</Label>
                  <Input
                    id="port_of_origin"
                    value={formData.port_of_origin}
                    onChange={(e) => setFormData(prev => ({ ...prev, port_of_origin: e.target.value }))}
                    placeholder="e.g., Shanghai"
                  />
                </div>
                
                <div>
                  <Label htmlFor="port_of_destination">Port of Destination</Label>
                  <Input
                    id="port_of_destination"
                    value={formData.port_of_destination}
                    onChange={(e) => setFormData(prev => ({ ...prev, port_of_destination: e.target.value }))}
                    placeholder="e.g., Mumbai"
                  />
                </div>
                
                <div>
                  <Label htmlFor="container_number">Container Number</Label>
                  <Input
                    id="container_number"
                    value={formData.container_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, container_number: e.target.value }))}
                    placeholder="Container #"
                  />
                </div>
                
                <div>
                  <Label htmlFor="bl_number">Bill of Lading Number</Label>
                  <Input
                    id="bl_number"
                    value={formData.bl_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, bl_number: e.target.value }))}
                    placeholder="B/L Number"
                  />
                </div>
                
                <div>
                  <Label htmlFor="expected_arrival">Expected Arrival</Label>
                  <Input
                    id="expected_arrival"
                    type="date"
                    value={formData.expected_arrival}
                    onChange={(e) => setFormData(prev => ({ ...prev, expected_arrival: e.target.value }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IMPORT_STATUSES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Documents */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Documents
              </h3>
              <p className="text-sm text-muted-foreground">
                Enter document URLs or upload files after creating the import.
              </p>
              
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label htmlFor="po_document_url">Purchase Order (PO)</Label>
                  <Input
                    id="po_document_url"
                    value={formData.po_document_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, po_document_url: e.target.value }))}
                    placeholder="URL to PO document"
                  />
                </div>
                
                <div>
                  <Label htmlFor="commercial_invoice_url">Commercial Invoice</Label>
                  <Input
                    id="commercial_invoice_url"
                    value={formData.commercial_invoice_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, commercial_invoice_url: e.target.value }))}
                    placeholder="URL to commercial invoice"
                  />
                </div>
                
                <div>
                  <Label htmlFor="packing_list_url">Packing List</Label>
                  <Input
                    id="packing_list_url"
                    value={formData.packing_list_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, packing_list_url: e.target.value }))}
                    placeholder="URL to packing list"
                  />
                </div>
                
                <div>
                  <Label htmlFor="bill_of_entry_url">Bill of Entry</Label>
                  <Input
                    id="bill_of_entry_url"
                    value={formData.bill_of_entry_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, bill_of_entry_url: e.target.value }))}
                    placeholder="URL to bill of entry"
                  />
                </div>
                
                <div>
                  <Label htmlFor="courier_document_url">Courier/Shipping Documents</Label>
                  <Input
                    id="courier_document_url"
                    value={formData.courier_document_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, courier_document_url: e.target.value }))}
                    placeholder="URL to courier documents"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Payment */}
          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                Payment Details
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="payment_status">Payment Status</Label>
                  <Select
                    value={formData.payment_status}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, payment_status: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_STATUSES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="payment_amount">Payment Amount</Label>
                  <Input
                    id="payment_amount"
                    type="number"
                    min={0}
                    step={0.01}
                    value={formData.payment_amount}
                    onChange={(e) => setFormData(prev => ({ ...prev, payment_amount: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="payment_date">Payment Date</Label>
                  <Input
                    id="payment_date"
                    type="date"
                    value={formData.payment_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, payment_date: e.target.value }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="payment_proof_url">Payment Proof URL</Label>
                  <Input
                    id="payment_proof_url"
                    value={formData.payment_proof_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, payment_proof_url: e.target.value }))}
                    placeholder="URL to payment proof"
                  />
                </div>
                
                <div className="col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Any additional notes..."
                    rows={3}
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="mt-6 p-4 bg-muted/50 rounded-lg space-y-2">
                <h4 className="font-semibold">Import Summary</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Product:</span>
                  <span className="font-medium">{formData.product_name}</span>
                  
                  <span className="text-muted-foreground">Supplier:</span>
                  <span className="font-medium">{formData.supplier_name || 'Not selected'}</span>
                  
                  <span className="text-muted-foreground">Quantity:</span>
                  <span className="font-medium">{formData.quantity}</span>
                  
                  <span className="text-muted-foreground">Total Value:</span>
                  <span className="font-medium text-primary">
                    {formData.currency} {formData.total_amount.toLocaleString()}
                  </span>
                  
                  <span className="text-muted-foreground">Status:</span>
                  <span className="font-medium capitalize">{formData.status.replace('_', ' ')}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => step > 1 ? setStep(step - 1) : onOpenChange(false)}
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          
          {step < 5 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={loading || !formData.product_name}
            >
              {loading ? 'Saving...' : editingImport ? 'Update Import' : 'Create Import'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
