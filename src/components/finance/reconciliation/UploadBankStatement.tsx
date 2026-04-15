import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { parseCSVContent, type ParsedTransaction } from '@/lib/bankStatementParser';
import { validateFile } from '@/lib/fileValidation';
import * as XLSX from 'xlsx';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUploadComplete: () => void;
  rules: Array<{ keyword: string; account_id: string; subaccount_id: string | null }>;
}

export function UploadBankStatement({ open, onOpenChange, onUploadComplete, rules }: Props) {
  const { user, profile } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!file || !user) return;
    setUploading(true);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['csv', 'xlsx', 'xls', 'pdf'].includes(ext || '')) {
        toast.error('Unsupported file type. Use CSV, Excel, or PDF.');
        return;
      }

      // Upload file to storage
      const path = `${user.id}/${Date.now()}_${file.name}`;
      const { error: storageErr } = await supabase.storage.from('bank-statements').upload(path, file);
      if (storageErr) throw storageErr;

      const fileType = ext === 'xls' ? 'xlsx' : ext as string;

      // Create upload record
      const { data: upload, error: uploadErr } = await supabase.from('bank_reconciliation_uploads').insert({
        file_name: file.name,
        file_url: path,
        file_type: fileType === 'pdf' ? 'pdf' : fileType === 'csv' ? 'csv' : 'xlsx',
        bank_name: bankName || null,
        account_number: accountNumber || null,
        upload_status: 'processing',
        uploaded_by: user.id,
        uploaded_by_name: profile?.full_name || 'Unknown',
      } as any).select().single();
      if (uploadErr) throw uploadErr;

      // Parse file
      let parsed: ParsedTransaction[] = [];
      if (fileType === 'csv') {
        const text = await file.text();
        parsed = parseCSVContent(text);
      } else if (fileType === 'xlsx' || fileType === 'xls') {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(ws);
        parsed = parseCSVContent(csv);
      } else {
        // PDF - mark as pending manual/server-side parsing
        await supabase.from('bank_reconciliation_uploads').update({ upload_status: 'pending' } as any).eq('id', (upload as any).id);
        toast.info('PDF uploaded. PDF parsing is under development — please use CSV or Excel for now.');
        onOpenChange(false);
        onUploadComplete();
        return;
      }

      if (parsed.length === 0) {
        await supabase.from('bank_reconciliation_uploads').update({ upload_status: 'failed', error_message: 'No transactions found' } as any).eq('id', (upload as any).id);
        toast.error('No transactions could be parsed from the file.');
        return;
      }

      // Apply auto rules
      const withRules = parsed.map(tx => {
        const narration = (tx.narration || '').toLowerCase();
        for (const rule of rules) {
          if (narration.includes(rule.keyword.toLowerCase())) {
            return { ...tx, account_id: rule.account_id, subaccount_id: rule.subaccount_id, status: 'auto_matched' };
          }
        }
        return { ...tx, status: 'new' };
      });

      // Insert transactions
      const rows = withRules.map(tx => ({
        upload_id: (upload as any).id,
        transaction_date: tx.transaction_date,
        value_date: tx.value_date,
        bank_reference: tx.bank_reference,
        narration: tx.narration,
        credit_amount: tx.credit_amount,
        debit_amount: tx.debit_amount,
        running_balance: tx.running_balance,
        transaction_type: tx.transaction_type,
        account_id: (tx as any).account_id || null,
        subaccount_id: (tx as any).subaccount_id || null,
        status: (tx as any).status || 'new',
      }));

      const { error: insertErr } = await supabase.from('bank_transactions').insert(rows as any);
      if (insertErr) throw insertErr;

      await supabase.from('bank_reconciliation_uploads').update({
        upload_status: 'completed',
        parsed_count: parsed.length,
      } as any).eq('id', (upload as any).id);

      const autoMatched = withRules.filter(t => (t as any).status === 'auto_matched').length;
      toast.success(`${parsed.length} transactions imported (${autoMatched} auto-matched)`);
      onOpenChange(false);
      onUploadComplete();
      setFile(null);
      setBankName('');
      setAccountNumber('');
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Bank Statement
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Statement File (CSV, Excel, PDF)</Label>
            <Input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={e => setFile(e.target.files?.[0] || null)} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Bank Name (optional)</Label>
              <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. HDFC, ICICI" className="mt-1" />
            </div>
            <div>
              <Label>Account Number (optional)</Label>
              <Input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="Last 4 digits" className="mt-1" />
            </div>
          </div>
          {file && (
            <div className="flex items-center gap-2 p-2 rounded bg-muted text-sm">
              <FileText className="h-4 w-4" />
              <span>{file.name}</span>
              <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</> : 'Upload & Parse'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
