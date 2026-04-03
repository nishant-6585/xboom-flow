import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreditCard, CCStatement, CCTransaction, CCPayment, StatementFilePayload, StatementUpload } from '@/hooks/useCreditCards';
import { Download, FileDown, Loader2, Plus, Receipt, RotateCcw, CreditCard as CardIcon, IndianRupee, Upload } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onClose: () => void;
  statement: CCStatement;
  card: CreditCard | undefined;
  transactions: CCTransaction[];
  payments: CCPayment[];
  onRecordPayment: (data: any) => Promise<{ success: boolean; error?: string }>;
  onViewFile: (uploadId: string) => Promise<StatementFilePayload | null>;
  onReanalyze: (data: { uploadId: string; fileUrl: string; fileName: string; guidance?: string }) => Promise<{ success: boolean; error?: string; password_required?: boolean }>;
  onReplaceFile?: (file: File, uploadId: string, password?: string) => Promise<{ success: boolean; error?: string; password_required?: boolean }>;
  upload?: Pick<StatementUpload, 'id' | 'file_url' | 'file_name'>;
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

const PAYMENT_MODES = [
  { value: 'upi', label: 'UPI' },
  { value: 'neft', label: 'NEFT' },
  { value: 'rtgs', label: 'RTGS' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'auto_debit', label: 'Auto Debit' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_COLORS: Record<string, string> = {
  shopping: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  food: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
  fuel: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  travel: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
  utilities: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/30',
  entertainment: 'bg-pink-500/10 text-pink-600 border-pink-500/30',
  health: 'bg-green-500/10 text-green-600 border-green-500/30',
  education: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30',
  insurance: 'bg-teal-500/10 text-teal-600 border-teal-500/30',
  emi: 'bg-red-500/10 text-red-600 border-red-500/30',
  fees: 'bg-rose-500/10 text-rose-600 border-rose-500/30',
  payment: 'bg-green-500/10 text-green-600 border-green-500/30',
  refund: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  cashback: 'bg-lime-500/10 text-lime-600 border-lime-500/30',
  other: 'bg-gray-500/10 text-gray-600 border-gray-500/30',
};

export function CCStatementDetail({
  open,
  onClose,
  statement,
  card,
  transactions,
  payments,
  onRecordPayment,
  onViewFile,
  onReanalyze,
  upload,
}: Props) {
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'upi',
    reference_number: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerData, setViewerData] = useState<{ url: string; fileName: string; mimeType: string } | null>(null);
  const [reanalysisGuidance, setReanalysisGuidance] = useState('');
  const [reanalyzing, setReanalyzing] = useState(false);

  useEffect(() => {
    return () => {
      if (viewerData?.url) URL.revokeObjectURL(viewerData.url);
    };
  }, [viewerData]);

  const closeViewer = (nextOpen: boolean) => {
    if (!nextOpen && viewerData?.url) {
      URL.revokeObjectURL(viewerData.url);
      setViewerData(null);
    }
    setViewerOpen(nextOpen);
  };

  const handleRecordPayment = async () => {
    if (!paymentData.amount || parseFloat(paymentData.amount) <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const result = await onRecordPayment({
      statement_id: statement.id,
      card_id: statement.card_id,
      amount: parseFloat(paymentData.amount),
      payment_date: paymentData.payment_date,
      payment_mode: paymentData.payment_mode,
      reference_number: paymentData.reference_number || undefined,
      notes: paymentData.notes || undefined,
    });
    setSaving(false);
    if (result.success) {
      toast({ title: 'Payment recorded successfully' });
      setShowPaymentForm(false);
      setPaymentData({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_mode: 'upi', reference_number: '', notes: '' });
    } else {
      toast({ title: 'Failed to record payment', description: result.error, variant: 'destructive' });
    }
  };

  const handleViewFile = async () => {
    if (!upload?.id) return;

    setViewerLoading(true);
    const file = await onViewFile(upload.id);
    setViewerLoading(false);

    if (!file) {
      toast({ title: 'Could not load file', description: 'The statement file could not be opened.', variant: 'destructive' });
      return;
    }

    if (viewerData?.url) URL.revokeObjectURL(viewerData.url);

    setViewerData({
      url: URL.createObjectURL(file.blob),
      fileName: file.fileName || upload.file_name,
      mimeType: file.mimeType,
    });
    setViewerOpen(true);
  };

  const handleDownloadFile = () => {
    if (!viewerData) return;
    const link = document.createElement('a');
    link.href = viewerData.url;
    link.download = viewerData.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleReanalyze = async () => {
    if (!upload?.id || !upload.file_url) return;

    setReanalyzing(true);
    const result = await onReanalyze({
      uploadId: upload.id,
      fileUrl: upload.file_url,
      fileName: upload.file_name,
      guidance: reanalysisGuidance,
    });
    setReanalyzing(false);

    if (result.success) {
      toast({ title: 'Statement re-analyzed', description: 'The dashboard has been refreshed with the latest extraction.' });
      setReanalysisGuidance('');
      return;
    }

    toast({
      title: result.password_required ? 'Password required' : 'Re-analysis failed',
      description: result.error || 'Could not re-analyze this statement.',
      variant: 'destructive',
    });
  };

  const totalPaid = statement.amount_paid || 0;
  const remaining = Math.max(0, statement.total_due - totalPaid);
  const canPreviewInline = !!viewerData && (viewerData.mimeType.includes('pdf') || viewerData.fileName.toLowerCase().endsWith('.pdf'));

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CardIcon className="h-5 w-5 text-primary" />
              {card?.card_name || 'Card'} — {statement.billing_month}
              <Badge className={statement.payment_status === 'FULL' ? 'bg-green-500/10 text-green-600' : statement.payment_status === 'PARTIAL' ? 'bg-yellow-500/10 text-yellow-600' : 'bg-red-500/10 text-red-600'}>
                {statement.payment_status}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 p-3 bg-muted/30 rounded-lg text-xs">
            <div><span className="text-muted-foreground block">Total Due</span><span className="font-bold">{fmt(statement.total_due)}</span></div>
            <div><span className="text-muted-foreground block">Min. Due</span><span className="font-bold">{fmt(statement.minimum_due || 0)}</span></div>
            <div><span className="text-muted-foreground block">Outstanding</span><span className="font-bold">{fmt(statement.outstanding_balance)}</span></div>
            <div><span className="text-muted-foreground block">Paid</span><span className="font-bold text-green-600">{fmt(totalPaid)}</span></div>
            <div><span className="text-muted-foreground block">Remaining</span><span className="font-bold text-red-600">{fmt(remaining)}</span></div>
            <div><span className="text-muted-foreground block">Due Date</span><span className="font-bold">{new Date(statement.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</span></div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowPaymentForm(!showPaymentForm)} className="text-xs gap-1">
              <Plus className="h-3 w-3" /> Record Payment
            </Button>
            {upload && (
              <Button size="sm" variant="outline" onClick={handleViewFile} disabled={viewerLoading} className="text-xs gap-1">
                {viewerLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                View Statement File
              </Button>
            )}
          </div>

          {showPaymentForm && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
              <h4 className="text-sm font-semibold flex items-center gap-2"><IndianRupee className="h-4 w-4" /> Record Payment</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Amount *</label>
                  <Input type="number" placeholder="0.00" value={paymentData.amount} onChange={e => setPaymentData(p => ({ ...p, amount: e.target.value }))} className="h-8 text-xs" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Date *</label>
                  <Input type="date" value={paymentData.payment_date} onChange={e => setPaymentData(p => ({ ...p, payment_date: e.target.value }))} className="h-8 text-xs" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Mode *</label>
                  <Select value={paymentData.payment_mode} onValueChange={v => setPaymentData(p => ({ ...p, payment_mode: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Reference #</label>
                  <Input placeholder="UTR / Ref No" value={paymentData.reference_number} onChange={e => setPaymentData(p => ({ ...p, reference_number: e.target.value }))} className="h-8 text-xs" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Notes</label>
                <Input placeholder="Optional notes" value={paymentData.notes} onChange={e => setPaymentData(p => ({ ...p, notes: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleRecordPayment} disabled={saving} className="text-xs">
                  {saving ? 'Saving…' : 'Save Payment'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowPaymentForm(false)} className="text-xs">Cancel</Button>
              </div>
            </div>
          )}

          <Tabs defaultValue="transactions" className="mt-2">
            <TabsList className="h-8">
              <TabsTrigger value="transactions" className="text-xs gap-1"><Receipt className="h-3 w-3" /> Transactions ({transactions.length})</TabsTrigger>
              <TabsTrigger value="payments" className="text-xs gap-1"><IndianRupee className="h-3 w-3" /> Payments ({payments.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="transactions" className="mt-3">
              {transactions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No transactions extracted from this statement</p>
              ) : (
                <div className="rounded-lg border overflow-auto max-h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map(t => (
                        <TableRow key={t.id}>
                          <TableCell className="text-xs whitespace-nowrap">{new Date(t.transaction_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</TableCell>
                          <TableCell className="text-xs max-w-[250px] truncate" title={t.description}>{t.description}</TableCell>
                          <TableCell>
                            <Badge className={`text-[9px] ${CATEGORY_COLORS[t.category] || CATEGORY_COLORS.other}`}>{t.category}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[9px]">{t.transaction_type}</Badge>
                          </TableCell>
                          <TableCell className={`text-xs text-right font-medium ${['credit', 'refund', 'cashback', 'payment'].includes(t.transaction_type) ? 'text-green-600' : ''}`}>
                            {['credit', 'refund', 'cashback', 'payment'].includes(t.transaction_type) ? '+' : ''}{fmt(t.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="payments" className="mt-3">
              {payments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No payments recorded yet. Click "Record Payment" to add one.</p>
              ) : (
                <div className="rounded-lg border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                        <TableHead className="text-xs">Mode</TableHead>
                        <TableHead className="text-xs">Reference</TableHead>
                        <TableHead className="text-xs">Notes</TableHead>
                        <TableHead className="text-xs">Recorded By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs">{new Date(p.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</TableCell>
                          <TableCell className="text-xs text-right font-bold text-green-600">{fmt(p.amount)}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[9px] uppercase">{p.payment_mode.replace('_', ' ')}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.reference_number || '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{p.notes || '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.recorded_by_name}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={viewerOpen} onOpenChange={closeViewer}>
        <DialogContent className="max-w-6xl w-[96vw] h-[92vh] flex flex-col overflow-hidden">
          <DialogHeader className="space-y-3">
            <div className="flex items-start justify-between gap-3 pr-8">
              <DialogTitle className="truncate">{viewerData?.fileName || upload?.file_name || 'Statement file'}</DialogTitle>
              <Button type="button" variant="outline" size="sm" onClick={handleDownloadFile} disabled={!viewerData} className="gap-1 shrink-0">
                <Download className="h-4 w-4" /> Download
              </Button>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <div>
                <p className="text-sm font-medium">Guide AI re-analysis</p>
                <p className="text-xs text-muted-foreground">Add corrections or hints, then re-run extraction for this same uploaded statement.</p>
              </div>
              <Textarea
                value={reanalysisGuidance}
                onChange={(event) => setReanalysisGuidance(event.target.value)}
                placeholder="Example: The paid amount is ₹1,31,876, minimum due is ₹32,838, and this statement belongs to IDFC FIRST Bank."
                className="min-h-[96px] text-sm"
              />
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={handleReanalyze} disabled={reanalyzing || !upload} className="gap-1">
                  {reanalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Re-analyze with guidance
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 rounded-lg border bg-muted/10 overflow-hidden">
            {canPreviewInline && viewerData ? (
              <iframe src={viewerData.url} title={viewerData.fileName} className="h-full w-full" />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-muted-foreground">Inline preview is available for PDF statements. You can still download this file from here.</p>
                <Button type="button" variant="outline" size="sm" onClick={handleDownloadFile} disabled={!viewerData} className="gap-1">
                  <Download className="h-4 w-4" /> Download file
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
