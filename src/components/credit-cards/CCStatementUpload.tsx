import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Upload, FileUp, Sparkles, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { CreditCard } from '@/hooks/useCreditCards';
import { CCStatementPreview } from './CCStatementPreview';
import { CCUploadHistory } from './CCUploadHistory';

interface Props {
  cards: CreditCard[];
  onStatementSaved: () => void;
}

export function CCStatementUpload({ cards, onStatementSaved }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [autoDetect, setAutoDetect] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  const [uploadId, setUploadId] = useState<string>('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const ACCEPTED = '.pdf,.xlsx,.xls,.csv';
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const validateFile = (f: File): boolean => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'xlsx', 'xls', 'csv'].includes(ext || '')) {
      toast({ title: 'Invalid file', description: 'Only PDF, Excel, and CSV files are accepted', variant: 'destructive' });
      return false;
    }
    if (f.size > MAX_SIZE) {
      toast({ title: 'File too large', description: 'Maximum file size is 10MB', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f && validateFile(f)) setFile(f);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && validateFile(f)) setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upload file to storage
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('cc-statements').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('cc-statements').getPublicUrl(filePath);
      const fileUrl = filePath; // Store relative path

      // Create upload record
      const { data: upload, error: insertError } = await supabase
        .from('statement_uploads' as any)
        .insert({
          file_url: fileUrl,
          file_name: file.name,
          card_id: autoDetect ? null : (selectedCardId || null),
          uploaded_by: user.id,
          status: 'processing',
        } as any)
        .select()
        .single();

      if (insertError) throw insertError;

      const uploadRecord = upload as any;
      setUploadId(uploadRecord.id);
      setUploading(false);
      setProcessing(true);

      // Call edge function
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const { data: session } = await supabase.auth.getSession();

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/parse-credit-card-statement`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({
            upload_id: uploadRecord.id,
            file_url: fileUrl,
            file_name: file.name,
            card_id: autoDetect ? null : (selectedCardId || null),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Processing failed');
      }

      setParsedData(result.parsed_data);
      setPreviewOpen(true);
      toast({ title: 'Statement analyzed', description: `Confidence: ${result.parsed_data.confidence_score}%` });
    } catch (err: any) {
      console.error('Upload error:', err);
      toast({ title: 'Upload failed', description: err.message || 'Something went wrong', variant: 'destructive' });
    } finally {
      setUploading(false);
      setProcessing(false);
      setHistoryKey(k => k + 1);
    }
  };

  const handleSaveStatement = async (data: any) => {
    try {
      // Use the card selected in preview modal
      let finalCardId = data._selectedCardId || selectedCardId;
      
      if (!finalCardId && data.detected_bank) {
        const match = cards.find(c =>
          c.bank_name.toLowerCase().includes(data.detected_bank.toLowerCase()) ||
          data.detected_bank.toLowerCase().includes(c.bank_name.toLowerCase())
        );
        if (match) finalCardId = match.id;
      }

      if (!finalCardId) {
        toast({ title: 'Select a card', description: 'Could not auto-detect card. Please select one.', variant: 'destructive' });
        return;
      }

      const card = cards.find(c => c.id === finalCardId);
      const creditLimit = data.credit_limit || card?.credit_limit || 0;
      const outstanding = data.outstanding_balance || 0;
      const availableCredit = data.available_credit_limit ?? (creditLimit - outstanding);

      // Calculate payment status
      const amountPaid = data.amount_paid || 0;
      const totalDue = data.total_due || 0;
      const minimumDue = data.minimum_due || 0;
      let paymentStatus = 'UNPAID';
      if (amountPaid >= totalDue && totalDue > 0) paymentStatus = 'FULL';
      else if (amountPaid >= minimumDue && minimumDue > 0) paymentStatus = 'PARTIAL';

      const { error } = await supabase.from('cc_monthly_statements').insert({
        card_id: finalCardId,
        billing_month: data.billing_month,
        due_date: data.due_date,
        outstanding_balance: outstanding,
        total_due: totalDue,
        minimum_due: minimumDue,
        amount_paid: amountPaid,
        payment_date: data.payment_date || null,
        interest_charged: data.interest_charged || 0,
        late_fee: data.late_fee || 0,
        available_credit_limit: availableCredit,
        payment_status: paymentStatus,
      } as any);

      if (error) throw error;

      // Update upload record
      await supabase.from('statement_uploads' as any).update({ status: 'success' } as any).eq('id', uploadId);

      toast({ title: 'Statement saved', description: 'Dashboard has been updated with the new data.' });
      setPreviewOpen(false);
      setParsedData(null);
      setFile(null);
      setHistoryKey(k => k + 1);
      onStatementSaved();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <>
      <Card className="border-dashed border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            Upload Statement (AI Powered)
            <Badge variant="secondary" className="text-[10px] ml-1">BETA</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Drop Zone */}
            <div
              className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer
                ${dragActive ? 'border-primary bg-primary/10 scale-[1.02]' : 'border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5'}
                ${file ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById('cc-file-input')?.click()}
            >
              <input
                id="cc-file-input"
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={handleFileSelect}
              />
              {file ? (
                <div className="space-y-1">
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto" />
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                    Change file
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <FileUp className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm font-medium">Drop statement here</p>
                  <p className="text-xs text-muted-foreground">PDF, Excel, or CSV • Max 10MB</p>
                </div>
              )}
            </div>

            {/* Options */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-detect" className="text-sm">Auto-detect card from statement</Label>
                <Switch id="auto-detect" checked={autoDetect} onCheckedChange={setAutoDetect} />
              </div>

              {!autoDetect && (
                <Select value={selectedCardId} onValueChange={setSelectedCardId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select credit card" />
                  </SelectTrigger>
                  <SelectContent>
                    {cards.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.card_name} ({c.bank_name})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                className="w-full gap-2"
                disabled={!file || uploading || processing}
                onClick={handleUpload}
              >
                {uploading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                ) : processing ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing statement…</>
                ) : (
                  <><Upload className="h-4 w-4" /> Upload & Analyze</>
                )}
              </Button>
            </div>
          </div>

          {/* Upload History */}
          <CCUploadHistory key={historyKey} cards={cards} />
        </CardContent>
      </Card>

      {/* Preview Modal */}
      {parsedData && (
        <CCStatementPreview
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          parsedData={parsedData}
          cards={cards}
          selectedCardId={selectedCardId}
          autoDetect={autoDetect}
          onSave={handleSaveStatement}
          onCancel={() => { setPreviewOpen(false); setParsedData(null); }}
        />
      )}
    </>
  );
}
