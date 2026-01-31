import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface AdminSignature {
  id: string;
  admin_id: string;
  signature_url: string;
  uploaded_at: string;
}

export function useAdminSignature() {
  const { user, role } = useAuth();
  const [signature, setSignature] = useState<AdminSignature | null>(null);
  const [signatureImageUrl, setSignatureImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasSignature, setHasSignature] = useState(false);

  const fetchSignature = async () => {
    if (!user || role !== 'admin') {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('admin_signatures')
        .select('*')
        .eq('admin_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSignature(data);
        setHasSignature(true);
        
        // Get signed URL
        const path = data.signature_url.replace('admin-signatures/', '');
        const { data: signedUrl } = await supabase.storage
          .from('admin-signatures')
          .createSignedUrl(path, 3600);
        
        setSignatureImageUrl(signedUrl?.signedUrl || null);
      } else {
        setSignature(null);
        setHasSignature(false);
        setSignatureImageUrl(null);
      }
    } catch (error) {
      console.error('Error fetching admin signature:', error);
      setHasSignature(false);
    } finally {
      setLoading(false);
    }
  };

  // Get signature as base64 for PDF embedding
  const getSignatureBase64 = async (): Promise<string | null> => {
    if (!signatureImageUrl) return null;

    try {
      const response = await fetch(signatureImageUrl);
      const blob = await response.blob();
      
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting signature to base64:', error);
      return null;
    }
  };

  useEffect(() => {
    fetchSignature();
  }, [user, role]);

  return {
    signature,
    signatureImageUrl,
    loading,
    hasSignature,
    fetchSignature,
    getSignatureBase64,
  };
}
