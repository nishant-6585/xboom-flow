import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePaymentRecords } from '@/hooks/usePaymentRecords';
import { Loader2, Upload, ImageIcon, X, Plus } from 'lucide-react';
import {
  PAYMENT_MODES,
  type PaymentMode,
  getReferenceNumberPlaceholder,
  isScreenshotRequired,
  getScreenshotHint,
  getNotesMinLength,
  getNotesPlaceholder,
} from '@/lib/paymentModes';
import { subDays, format as fmtDate } from 'date-fns';
import { toast } from 'sonner';

interface FileWithPreview {
  file: File;
  preview: string;
  id: string;
}

interface PaymentUploadDialogProps {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function PaymentUploadDialog({ orderId, open, onOpenChange, onSuccess }: PaymentUploadDialogProps) {
  const { uploadScreenshot, submitPayment } = usePaymentRecords();
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('upi');
  const [referenceNumber, setReferenceNumber] = useState('');
  const todayIso = fmtDate(new Date(), 'yyyy-MM-dd');
  const minDateIso = fmtDate(subDays(new Date(), 30), 'yyyy-MM-dd');
  const [paymentDate, setPaymentDate] = useState(todayIso);
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      Array.from(selectedFiles).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setFiles(prev => [...prev, {
            file,
            preview: reader.result as string,
            id: `${Date.now()}-${Math.random().toString(36).substring(7)}`
          }]);
        };
        reader.readAsDataURL(file);
      });
    }
    // Reset input to allow selecting same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleClearAll = () => {
    setFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!amount || !paymentMode) return;

    const screenshotRequired = isScreenshotRequired(paymentMode);
    if (screenshotRequired && files.length === 0) {
      toast.error('Please upload a screenshot for this payment mode.');
      return;
    }

    const minNotes = getNotesMinLength(paymentMode);
    if (minNotes > 0 && notes.trim().length < minNotes) {
      toast.error(`Please describe the cash receipt in at least ${minNotes} characters.`);
      return;
    }

    setLoading(true);
    try {
      // Upload all screenshots (if any)
      const uploadedUrls: string[] = [];
      for (const fileItem of files) {
        const screenshotUrl = await uploadScreenshot(fileItem.file);
        if (screenshotUrl) {
          uploadedUrls.push(screenshotUrl);
        }
      }

      if (screenshotRequired && uploadedUrls.length === 0) {
        setLoading(false);
        return;
      }

      // Join URLs with comma for storage; null when no screenshots were attached
      const screenshotUrlsString = uploadedUrls.length > 0 ? uploadedUrls.join(',') : null;

      const success = await submitPayment(
        orderId,
        parseFloat(amount),
        screenshotUrlsString,
        notes,
        {
          payment_mode: paymentMode,
          reference_number: referenceNumber,
          payment_date: paymentDate || null,
        },
      );
      if (success) {
        setAmount('');
        setNotes('');
        setReferenceNumber('');
        setPaymentMode('upi');
        setPaymentDate(todayIso);
        handleClearAll();
        onOpenChange(false);
        onSuccess?.();
      }
    } finally {
      setLoading(false);
    }
  };

  const screenshotRequired = isScreenshotRequired(paymentMode);
  const isCash = paymentMode === 'cash';
  const minNotes = getNotesMinLength(paymentMode);
  const notesTooShort = minNotes > 0 && notes.trim().length < minNotes;
  const missingRequiredScreenshot = screenshotRequired && files.length === 0;
  const screenshotLabel = isCash
    ? `Receipt Voucher (optional) (${files.length} selected)`
    : screenshotRequired
      ? `Payment Screenshots * (${files.length} selected)`
      : `Payment Screenshots (optional) (${files.length} selected)`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Payment Screenshots
          </DialogTitle>
          <DialogDescription>
            Upload proof of payment for admin approval (multiple files allowed)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Payment Amount (₹) *</Label>
            <Input
              id="amount"
              type="number"
              min={0}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter payment amount"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="payment_mode">Payment Mode *</Label>
              <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as PaymentMode)} disabled={loading}>
                <SelectTrigger id="payment_mode">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_date">Payment Date</Label>
              <Input
                id="payment_date"
                type="date"
                value={paymentDate}
                min={minDateIso}
                max={todayIso}
                onChange={(e) => setPaymentDate(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reference_number">Reference Number</Label>
            <Input
              id="reference_number"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder={getReferenceNumberPlaceholder(paymentMode)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span>{screenshotLabel}</span>
              {files.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  disabled={loading}
                  className="h-6 text-xs"
                >
                  Clear all
                </Button>
              )}
            </Label>
            
            {/* File previews grid */}
            {files.length > 0 && (
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                {files.map((fileItem) => (
                  <div key={fileItem.id} className="relative group">
                    <img
                      src={fileItem.preview}
                      alt="Payment screenshot preview"
                      className="w-full h-24 object-cover rounded-lg border border-border bg-muted"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemoveFile(fileItem.id)}
                      disabled={loading}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload area */}
            <div
              className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex items-center justify-center gap-2">
                {files.length > 0 ? (
                  <>
                    <Plus className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Add more screenshots</span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Click to upload screenshots</span>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG, JPEG up to 10MB each
              </p>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />

            <p className="text-xs text-muted-foreground">
              {getScreenshotHint(paymentMode)}
            </p>
            {missingRequiredScreenshot && (
              <p className="text-xs text-destructive">
                Screenshot required for this mode.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">
              Notes {isCash ? <span className="text-destructive">*</span> : '(Optional)'}
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={getNotesPlaceholder(paymentMode)}
              disabled={loading}
              rows={2}
            />
            {isCash && (
              <div className="flex items-center justify-between text-xs">
                <span className={notesTooShort ? 'text-destructive' : 'text-muted-foreground'}>
                  {notesTooShort
                    ? 'Add at least 20 characters describing the cash receipt.'
                    : 'Cash receipt details captured.'}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {notes.trim().length} / {minNotes} minimum
                </span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              loading ||
              !amount ||
              !paymentMode ||
              missingRequiredScreenshot ||
              notesTooShort
            }
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit for Approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
