import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { PenTool, Upload, Trash2, Loader2, AlertTriangle, Check } from 'lucide-react';

export function AdminSignatureSettings() {
  const { user, profile } = useAuth();
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      fetchSignature();
    }
  }, [user]);

  const fetchSignature = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('admin_signatures')
        .select('signature_url')
        .eq('admin_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data?.signature_url) {
        // Get signed URL for private bucket
        const { data: signedUrl } = await supabase.storage
          .from('admin-signatures')
          .createSignedUrl(data.signature_url.replace(/^.*admin-signatures\//, ''), 3600);
        
        setSignatureUrl(signedUrl?.signedUrl || null);
      }
    } catch (error) {
      console.error('Error fetching signature:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Please upload a PNG, JPEG, or WebP image');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    try {
      setUploading(true);

      // Upload to storage
      const fileName = `${user.id}/signature_${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from('admin-signatures')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get the full URL
      const fullUrl = `admin-signatures/${fileName}`;

      // Check if signature record exists
      const { data: existing } = await supabase
        .from('admin_signatures')
        .select('id')
        .eq('admin_id', user.id)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error: updateError } = await supabase
          .from('admin_signatures')
          .update({ 
            signature_url: fullUrl,
            updated_at: new Date().toISOString()
          })
          .eq('admin_id', user.id);

        if (updateError) throw updateError;
      } else {
        // Insert new
        const { error: insertError } = await supabase
          .from('admin_signatures')
          .insert({
            admin_id: user.id,
            signature_url: fullUrl
          });

        if (insertError) throw insertError;
      }

      toast.success('Signature uploaded successfully');
      fetchSignature();
    } catch (error: any) {
      console.error('Error uploading signature:', error);
      toast.error(error.message || 'Failed to upload signature');
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const handleDelete = async () => {
    if (!user) return;

    try {
      setDeleting(true);

      // Get current signature URL to delete from storage
      const { data: existing } = await supabase
        .from('admin_signatures')
        .select('signature_url')
        .eq('admin_id', user.id)
        .maybeSingle();

      if (existing?.signature_url) {
        const path = existing.signature_url.replace('admin-signatures/', '');
        await supabase.storage
          .from('admin-signatures')
          .remove([path]);
      }

      // Delete from database
      const { error } = await supabase
        .from('admin_signatures')
        .delete()
        .eq('admin_id', user.id);

      if (error) throw error;

      setSignatureUrl(null);
      toast.success('Signature deleted');
    } catch (error: any) {
      console.error('Error deleting signature:', error);
      toast.error(error.message || 'Failed to delete signature');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenTool className="h-5 w-5" />
          Invoice Signature
        </CardTitle>
        <CardDescription>
          Upload your signature image for signing invoices. This signature will be embedded into all finalized invoices.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            For best results, use a PNG image with transparent background. The signature will appear in the bottom-right of invoice PDFs.
          </AlertDescription>
        </Alert>

        {signatureUrl ? (
          <div className="space-y-4">
            <div className="border rounded-lg p-4 bg-muted/30">
              <Label className="text-sm text-muted-foreground mb-2 block">Current Signature</Label>
              <div className="flex items-center justify-center p-4 bg-white rounded border min-h-[120px]">
                <img 
                  src={signatureUrl} 
                  alt="Admin signature" 
                  className="max-h-[100px] max-w-full object-contain"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Check className="h-4 w-4" />
              Signature is ready for signing invoices
            </div>

            <div className="flex gap-2">
              <Label htmlFor="replaceSignature" className="flex-1">
                <div className="flex items-center justify-center gap-2 px-4 py-2 border rounded-md cursor-pointer hover:bg-muted transition-colors">
                  <Upload className="h-4 w-4" />
                  Replace Signature
                </div>
                <Input
                  id="replaceSignature"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </Label>
              
              <Button
                variant="destructive"
                size="default"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <PenTool className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium mb-1">No signature uploaded</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Upload a signature image to start signing invoices
            </p>
            <Label htmlFor="uploadSignature">
              <div className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md cursor-pointer hover:bg-primary/90 transition-colors">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload Signature
              </div>
              <Input
                id="uploadSignature"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleUpload}
                disabled={uploading}
                className="hidden"
              />
            </Label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
