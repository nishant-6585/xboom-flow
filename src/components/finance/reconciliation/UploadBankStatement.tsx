import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, Loader2, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { parseCSVContent, parseExcelRows, createDiagnostics, type ParsedTransaction, type ParseDiagnostics } from '@/lib/bankStatementParser';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import * as XLSX from 'xlsx';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUploadComplete: () => void;
  rules: Array<{ keyword: string; account_id: string; subaccount_id: string | null }>;
}

type Step = 'upload' | 'preview' | 'importing';

export function UploadBankStatement({ open, onOpenChange, onUploadComplete, rules }: Props) {
  const { user, profile } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<ParsedTransaction[]>([]);
  const [diagnostics, setDiagnostics] = useState<ParseDiagnostics | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setBankName('');
    setAccountNumber('');
    setStep('upload');
    setParsed([]);
    setDiagnostics(null);
  };

  const handleParse = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['csv', 'xlsx', 'xls', 'pdf'].includes(ext || '')) {
        toast.error('Unsupported file type. Use CSV, Excel, or PDF.');
        return;
      }

      if (ext === 'pdf') {
        toast.info('PDF parsing is under development — please use CSV or Excel for now.');
        return;
      }

      const diag = createDiagnostics(file.name);
      let transactions: ParsedTransaction[] = [];

      if (ext === 'csv') {
        const text = await file.text();
        transactions = parseCSVContent(text, diag);
      } else {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        diag.sheetName = sheetName;
        const ws = wb.Sheets[sheetName];
        // Get raw 2D array to preserve number types and handle metadata rows
        const rawRows: (string | number | null | undefined)[][] = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: true,
          defval: null,
        });
        transactions = parseExcelRows(rawRows, diag);
      }

      setDiagnostics(diag);
      setParsed(transactions);
      setStep('preview');
    } catch (err: any) {
      console.error('Parse error:', err);
      toast.error(err.message || 'Failed to parse file');
    } finally {
      setUploading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !user || parsed.length === 0) return;
    setStep('importing');
    setUploading(true);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const path = `${user.id}/${Date.now()}_${file.name}`;
      const { error: storageErr } = await supabase.storage.from('bank-statements').upload(path, file);
      if (storageErr) throw storageErr;

      const fileType = ext === 'xls' ? 'xlsx' : ext as string;

      const { data: upload, error: uploadErr } = await supabase.from('bank_reconciliation_uploads').insert({
        file_name: file.name,
        file_url: path,
        file_type: fileType === 'csv' ? 'csv' : 'xlsx',
        bank_name: bankName || null,
        account_number: accountNumber || null,
        upload_status: 'processing',
        uploaded_by: user.id,
        uploaded_by_name: profile?.full_name || 'Unknown',
      } as any).select().single();
      if (uploadErr) throw uploadErr;

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
      reset();
    } catch (err: any) {
      console.error('Import error:', err);
      toast.error(err.message || 'Import failed');
      setStep('preview');
    } finally {
      setUploading(false);
    }
  };

  const formatAmount = (n: number) => n > 0 ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className={step === 'preview' ? 'sm:max-w-3xl' : 'sm:max-w-md'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {step === 'upload' ? 'Upload Bank Statement' : step === 'preview' ? 'Parse Preview' : 'Importing…'}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div>
              <Label>Statement File (CSV, Excel)</Label>
              <Input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={e => setFile(e.target.files?.[0] || null)} className="mt-1" />
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
        )}

        {step === 'preview' && diagnostics && (
          <div className="space-y-4">
            {/* Diagnostics Summary */}
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2 text-sm">
              <div className="flex items-center gap-2 font-medium">
                {parsed.length > 0 ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
                Parse Diagnostics
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">File</span><span className="truncate">{diagnostics.fileName}</span>
                {diagnostics.sheetName && <><span className="text-muted-foreground">Sheet</span><span>{diagnostics.sheetName}</span></>}
                <span className="text-muted-foreground">Header Row</span><span>{diagnostics.detectedHeaderRow ?? 'Not found'}</span>
                <span className="text-muted-foreground">Columns Detected</span><span>{diagnostics.detectedColumns.length}</span>
                <span className="text-muted-foreground">Rows Skipped</span><span>{diagnostics.rowsSkipped}</span>
                <span className="text-muted-foreground">Transactions Parsed</span>
                <span className="font-semibold">{diagnostics.transactionsParsed}</span>
              </div>
              {diagnostics.detectedColumns.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {diagnostics.detectedColumns.map((c, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] py-0">{c}</Badge>
                  ))}
                </div>
              )}
              {diagnostics.reason && (
                <div className="flex items-start gap-1.5 text-destructive text-xs mt-1">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {diagnostics.reason}
                </div>
              )}
            </div>

            {/* Preview Table */}
            {parsed.length > 0 && (
              <ScrollArea className="h-[300px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Narration</TableHead>
                      <TableHead className="text-xs text-right">Credit</TableHead>
                      <TableHead className="text-xs text-right">Debit</TableHead>
                      <TableHead className="text-xs text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.slice(0, 50).map((tx, i) => (
                      <TableRow key={i} className="text-xs">
                        <TableCell className="py-1.5 whitespace-nowrap">{tx.transaction_date}</TableCell>
                        <TableCell className="py-1.5 max-w-[200px] truncate">{tx.narration || '-'}</TableCell>
                        <TableCell className="py-1.5 text-right text-green-600">{formatAmount(tx.credit_amount)}</TableCell>
                        <TableCell className="py-1.5 text-right text-red-500">{formatAmount(tx.debit_amount)}</TableCell>
                        <TableCell className="py-1.5 text-right">{tx.running_balance != null ? formatAmount(tx.running_balance) : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsed.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Showing first 50 of {parsed.length} transactions</p>
                )}
              </ScrollArea>
            )}
          </div>
        )}

        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importing {parsed.length} transactions…</p>
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleParse} disabled={!file || uploading}>
                {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Parsing...</> : 'Parse & Preview'}
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
              <Button onClick={handleImport} disabled={parsed.length === 0}>
                Import {parsed.length} Transactions
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
