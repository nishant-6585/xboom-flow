import { useState, useEffect, useMemo, useRef } from "react";
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
import {
  Import,
  ImportItem,
  IMPORT_STATUSES,
  PAYMENT_STATUSES,
  SHIPPING_METHODS,
  IMPORT_DOCUMENTS_BUCKET,
  ImportWritable,
  getImportDocumentUrl,
} from "@/hooks/useImports";
import { formatCurrency, CURRENCY_CODES, BASE_CURRENCY } from "@/lib/currency";
import { importFormSchema, IMPORT_STEP_FIELDS } from "@/lib/schemas/imports";
import {
  validate,
  errorsForFields,
  firstError,
  stepForFieldErrors,
} from "@/lib/schemas/formErrors";
import { Package, Building2, Ship, FileText, CreditCard, CheckCircle2, Plus, Trash2, X, Upload, Loader2, ExternalLink, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  firstErrorStep,
  sanitizeImportPayload,
  type ImportFieldErrors,
} from "@/lib/importValidation";


interface ImportFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ImportWritable, items: ImportItem[]) => Promise<any>;
  editingImport?: Import | null;
}

const STEPS = [
  { id: 1, title: 'Products', icon: Package },
  { id: 2, title: 'Supplier', icon: Building2 },
  { id: 3, title: 'Shipping', icon: Ship },
  { id: 4, title: 'Documents', icon: FileText },
  { id: 5, title: 'Payment', icon: CreditCard },
];

type ImportDocumentFieldName =
  | 'po_document_url'
  | 'commercial_invoice_url'
  | 'packing_list_url'
  | 'bill_of_entry_url'
  | 'courier_document_url';

interface ImportDocumentFieldDef {
  name: ImportDocumentFieldName;
  label: string;
  placeholder: string;
}

const IMPORT_DOCUMENT_FIELDS: ImportDocumentFieldDef[] = [
  { name: 'po_document_url', label: 'Purchase Order (PO)', placeholder: 'Upload a file or paste a link' },
  { name: 'commercial_invoice_url', label: 'Commercial Invoice', placeholder: 'Upload a file or paste a link' },
  { name: 'packing_list_url', label: 'Packing List', placeholder: 'Upload a file or paste a link' },
  { name: 'bill_of_entry_url', label: 'Bill of Entry', placeholder: 'Upload a file or paste a link' },
  { name: 'courier_document_url', label: 'Courier / Shipping Documents', placeholder: 'Upload a file or paste a link' },
];

type LandedCostFieldName =
  | 'freight_cost'
  | 'insurance_cost'
  | 'customs_duty'
  | 'clearing_agent_fee'
  | 'port_charges'
  | 'other_landed_costs';

const LANDED_COST_FIELDS: { name: LandedCostFieldName; label: string }[] = [
  { name: 'freight_cost', label: 'Freight' },
  { name: 'insurance_cost', label: 'Insurance' },
  { name: 'customs_duty', label: 'Customs duty' },
  { name: 'clearing_agent_fee', label: 'CHA / clearing' },
  { name: 'port_charges', label: 'Port charges' },
  { name: 'other_landed_costs', label: 'Other' },
];

const ACCEPTED_DOCUMENT_TYPES = '.pdf,.doc,.docx,.png,.jpg,.jpeg';

/**
 * One upload row. These five fields were previously copy-pasted blocks of
 * near-identical JSX; they differ only by name, label and placeholder.
 */
