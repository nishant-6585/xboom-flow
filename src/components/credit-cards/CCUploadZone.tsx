import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileUp, Sparkles, Loader2, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  onUpload: (file: File, password?: string) => Promise<{ success: boolean; error?: string; duplicate?: boolean; password_required?: boolean }>;
  processing: boolean;
}

export function CCUploadZone({ onUpload, processing }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

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
      toast({ title: 'File too large', description: 'Maximum file size is 10MB', variant: 'destructive' });
      return false;
    }
    if (f.size < 100) {
      toast({ title: 'File too small', description: 'File appears to be empty or corrupt', variant: 'destructive' });
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

  const handleProcess = async (f: File, pwd?: string) => {
    setFile(f);
    setUploading(true);
    const result = await onUpload(f, pwd);
    setUploading(false);

    if (result.password_required) {
      setPendingFile(f);
      setPassword('');
      setShowPassword(false);
      setShowPasswordDialog(true);
      setFile(null);
      return;
    }

    if (result.success) {
      toast({ title: 'Statement processed', description: 'Dashboard updated automatically' });
      setFile(null);
      setPendingFile(null);
    } else if (result.duplicate) {
      toast({
        title: 'Duplicate statement',
        description: result.error || 'This statement has already been uploaded with identical values',
        variant: 'destructive',
      });
      setFile(null);
    } else {
      toast({ title: 'Processing failed', description: result.error || 'Please try again', variant: 'destructive' });
      setFile(null);
    }
  };

  const handlePasswordSubmit = async () => {
    if (!pendingFile || !password.trim()) return;
    setShowPasswordDialog(false);
    await handleProcess(pendingFile, password.trim());
    setPassword('');
  };

  const handlePasswordCancel = () => {
    setShowPasswordDialog(false);
    setPendingFile(null);
    setPassword('');
    setFile(null);
  };

  const isProcessing = uploading || processing;

  return (
    <>
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
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/70">
                  <Lock className="h-3 w-3" />
                  <span>Password-protected PDFs supported</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showPasswordDialog} onOpenChange={(open) => { if (!open) handlePasswordCancel(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Password-Protected Statement
            </DialogTitle>
            <DialogDescription>
              This PDF is password-protected. Enter the password to unlock and process it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                Your password is used only to decrypt the file and is never stored.
              </p>
            </div>
            
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter PDF password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && password.trim()) handlePasswordSubmit(); }}
                autoFocus
                className="pr-10 focus-visible:ring-primary/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {pendingFile && (
              <p className="text-xs text-muted-foreground truncate">
                File: {pendingFile.name}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handlePasswordCancel}>Cancel</Button>
            <Button onClick={handlePasswordSubmit} disabled={!password.trim()}>
              <Lock className="h-4 w-4 mr-2" />
              Unlock & Process
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}