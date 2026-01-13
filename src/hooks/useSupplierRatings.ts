import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SupplierRating {
  id: string;
  supplier_id: string;
  order_id: string | null;
  inventory_procurement_id: string | null;
  delivery_rating: number | null;
  quality_rating: number | null;
  pricing_rating: number | null;
  communication_rating: number | null;
  delivery_days_promised: number | null;
  delivery_days_actual: number | null;
  notes: string | null;
  rated_by: string | null;
  rated_by_name: string | null;
  created_at: string;
}

export interface SupplierScore {
  total_ratings: number;
  avg_delivery: number | null;
  avg_quality: number | null;
  avg_pricing: number | null;
  avg_communication: number | null;
  overall_score: number | null;
  on_time_percentage: number | null;
}

export function useSupplierRatings(supplierId?: string) {
  const [ratings, setRatings] = useState<SupplierRating[]>([]);
  const [score, setScore] = useState<SupplierScore | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchRatings = useCallback(async () => {
    if (!supplierId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('supplier_ratings')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRatings(data || []);
    } catch (error: any) {
      console.error('Error fetching ratings:', error);
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  const fetchScore = useCallback(async () => {
    if (!supplierId) return;

    try {
      const { data, error } = await supabase
        .rpc('get_supplier_score', { p_supplier_id: supplierId });

      if (error) throw error;
      if (data && data.length > 0) {
        setScore(data[0] as SupplierScore);
      }
    } catch (error: any) {
      console.error('Error fetching score:', error);
    }
  }, [supplierId]);

  const createRating = async (
    ratingData: Omit<SupplierRating, 'id' | 'created_at'>
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('supplier_ratings')
        .insert(ratingData);

      if (error) throw error;
      toast.success('Rating submitted successfully');
      await fetchRatings();
      await fetchScore();
      return true;
    } catch (error: any) {
      console.error('Error creating rating:', error);
      toast.error('Failed to submit rating');
      return false;
    }
  };

  const deleteRating = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('supplier_ratings')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Rating deleted');
      await fetchRatings();
      await fetchScore();
      return true;
    } catch (error: any) {
      console.error('Error deleting rating:', error);
      toast.error('Failed to delete rating');
      return false;
    }
  };

  useEffect(() => {
    if (supplierId) {
      fetchRatings();
      fetchScore();
    }
  }, [supplierId, fetchRatings, fetchScore]);

  return {
    ratings,
    score,
    loading,
    fetchRatings,
    fetchScore,
    createRating,
    deleteRating
  };
}

// Hook to fetch scores for multiple suppliers at once
export function useSupplierScores(supplierIds: string[]) {
  const [scores, setScores] = useState<Record<string, SupplierScore>>({});
  const [loading, setLoading] = useState(false);

  const fetchScores = useCallback(async () => {
    if (supplierIds.length === 0) return;

    setLoading(true);
    try {
      const scorePromises = supplierIds.map(async (id) => {
        const { data, error } = await supabase
          .rpc('get_supplier_score', { p_supplier_id: id });
        
        if (error) throw error;
        return { id, score: data?.[0] as SupplierScore };
      });

      const results = await Promise.all(scorePromises);
      const scoresMap: Record<string, SupplierScore> = {};
      results.forEach(({ id, score }) => {
        if (score) {
          scoresMap[id] = score;
        }
      });
      setScores(scoresMap);
    } catch (error: any) {
      console.error('Error fetching scores:', error);
    } finally {
      setLoading(false);
    }
  }, [supplierIds.join(',')]);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  return { scores, loading, fetchScores };
}
