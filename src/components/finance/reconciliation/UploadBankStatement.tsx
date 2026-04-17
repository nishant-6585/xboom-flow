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
import * as XLSX from 'xlsx';

// Lazy-load pdfjs only when needed (keeps initial bundle small)
async function extractPdfRows(file: File): Promise<(string | number | null)[][]> {
  const pdfjs: any = await import('pdfjs-dist/build/pdf.mjs');
  // Use the worker bundled with the package via Vite ?url import
  // @ts-ignore - vite-only import
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const allRows: (string | number | null)[][] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Group items into rows by Y coordinate (within ~3px tolerance)
    const lineMap = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as any[]) {
      const y = Math.round(item.transform[5]);
      // bucket Y into bins of 3px to merge near-equal lines
      const bucket = Math.round(y / 3) * 3;
      const arr = lineMap.get(bucket) || [];
      arr.push({ x: item.transform[4], str: item.str });
      lineMap.set(bucket, arr);
    }
    // Sort lines top-to-bottom (higher Y = top in PDF coords)
    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);
    for (const y of sortedYs) {
      const cells = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      // Split into columns based on horizontal gaps
      const row: string[] = [];
      let current = '';
      let lastX = -Infinity;
      for (const c of cells) {
        if (lastX !== -Infinity && c.x - lastX > 15) {
          if (current.trim()) row.push(current.trim());
          current = c.str;
        } else {
          current += (current ? ' ' : '') + c.str;
        }
        lastX = c.x + c.str.length * 4;
      }
      if (current.trim()) row.push(current.trim());
      if (row.length > 0) allRows.push(row);
    }
  }
  return allRows;
}

