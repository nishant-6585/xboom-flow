import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Paperclip, Upload, X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AttachmentsSectionProps {
  attachmentUrls: string[];
  onAttachmentsChange: (urls: string[]) => void;
  bucketPath: string;
  compact?: boolean;
}

export function AttachmentsSection({
  attachmentUrls,
  onAttachmentsChange,
  bucketPath,
  compact = false,
}: AttachmentsSectionProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newUrls: string[] = [];

    try {
      const { validateFile } = await import('@/lib/fileValidation');
      for (const file of Array.from(files)) {
        const validation = validateFile(file, 'documents');
        if (!validation.valid) { toast.error(validation.error); continue; }
        const fileExt = file.name.split('.').pop();
        const fileName = `${bucketPath}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('billing-attachments')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('billing-attachments')
          .getPublicUrl(fileName);

        newUrls.push(publicUrl);
      }

      onAttachmentsChange([...attachmentUrls, ...newUrls]);
      toast.success(`${files.length} file(s) uploaded`);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeAttachment = (urlToRemove: string) => {
    onAttachmentsChange(attachmentUrls.filter(url => url !== urlToRemove));
  };

  const getFileIcon = (url: string) => {
    const ext = url.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
      return <ImageIcon className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  const getFileName = (url: string) => {
    const parts = url.split('/');
    const fullName = parts[parts.length - 1];
    // Remove timestamp prefix
    const nameParts = fullName.split('-');
    if (nameParts.length > 2) {
      return nameParts.slice(2).join('-');
    }
    return fullName;
  };

  if (compact) {
    return (
      <div className="space-y-2">
        <Label className="text-sm flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          Attachments
        </Label>
        <div className="flex flex-wrap gap-2">
          {attachmentUrls.map((url, index) => (
            <div 
              key={index} 
              className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs"
            >
              {getFileIcon(url)}
              <span className="max-w-[100px] truncate">{getFileName(url)}</span>
              <button
                type="button"
                onClick={() => removeAttachment(url)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          Attachments
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {attachmentUrls.map((url, index) => (
            <div 
              key={index} 
              className="flex items-center gap-2 bg-muted px-3 py-2 rounded-lg"
            >
              {getFileIcon(url)}
              <a 
                href={url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm hover:underline max-w-[150px] truncate"
              >
                {getFileName(url)}
              </a>
              <button
                type="button"
                onClick={() => removeAttachment(url)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div 
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Uploading...</span>
            </div>
          ) : (
            <>
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF, Word, Excel, Images (max 10MB each)
              </p>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
          onChange={handleFileUpload}
          className="hidden"
        />
      </CardContent>
    </Card>
  );
}