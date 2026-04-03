import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileUp, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  onUpload: (file: File) => Promise<{ success: boolean; error?: string }>;
  processing: boolean;
}

export function CCUploadZone({ onUpload, processing }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  const ACCEPTED_EXTS = ['pdf', 'xlsx', 'xls', 'csv'];
  const MAX_SIZE = 10 * 1024 * 1024;

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const validateFile = (f: File): boolean => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_EXTS.includes(ext || '')) {
      toast({ title: 'Invalid file', description: 'Only PDF, Excel, and CSV files are accepted', variant: 'destructive' });
      return false;
    }
    if (f.size > MAX_SIZE) {
      toast({ title: 'File too large', description: 'Max 10MB', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f && validateFile(f)) handleProcess(f);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && validateFile(f)) handleProcess(f);
    e.target.value = '';
  };

  const handleProcess = async (f: File) => {
    setFile(f);
    setUploading(true);
    const result = await onUpload(f);
    setUploading(false);

    if (result.success) {
      toast({ title: 'Statement processed', description: 'Dashboard updated automatically' });
      setFile(null);
    } else {
      toast({ title: 'Processing failed', description: result.error || 'Please try again', variant: 'destructive' });
    }
  };

  const isProcessing = uploading || processing;

  return (
    <Card className="border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 overflow-hidden">
      <CardContent className="p-0">
        <div
          className={`relative p-8 text-center transition-all cursor-pointer
            ${dragActive ? 'bg-primary/10 scale-[1.01]' : 'hover:bg-primary/5'}
            ${isProcessing ? 'pointer-events-none opacity-70' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !isProcessing && document.getElementById('cc-upload-input')?.click()}
        >
          <input
            id="cc-upload-input"
            type="file"
            accept=".pdf,.xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileSelect}
          />

          {isProcessing ? (
            <div className="space-y-3">
              <Loader2 className="h-10 w-10 text-primary mx-auto animate-spin" />
              <div>
                <p className="text-sm font-semibold">Analyzing statement…</p>
                <p className="text-xs text-muted-foreground mt-1">AI is extracting data from {file?.name}</p>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                <Sparkles className="h-3 w-3 mr-1" /> AI Processing
              </Badge>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-primary/10 w-fit mx-auto">
                <FileUp className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Upload Credit Card Statement</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Drop your PDF, Excel, or CSV statement here
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
                <Badge variant="outline" className="text-[10px]">PDF</Badge>
                <Badge variant="outline" className="text-[10px]">XLSX</Badge>
                <Badge variant="outline" className="text-[10px]">CSV</Badge>
                <span>• Max 10MB</span>
              </div>
              <p className="text-[10px] text-muted-foreground/70">
                AI auto-detects bank, card, and all fields — zero manual entry
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
