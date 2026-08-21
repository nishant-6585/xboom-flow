import { useState, useEffect, useRef } from "react";
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
import { Card } from "@/components/ui/card";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Import, ImportItem, IMPORT_STATUSES, PAYMENT_STATUSES, SHIPPING_METHODS } from "@/hooks/useImports";
import { Package, Building2, Ship, FileText, CreditCard, CheckCircle2, Plus, Trash2, X, Upload, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  validateImportForm,
  firstErrorStep,
  sanitizeImportPayload,
  type ImportFieldErrors,
} from "@/lib/importValidation";


interface ImportFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Omit<Import, 'id' | 'created_at' | 'updated_at'>, items: ImportItem[]) => Promise<any>;
  editingImport?: Import | null;
}

const STEPS = [
  { id: 1, title: 'Products', icon: Package },
  { id: 2, title: 'Supplier', icon: Building2 },
  { id: 3, title: 'Shipping', icon: Ship },
  { id: 4, title: 'Documents', icon: FileText },
  { id: 5, title: 'Payment', icon: CreditCard },
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CNY', 'AED'];

const emptyItem: ImportItem = {
  product_name: '',
  product_category: '',
  product_code: '',
  quantity: 1,
  unit_price: 0,
  total_amount: 0,
  hsn_code: '',
  notes: '',
};

export function ImportFormDialog({
  open,
  onOpenChange,
  onSubmit,
  editingImport,
}: ImportFormDialogProps) {
  const { suppliers } = useSuppliers();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<ImportFieldErrors>({});

  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [items, setItems] = useState<ImportItem[]>([{ ...emptyItem }]);
  
  // File input refs
  const poFileRef = useRef<HTMLInputElement>(null);
  const commercialInvoiceFileRef = useRef<HTMLInputElement>(null);
  const packingListFileRef = useRef<HTMLInputElement>(null);
  const billOfEntryFileRef = useRef<HTMLInputElement>(null);
  const courierDocFileRef = useRef<HTMLInputElement>(null);
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
      
      if (editingImport.items && editingImport.items.length > 0) {
        setItems(editingImport.items);
      } else {
        setItems([{ ...emptyItem }]);
      }
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
    setItems([{ ...emptyItem }]);
    setStep(1);
    setErrors({});

  };

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    setFormData(prev => ({
      ...prev,
      supplier_id: supplierId,
      supplier_name: supplier?.name || '',
    }));
  };

  const addItem = () => {
    setItems(prev => [...prev, { ...emptyItem }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof ImportItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      
      // Auto-calculate total
      if (field === 'quantity' || field === 'unit_price') {
        updated[index].total_amount = updated[index].quantity * updated[index].unit_price;
      }
      
      return updated;
    });
  };

  const getTotalAmount = () => {
    return items.reduce((sum, item) => sum + (item.total_amount || 0), 0);
  };

  const getTotalQuantity = () => {
    return items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  };

  const handleFileUpload = async (
    file: File, 
    fieldName: 'po_document_url' | 'commercial_invoice_url' | 'packing_list_url' | 'bill_of_entry_url' | 'courier_document_url'
  ) => {
    if (!user) {
      toast.error('Please log in to upload files');
      return;
    }

    setUploadingField(fieldName);
    try {
      const { validateFile } = await import('@/lib/fileValidation');
      const validation = validateFile(file, 'imports');
      if (!validation.valid) { toast.error(validation.error); setUploadingField(null); return; }
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${user.id}/${fieldName}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('import-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get signed URL for private bucket
      const { data: signedData, error: signedError } = await supabase.storage
        .from('import-documents')
        .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year expiry

      if (signedError) throw signedError;

      setFormData(prev => ({ ...prev, [fieldName]: signedData.signedUrl }));
      toast.success('File uploaded successfully');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload file');
    } finally {
      setUploadingField(null);
    }
  };

  const handleSubmit = async () => {
    const clientErrors = validateImportForm({ ...formData, items });
    setErrors(clientErrors);
    const target = firstErrorStep(clientErrors);
    if (target !== null) {
      setStep(target);
      toast.error("Please fix the highlighted fields before saving");
      return;
    }

    setLoading(true);
    try {
      const result = await onSubmit(sanitizeImportPayload({ ...formData }) as typeof formData, items);
      if (result && result.ok === false) {
        const serverErrors = result.fieldErrors ?? {};
        setErrors(serverErrors);
        const serverStep = firstErrorStep(serverErrors);
        if (serverStep !== null) setStep(serverStep);
        return;
      }
      onOpenChange(false);
      resetForm();
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return items.length > 0 && items[0].product_name.trim() !== '';
      case 2:
        return !!formData.supplier_id && !!formData.order_date;
      default:
        return true;
    }
  };

  const fieldError = (key: string) => errors[key];

  const ErrorText = ({ name }: { name: string }) =>
    errors[name] ? (
      <p className="mt-1 text-xs text-destructive" role="alert">{errors[name]}</p>
    ) : null;


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
          {/* Step 1: Products */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary" />
                  Products
                </h3>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Product
                </Button>
              </div>

              <div className="space-y-3">
                {items.map((item, index) => (
                  <Card key={index} className="p-4 relative">
                    {items.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                    
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-12 sm:col-span-5">
                        <Label className="text-xs">Product Name *</Label>
                        <Input
                          value={item.product_name}
                          onChange={(e) => updateItem(index, 'product_name', e.target.value)}
                          placeholder="Enter product name"
                          aria-invalid={!!fieldError(`items.${index}.product_name`)}
                          className={cn("mt-1", fieldError(`items.${index}.product_name`) && "border-destructive")}
                        />
                        <ErrorText name={`items.${index}.product_name`} />
                      </div>

                      
                      <div className="col-span-6 sm:col-span-3">
                        <Label className="text-xs">Category</Label>
                        <Input
                          value={item.product_category}
                          onChange={(e) => updateItem(index, 'product_category', e.target.value)}
                          placeholder="Category"
                          className="mt-1"
                        />
                      </div>
                      
                      <div className="col-span-6 sm:col-span-2">
                        <Label className="text-xs">HSN Code</Label>
                        <Input
                          value={item.hsn_code}
                          onChange={(e) => updateItem(index, 'hsn_code', e.target.value)}
                          placeholder="HSN"
                          className="mt-1"
                        />
                      </div>
                      
                      <div className="col-span-4 sm:col-span-2">
                        <Label className="text-xs">Product Code</Label>
                        <Input
                          value={item.product_code}
                          onChange={(e) => updateItem(index, 'product_code', e.target.value)}
                          placeholder="Code"
                          className="mt-1"
                        />
                      </div>
                      
                      <div className="col-span-4 sm:col-span-2">
                        <Label className="text-xs">Quantity *</Label>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                          aria-invalid={!!fieldError(`items.${index}.quantity`)}
                          className={cn("mt-1", fieldError(`items.${index}.quantity`) && "border-destructive")}
                        />
                        <ErrorText name={`items.${index}.quantity`} />
                      </div>
                      
                      <div className="col-span-4 sm:col-span-3">
                        <Label className="text-xs">Unit Price *</Label>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.unit_price}
                          onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                          aria-invalid={!!fieldError(`items.${index}.unit_price`)}
                          className={cn("mt-1", fieldError(`items.${index}.unit_price`) && "border-destructive")}
                        />
                        <ErrorText name={`items.${index}.unit_price`} />
                      </div>

                      
                      <div className="col-span-12 sm:col-span-3">
                        <Label className="text-xs">Total</Label>
                        <div className="mt-1 h-9 px-3 py-2 bg-muted rounded-md text-sm font-medium">
                          {formData.currency} {item.total_amount.toLocaleString()}
                        </div>
                      </div>
                      
                      <div className="col-span-12 sm:col-span-4">
                        <Label className="text-xs">Notes</Label>
                        <Input
                          value={item.notes}
                          onChange={(e) => updateItem(index, 'notes', e.target.value)}
                          placeholder="Item notes"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Currency & Summary */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-4">
                  <div>
                    <Label className="text-xs">Currency</Label>
                    <Select
                      value={formData.currency}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}
                    >
                      <SelectTrigger className="w-24 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">
                    {items.length} item(s) · {getTotalQuantity()} units
                  </p>
                  <p className="text-2xl font-bold text-primary">
                    {formData.currency} {getTotalAmount().toLocaleString()}
                  </p>
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
                  <Label htmlFor="supplier">Select Supplier *</Label>
                  <Select
                    value={formData.supplier_id}
                    onValueChange={handleSupplierChange}
                  >
                    <SelectTrigger className={cn(fieldError("supplier_id") && "border-destructive")}>
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
                  <ErrorText name="supplier_id" />
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
                  <Label htmlFor="order_date">Order Date *</Label>
                  <Input
                    id="order_date"
                    type="date"
                    value={formData.order_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, order_date: e.target.value }))}
                    aria-invalid={!!fieldError("order_date")}
                    className={cn(fieldError("order_date") && "border-destructive")}
                  />
                  <ErrorText name="order_date" />
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
                Upload files or enter document URLs.
              </p>
              
              <div className="grid grid-cols-1 gap-4">
                {/* Purchase Order */}
                <div className="space-y-2">
                  <Label htmlFor="po_document_url">Purchase Order (PO)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="po_document_url"
                      value={formData.po_document_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, po_document_url: e.target.value }))}
                      placeholder="URL to PO document"
                      className="flex-1"
                    />
                    <input
                      type="file"
                      ref={poFileRef}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'po_document_url')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => poFileRef.current?.click()}
                      disabled={uploadingField === 'po_document_url'}
                    >
                      {uploadingField === 'po_document_url' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </Button>
                    {formData.po_document_url && (
                      <Button type="button" variant="ghost" size="icon" asChild>
                        <a href={formData.po_document_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Commercial Invoice */}
                <div className="space-y-2">
                  <Label htmlFor="commercial_invoice_url">Commercial Invoice</Label>
                  <div className="flex gap-2">
                    <Input
                      id="commercial_invoice_url"
                      value={formData.commercial_invoice_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, commercial_invoice_url: e.target.value }))}
                      placeholder="URL to commercial invoice"
                      className="flex-1"
                    />
                    <input
                      type="file"
                      ref={commercialInvoiceFileRef}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'commercial_invoice_url')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => commercialInvoiceFileRef.current?.click()}
                      disabled={uploadingField === 'commercial_invoice_url'}
                    >
                      {uploadingField === 'commercial_invoice_url' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </Button>
                    {formData.commercial_invoice_url && (
                      <Button type="button" variant="ghost" size="icon" asChild>
                        <a href={formData.commercial_invoice_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Packing List */}
                <div className="space-y-2">
                  <Label htmlFor="packing_list_url">Packing List</Label>
                  <div className="flex gap-2">
                    <Input
                      id="packing_list_url"
                      value={formData.packing_list_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, packing_list_url: e.target.value }))}
                      placeholder="URL to packing list"
                      className="flex-1"
                    />
                    <input
                      type="file"
                      ref={packingListFileRef}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xls,.xlsx"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'packing_list_url')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => packingListFileRef.current?.click()}
                      disabled={uploadingField === 'packing_list_url'}
                    >
                      {uploadingField === 'packing_list_url' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </Button>
                    {formData.packing_list_url && (
                      <Button type="button" variant="ghost" size="icon" asChild>
                        <a href={formData.packing_list_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Bill of Entry */}
                <div className="space-y-2">
                  <Label htmlFor="bill_of_entry_url">Bill of Entry</Label>
                  <div className="flex gap-2">
                    <Input
                      id="bill_of_entry_url"
                      value={formData.bill_of_entry_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, bill_of_entry_url: e.target.value }))}
                      placeholder="URL to bill of entry"
                      className="flex-1"
                    />
                    <input
                      type="file"
                      ref={billOfEntryFileRef}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'bill_of_entry_url')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => billOfEntryFileRef.current?.click()}
                      disabled={uploadingField === 'bill_of_entry_url'}
                    >
                      {uploadingField === 'bill_of_entry_url' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </Button>
                    {formData.bill_of_entry_url && (
                      <Button type="button" variant="ghost" size="icon" asChild>
                        <a href={formData.bill_of_entry_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Courier/Shipping Documents */}
                <div className="space-y-2">
                  <Label htmlFor="courier_document_url">Courier/Shipping Documents</Label>
                  <div className="flex gap-2">
                    <Input
                      id="courier_document_url"
                      value={formData.courier_document_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, courier_document_url: e.target.value }))}
                      placeholder="URL to courier documents"
                      className="flex-1"
                    />
                    <input
                      type="file"
                      ref={courierDocFileRef}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'courier_document_url')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => courierDocFileRef.current?.click()}
                      disabled={uploadingField === 'courier_document_url'}
                    >
                      {uploadingField === 'courier_document_url' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </Button>
                    {formData.courier_document_url && (
                      <Button type="button" variant="ghost" size="icon" asChild>
                        <a href={formData.courier_document_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
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
                  <span className="text-muted-foreground">Products:</span>
                  <span className="font-medium">{items.length} item(s)</span>
                  
                  <span className="text-muted-foreground">Supplier:</span>
                  <span className="font-medium">{formData.supplier_name || 'Not selected'}</span>
                  
                  <span className="text-muted-foreground">Total Quantity:</span>
                  <span className="font-medium">{getTotalQuantity()}</span>
                  
                  <span className="text-muted-foreground">Total Value:</span>
                  <span className="font-medium text-primary">
                    {formData.currency} {getTotalAmount().toLocaleString()}
                  </span>
                  
                  <span className="text-muted-foreground">Status:</span>
                  <span className="font-medium capitalize">{formData.status.replace('_', ' ')}</span>
                </div>
                
                {items.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground mb-2">Products:</p>
                    <div className="space-y-1">
                      {items.slice(0, 3).map((item, idx) => (
                        <p key={idx} className="text-sm">
                          {item.product_name} × {item.quantity}
                        </p>
                      ))}
                      {items.length > 3 && (
                        <p className="text-xs text-muted-foreground">
                          +{items.length - 3} more item(s)
                        </p>
                      )}
                    </div>
                  </div>
                )}
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
              disabled={loading || items.length === 0 || !items[0].product_name}
            >
              {loading ? 'Saving...' : editingImport ? 'Update Import' : 'Create Import'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