function DocumentUploadField({
  field,
  value,
  uploading,
  onUpload,
  onChange,
  onOpen,
}: {
  field: ImportDocumentFieldDef;
  value: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  onChange: (value: string) => void;
  onOpen: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isStoredFile = !!value && !/^https?:\/\//i.test(value);

  return (
    <div className="space-y-2">
      <Label htmlFor={field.name}>{field.label}</Label>
      <div className="flex gap-2">
        <Input
          id={field.name}
          value={isStoredFile ? value.split('/').pop() || value : value}
          readOnly={isStoredFile}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="flex-1"
        />
        <input
          type="file"
          ref={fileRef}
          className="hidden"
          accept={ACCEPTED_DOCUMENT_TYPES}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            // Allow re-selecting the same file after a failed upload.
            e.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          title={`Upload ${field.label}`}
          aria-label={`Upload ${field.label}`}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </Button>
        {value && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title={`Open ${field.label}`}
              aria-label={`Open ${field.label}`}
              onClick={onOpen}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title={`Remove ${field.label}`}
              aria-label={`Remove ${field.label}`}
              onClick={() => onChange('')}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

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
  
  const [formData, setFormData] = useState({
    import_number: '',
    supplier_id: '',
    supplier_name: '',
    product_name: '',
    product_category: '',
    quantity: 1,
    unit_price: 0,
    total_amount: 0,
    currency: BASE_CURRENCY,
    base_currency: BASE_CURRENCY,
    fx_rate: 1,
    fx_rate_date: '',
    freight_cost: 0,
    insurance_cost: 0,
    customs_duty: 0,
    clearing_agent_fee: 0,
    port_charges: 0,
    other_landed_costs: 0,
    igst_amount: 0,
    assessable_value: 0,
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
        currency: editingImport.currency || BASE_CURRENCY,
        base_currency: editingImport.base_currency || BASE_CURRENCY,
        fx_rate: editingImport.fx_rate ?? 1,
        fx_rate_date: editingImport.fx_rate_date || '',
        freight_cost: editingImport.freight_cost ?? 0,
        insurance_cost: editingImport.insurance_cost ?? 0,
        customs_duty: editingImport.customs_duty ?? 0,
        clearing_agent_fee: editingImport.clearing_agent_fee ?? 0,
        port_charges: editingImport.port_charges ?? 0,
        other_landed_costs: editingImport.other_landed_costs ?? 0,
        igst_amount: editingImport.igst_amount ?? 0,
        assessable_value: editingImport.assessable_value ?? 0,
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
      currency: BASE_CURRENCY,
    base_currency: BASE_CURRENCY,
    fx_rate: 1,
    fx_rate_date: '',
    freight_cost: 0,
    insurance_cost: 0,
    customs_duty: 0,
    clearing_agent_fee: 0,
    port_charges: 0,
    other_landed_costs: 0,
    igst_amount: 0,
    assessable_value: 0,
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

  const isForeignCurrency = formData.currency !== formData.base_currency;

  /** Goods value converted to the base currency at the booked rate. */
  const baseAmount = getTotalAmount() * (formData.fx_rate || 0);

  /**
   * Local charges. IGST is excluded on purpose — it is an input tax credit,
   * not a cost of the goods, and folding it in overstates cost of sale.
   */
  const localCharges =
    (formData.freight_cost || 0) +
    (formData.insurance_cost || 0) +
    (formData.customs_duty || 0) +
    (formData.clearing_agent_fee || 0) +
    (formData.port_charges || 0) +
    (formData.other_landed_costs || 0);

  const landedCost = baseAmount + localCharges;
  const landedUnitCost = getTotalQuantity() > 0 ? landedCost / getTotalQuantity() : 0;

  /**
   * A same-currency import must have a rate of exactly 1 — the database enforces
   * it, and a stale rate left over from a currency switch would silently restate
   * the value.
   */
  const handleCurrencyChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      currency: value,
      fx_rate: value === prev.base_currency ? 1 : prev.fx_rate,
    }));
  };

  const handleFileUpload = async (
    file: File, 
    fieldName: ImportDocumentFieldName
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
        .from(IMPORT_DOCUMENTS_BUCKET)
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Persist the storage path. We used to persist a 1-year signed URL, which
      // parked a long-lived bearer token in a table every authenticated user can
      // read and silently rotted after twelve months. Links are now minted on
      // demand and live ten minutes.
      setFormData(prev => ({ ...prev, [fieldName]: filePath }));
      toast.success('File uploaded successfully');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload file');
    } finally {
      setUploadingField(null);
    }
  };

  const openDocument = async (pathOrUrl: string, label: string) => {
    if (!pathOrUrl) return;
    const url = await getImportDocumentUrl(pathOrUrl);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      toast.error(`Could not open ${label}`);
    }
  };

  /**
   * Parse the whole form with zod and slice the result per step. The wizard
   * previously only checked that the first product had a name, so blank
   * quantities, malformed prices, arrival dates before order dates and payments
   * larger than the import value all reached the database unchallenged.
   */
  const validation = useMemo(
    () => validate(importFormSchema, { ...formData, items }),
    [formData, items]
  );

  const stepErrors = useMemo(
    () => errorsForFields(validation.errors, IMPORT_STEP_FIELDS[step] ?? []),
    [validation.errors, step]
  );

  // Everything owed by this step and the ones before it, so the final step
  // cannot submit around an earlier problem.
  const blockingErrors = useMemo(() => {
    const prefixes = Object.entries(IMPORT_STEP_FIELDS)
      .filter(([stepNumber]) => Number(stepNumber) <= step)
      .flatMap(([, fields]) => fields);
    return errorsForFields(validation.errors, prefixes);
  }, [validation.errors, step]);

  const handleSubmit = async () => {
    // Re-validate the whole form at the boundary. The per-step gates are a
    // convenience; this is the guarantee. Errors feed the same `errors` state
    // the inline <ErrorText> fields already render.
    if (!validation.success) {
      setErrors(validation.errors);
      const target = stepForFieldErrors(validation.errors, IMPORT_STEP_FIELDS);
      if (target !== null) setStep(target);
      toast.error(firstError(validation.errors) ?? 'Please fix the highlighted fields before saving');
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

  const canProceed = () => Object.keys(blockingErrors).length === 0;

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
                          {formatCurrency(item.total_amount, formData.currency)}
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
                      onValueChange={handleCurrencyChange}
                    >
                      <SelectTrigger className="w-24 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCY_CODES.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {isForeignCurrency && (
                    <div>
                      <Label className="text-xs" htmlFor="fx_rate">
                        Rate (1 {formData.currency} = ? {formData.base_currency})
                      </Label>
                      <Input
                        id="fx_rate"
                        type="number"
                        step="0.0001"
                        min="0"
                        value={formData.fx_rate}
                        onChange={(e) =>
                          setFormData(prev => ({ ...prev, fx_rate: parseFloat(e.target.value) || 0 }))
                        }
                        className="w-32 mt-1"
                      />
                    </div>
                  )}

                  {isForeignCurrency && (
                    <div>
                      <Label className="text-xs" htmlFor="fx_rate_date">Rate date</Label>
                      <Input
                        id="fx_rate_date"
                        type="date"
                        value={formData.fx_rate_date}
                        onChange={(e) => setFormData(prev => ({ ...prev, fx_rate_date: e.target.value }))}
                        className="w-40 mt-1"
                      />
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <p className="text-sm text-muted-foreground">
                    {items.length} item(s) · {getTotalQuantity()} units
                  </p>
                  <p className="text-2xl font-bold text-primary">
                    {formatCurrency(getTotalAmount(), formData.currency)}
                  </p>
                  {isForeignCurrency && (
                    <p className="text-sm text-muted-foreground">
                      ≈ {formatCurrency(baseAmount, formData.base_currency)} at {formData.fx_rate || 0}
                    </p>
                  )}
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
                {IMPORT_DOCUMENT_FIELDS.map(field => (
                  <DocumentUploadField
                    key={field.name}
                    field={field}
                    value={formData[field.name]}
                    uploading={uploadingField === field.name}
                    onUpload={(file) => handleFileUpload(file, field.name)}
                    onChange={(value) => setFormData(prev => ({ ...prev, [field.name]: value }))}
                    onOpen={() => openDocument(formData[field.name], field.label)}
                  />
                ))}
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

              {/* Landed cost */}
              <div className="mt-6 space-y-3">
                <div>
                  <h4 className="font-semibold flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-primary" />
                    Landed Cost
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Charges incurred locally, in {formData.base_currency}. Without these, the goods
                    value alone understates what the stock actually cost.
                  </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {LANDED_COST_FIELDS.map(field => (
                    <div key={field.name}>
                      <Label htmlFor={field.name} className="text-xs">{field.label}</Label>
                      <Input
                        id={field.name}
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData[field.name]}
                        onChange={(e) =>
                          setFormData(prev => ({ ...prev, [field.name]: parseFloat(e.target.value) || 0 }))
                        }
                        className="mt-1"
                      />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="igst_amount" className="text-xs">IGST paid at port</Label>
                    <Input
                      id="igst_amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.igst_amount}
                      onChange={(e) =>
                        setFormData(prev => ({ ...prev, igst_amount: parseFloat(e.target.value) || 0 }))
                      }
                      className="mt-1"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Input credit — excluded from landed cost
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="assessable_value" className="text-xs">Assessable value</Label>
                    <Input
                      id="assessable_value"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.assessable_value}
                      onChange={(e) =>
                        setFormData(prev => ({ ...prev, assessable_value: parseFloat(e.target.value) || 0 }))
                      }
                      className="mt-1"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      CIF + statutory loading, per the Bill of Entry
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Goods value ({formData.base_currency})</span>
                    <span className="font-medium">{formatCurrency(baseAmount, formData.base_currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Local charges</span>
                    <span className="font-medium">{formatCurrency(localCharges, formData.base_currency)}</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t pt-2">
                    <span className="font-semibold">Total landed cost</span>
                    <span className="font-bold text-primary">
                      {formatCurrency(landedCost, formData.base_currency)}
                    </span>
                  </div>
                  {getTotalQuantity() > 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Per unit ({getTotalQuantity()} units)</span>
                      <span>{formatCurrency(landedUnitCost, formData.base_currency, { decimals: 2 })}</span>
                    </div>
                  )}
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
                  
                  <span className="text-muted-foreground">Goods Value:</span>
                  <span className="font-medium">
                    {formatCurrency(getTotalAmount(), formData.currency)}
                    {isForeignCurrency && (
                      <span className="text-muted-foreground">
                        {' '}≈ {formatCurrency(baseAmount, formData.base_currency)}
                      </span>
                    )}
                  </span>

                  <span className="text-muted-foreground">Landed Cost:</span>
                  <span className="font-medium text-primary">
                    {formatCurrency(landedCost, formData.base_currency)}
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
        {Object.keys(step === 5 ? blockingErrors : stepErrors).length > 0 && (
          <div
            role="alert"
            className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2"
          >
            <ul className="space-y-0.5 text-sm text-destructive">
              {Object.entries(step === 5 ? blockingErrors : stepErrors)
                .slice(0, 4)
                .map(([field, message]) => (
                  <li key={field}>{message}</li>
                ))}
            </ul>
          </div>
        )}

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
              // Deliberately NOT disabled on invalid input: clicking runs
              // validation and jumps to the offending step, which tells the
              // user what is wrong. A dead button explains nothing.
              disabled={loading}
              aria-busy={loading}
              title={firstError(validation.errors) ?? undefined}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {loading ? 'Saving...' : editingImport ? 'Update Import' : 'Create Import'}
            </Button>

          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