// Insert rows in safe batches to avoid payload/timeout limits on large statements
async function batchInsert<T>(
  table: string,
  rows: T[],
  chunkSize = 250,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table as any).insert(chunk as any);
    if (error) {
      throw new Error(
        `Batch ${Math.floor(i / chunkSize) + 1} of ${Math.ceil(rows.length / chunkSize)} failed at row ${i + 1}: ${error.message}`
      );
    }
    onProgress?.(Math.min(i + chunkSize, rows.length), rows.length);
  }
}

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
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setBankName('');
    setAccountNumber('');
    setStep('upload');
    setParsed([]);
    setDiagnostics(null);
    setImportProgress(null);
  };

  const formatAmount = (n: number) => n > 0 ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';

  const parseFailureHelp = 'Try uploading a cleaned CSV with these columns: transaction_date, value_date, transaction_id, reference_no, narration, debit, credit, balance';

  const handleParse = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['csv', 'xlsx', 'xls', 'pdf'].includes(ext || '')) {
        toast.error('Unsupported file type. Use CSV, Excel, or PDF.');
        return;
      }

      const diag = createDiagnostics(file.name);
      let transactions: ParsedTransaction[] = [];

      if (ext === 'pdf') {
        const rawRows = await extractPdfRows(file);
        diag.sheetName = 'PDF';
        transactions = parseExcelRows(rawRows, diag);
        if (transactions.length === 0 && !diag.reason) {
          diag.reason = 'Could not detect a transactions table in this PDF. It may be scanned (image-only) or use a non-standard layout. Try CSV/Excel export from your bank.';
        }
      } else if (ext === 'csv') {
        const text = await file.text();
        transactions = parseCSVContent(text, diag);
      } else {
        const buffer = await file.arrayBuffer();
        // Use streaming-friendly options to reduce memory pressure on large files
        const wb = XLSX.read(buffer, {
          type: 'array',
          cellDates: false,
          cellFormula: false,
          cellHTML: false,
          cellStyles: false,
          sheetRows: 0, // 0 = all rows; explicit for clarity
        });
        const sheetName = wb.SheetNames[0];
        diag.sheetName = sheetName;
        const ws = wb.Sheets[sheetName];
        const rawRows: (string | number | null | undefined)[][] = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: true,
          defval: null,
          blankrows: false,
        });
        transactions = parseExcelRows(rawRows, diag);
      }

      setDiagnostics(diag);
      setParsed(transactions);
      setStep('preview');

      if (transactions.length === 0) {
        toast.error(diag.reason || 'Unable to parse this bank export.');
      } else {
        toast.success(`Parsed ${transactions.length} transactions`);
      }
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

      const fileType = ext === 'pdf' ? 'pdf' : ext === 'csv' ? 'csv' : 'xlsx';

      const { data: upload, error: uploadErr } = await supabase.from('bank_reconciliation_uploads').insert({
        file_name: file.name,
        file_url: path,
        file_type: fileType,
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

      // Batch insert in chunks of 250 to safely handle large statements
      // (avoids PostgREST payload limits & request timeouts on big files)
      setImportProgress({ done: 0, total: rows.length });
      await batchInsert('bank_transactions', rows, 250, (done, total) => {
        setImportProgress({ done, total });
      });

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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className={`${step === 'preview' ? 'sm:max-w-3xl' : 'sm:max-w-md'} max-h-[90vh] flex flex-col overflow-hidden`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {step === 'upload' ? 'Upload Bank Statement' : step === 'preview' ? 'Parse Preview' : 'Importing…'}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div>
              <Label>Statement File (CSV, Excel, PDF)</Label>
              <Input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={e => setFile(e.target.files?.[0] || null)} className="mt-1" />
              <p className="text-[11px] text-muted-foreground mt-1">PDF support is text-based only — scanned/image PDFs need OCR. For very large files, prefer CSV/Excel for best accuracy.</p>
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
                  {parsed.length > 0 ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
                Parse Diagnostics
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">File</span><span className="truncate">{diagnostics.fileName}</span>
                {diagnostics.sheetName && <><span className="text-muted-foreground">Sheet</span><span>{diagnostics.sheetName}</span></>}
                <span className="text-muted-foreground">Rows Scanned</span><span>{diagnostics.rowsScanned}</span>
                <span className="text-muted-foreground">Header Row</span><span>{diagnostics.detectedHeaderRow ?? 'Not found'}</span>
                <span className="text-muted-foreground">Rows Skipped</span><span>{diagnostics.rowsSkipped}</span>
                <span className="text-muted-foreground">Rows Parsed</span><span className="font-semibold">{diagnostics.transactionsParsed}</span>
              </div>
              {diagnostics.detectedColumns.length > 0 && (
                <div className="space-y-2 mt-1">
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">Original Headers</p>
                    <div className="flex flex-wrap gap-1">
                      {diagnostics.detectedColumns.map((c, i) => (
                        <Badge key={`header-${i}`} variant="outline" className="text-[10px] py-0">{c}</Badge>
                      ))}
                    </div>
                  </div>
                  {diagnostics.mappedFields.length > 0 && (
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground mb-1">Mapped Fields</p>
                      <div className="flex flex-wrap gap-1">
                        {diagnostics.mappedFields.map((field, i) => (
                          <Badge key={`field-${i}`} variant="secondary" className="text-[10px] py-0">{field}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {diagnostics.reason && (
                <div className="flex items-start gap-1.5 text-destructive text-xs mt-1">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p>{diagnostics.reason}</p>
                    {parsed.length === 0 && (
                      <div className="rounded-md border border-dashed border-border bg-background/80 p-2 text-muted-foreground">
                        {parseFailureHelp}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Preview Table */}
            {parsed.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Previewing first {Math.min(parsed.length, 50)} parsed transactions before import.</p>
                <div className="max-h-[320px] overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Txn Date</TableHead>
                        <TableHead className="text-xs">Value Date</TableHead>
                        <TableHead className="text-xs">Txn ID</TableHead>
                        <TableHead className="text-xs">Reference No</TableHead>
                        <TableHead className="text-xs">Narration</TableHead>
                        <TableHead className="text-xs text-right">Debit</TableHead>
                        <TableHead className="text-xs text-right">Credit</TableHead>
                        <TableHead className="text-xs text-right">Balance</TableHead>
                        <TableHead className="text-xs">Direction</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.slice(0, 50).map((tx, i) => (
                        <TableRow key={i} className="text-xs">
                          <TableCell className="py-1.5 whitespace-nowrap">{tx.transaction_date}</TableCell>
                          <TableCell className="py-1.5 whitespace-nowrap">{tx.value_date || '-'}</TableCell>
                          <TableCell className="py-1.5 whitespace-nowrap">{tx.transaction_id || '-'}</TableCell>
                          <TableCell className="py-1.5 whitespace-nowrap">{tx.reference_no || '-'}</TableCell>
                          <TableCell className="py-1.5 max-w-[260px] truncate">{tx.narration || '-'}</TableCell>
                          <TableCell className="py-1.5 text-right text-destructive">{formatAmount(tx.debit_amount)}</TableCell>
                          <TableCell className="py-1.5 text-right text-primary">{formatAmount(tx.credit_amount)}</TableCell>
                          <TableCell className="py-1.5 text-right">{tx.running_balance != null ? formatAmount(tx.running_balance) : '-'}</TableCell>
                          <TableCell className="py-1.5">
                            <Badge variant="outline" className="text-[10px]">{tx.direction}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {parsed.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Showing first 50 of {parsed.length} transactions</p>
                )}
              </div>
            )}
          </div>
        )}

        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {importProgress
                ? `Importing ${importProgress.done.toLocaleString()} of ${importProgress.total.toLocaleString()} transactions…`
                : `Preparing ${parsed.length.toLocaleString()} transactions…`}
            </p>
            {importProgress && importProgress.total > 0 && (
              <div className="w-full max-w-xs h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.round((importProgress.done / importProgress.total) * 100)}%` }}
                />
              </div>
            )}
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
