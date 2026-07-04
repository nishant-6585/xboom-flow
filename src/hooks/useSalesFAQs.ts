import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface SalesFAQ {
  id: string;
  question: string;
  answer: string | null;
  asked_by: string;
  asked_by_name: string;
  answered_by: string | null;
  answered_by_name: string | null;
  answered_at: string | null;
  is_approved: boolean;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  category: string | null;
  is_pinned: boolean;
  views_count: number;
  created_at: string;
  updated_at: string;
}

export interface FAQFormData {
  question: string;
  category?: string;
}

export function useSalesFAQs() {
  const { user, profile, role } = useAuth();
  // Depend on user.id (stable primitive), not user object — see usePricelist.
  const userId = user?.id ?? null;
  const [faqs, setFAQs] = useState<SalesFAQ[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFAQs = useCallback(async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('sales_faqs')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFAQs((data as SalesFAQ[]) || []);
    } catch (error: any) {
      console.error('Error fetching FAQs:', error);
      toast.error('Failed to fetch FAQs');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchFAQs();
  }, [fetchFAQs]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('sales_faqs_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales_faqs' },
        () => {
          fetchFAQs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchFAQs]);

  const askQuestion = async (formData: FAQFormData): Promise<boolean> => {
    if (!user || !profile) {
      toast.error('You must be logged in to ask a question');
      return false;
    }

    try {
      const { error } = await supabase.from('sales_faqs').insert({
        question: formData.question,
        category: formData.category || null,
        asked_by: user.id,
        asked_by_name: profile.name,
      });

      if (error) throw error;
      toast.success('Question submitted successfully');
      return true;
    } catch (error: any) {
      console.error('Error submitting question:', error);
      toast.error(error.message || 'Failed to submit question');
      return false;
    }
  };

  const answerQuestion = async (id: string, answer: string): Promise<boolean> => {
    if (!user || !profile) return false;

    try {
      const { error } = await supabase
        .from('sales_faqs')
        .update({
          answer,
          answered_by: user.id,
          answered_by_name: profile.name,
          answered_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
      toast.success('Answer submitted - pending admin approval');
      return true;
    } catch (error: any) {
      console.error('Error answering question:', error);
      toast.error(error.message || 'Failed to submit answer');
      return false;
    }
  };

  const approveAnswer = async (id: string): Promise<boolean> => {
    if (!user || !profile || role !== 'admin') {
      toast.error('Only admins can approve answers');
      return false;
    }

    try {
      const { error } = await supabase
        .from('sales_faqs')
        .update({
          is_approved: true,
          approved_by: user.id,
          approved_by_name: profile.name,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
      toast.success('Answer approved successfully');
      return true;
    } catch (error: any) {
      console.error('Error approving answer:', error);
      toast.error(error.message || 'Failed to approve answer');
      return false;
    }
  };

  const togglePin = async (id: string, isPinned: boolean): Promise<boolean> => {
    if (!user || role !== 'admin') {
      toast.error('Only admins can pin FAQs');
      return false;
    }

    try {
      const { error } = await supabase
        .from('sales_faqs')
        .update({ is_pinned: isPinned })
        .eq('id', id);

      if (error) throw error;
      toast.success(isPinned ? 'FAQ pinned' : 'FAQ unpinned');
      return true;
    } catch (error: any) {
      console.error('Error toggling pin:', error);
      toast.error(error.message || 'Failed to update FAQ');
      return false;
    }
  };

  const deleteFAQ = async (id: string): Promise<boolean> => {
    if (!user || role !== 'admin') {
      toast.error('Only admins can delete FAQs');
      return false;
    }

    try {
      const { error } = await supabase
        .from('sales_faqs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('FAQ deleted successfully');
      return true;
    } catch (error: any) {
      console.error('Error deleting FAQ:', error);
      toast.error(error.message || 'Failed to delete FAQ');
      return false;
    }
  };

  const incrementViews = async (id: string): Promise<void> => {
    try {
      const faq = faqs.find(f => f.id === id);
      if (faq) {
        await supabase
          .from('sales_faqs')
          .update({ views_count: (faq.views_count || 0) + 1 })
          .eq('id', id);
      }
    } catch (error) {
      console.error('Error incrementing views:', error);
    }
  };

  return {
    faqs,
    loading,
    askQuestion,
    answerQuestion,
    approveAnswer,
    togglePin,
    deleteFAQ,
    incrementViews,
    refetch: fetchFAQs,
  };
}
