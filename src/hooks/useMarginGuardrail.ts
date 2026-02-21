import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface MarginThreshold {
  id: string;
  category: string;
  minimum_margin_percent: number;
  warning_margin_percent: number;
}

export interface MarginAnalysis {
  itemName: string;
  category: string;
  costPrice: number | null;
  sellingPrice: number;
  marginPercent: number | null;
  riskLevel: 'safe' | 'warning' | 'danger' | 'unknown';
  thresholdPercent: number;
  warningPercent: number;
}

export interface QuoteMarginResult {
  items: MarginAnalysis[];
  overallMarginPercent: number | null;
  requiresApproval: boolean;
  worstRiskLevel: 'safe' | 'warning' | 'danger' | 'unknown';
}

export function useMarginGuardrail() {
  const [thresholds, setThresholds] = useState<MarginThreshold[]>([]);
  const [loading, setLoading] = useState(false);
  const { user, profile, role } = useAuth();

  const fetchThresholds = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('margin_thresholds')
        .select('*');
      if (error) throw error;
      setThresholds((data || []) as MarginThreshold[]);
    } catch (err) {
      console.error('Error fetching margin thresholds:', err);
    }
  }, []);

  const getThresholdForCategory = (category: string): MarginThreshold => {
    const match = thresholds.find(t => t.category === category);
    return match || thresholds.find(t => t.category === 'Default') || {
      id: '',
      category: 'Default',
      minimum_margin_percent: 15,
      warning_margin_percent: 20,
    };
  };

  const analyzeQuoteMargins = async (
    items: { product_name: string; product_category?: string; unit_price: number; quantity: number; gst_percent?: number; price_includes_gst?: boolean }[]
  ): Promise<QuoteMarginResult> => {
    // Ensure thresholds are loaded
    let currentThresholds = thresholds;
    if (currentThresholds.length === 0) {
      const { data } = await supabase.from('margin_thresholds').select('*');
      currentThresholds = (data || []) as MarginThreshold[];
      setThresholds(currentThresholds);
    }

    // Fetch cost prices from pricelist
    const productNames = items.map(i => i.product_name);
    const { data: pricelistItems } = await supabase
      .from('pricelist')
      .select('product_name, product_category, cost_price')
      .in('product_name', productNames);

    const costMap = new Map<string, { cost_price: number | null; category: string }>();
    (pricelistItems || []).forEach((p: any) => {
      costMap.set(p.product_name, { cost_price: p.cost_price, category: p.product_category });
    });

    let totalCost = 0;
    let totalRevenue = 0;
    let hasCostData = false;
    let requiresApproval = false;
    let worstRiskLevel: 'safe' | 'warning' | 'danger' | 'unknown' = 'safe';

    const analyzed: MarginAnalysis[] = items.map(item => {
      const priceInfo = costMap.get(item.product_name);
      const costPrice = priceInfo?.cost_price ?? null;
      const category = item.product_category || priceInfo?.category || 'Default';

      // Calculate base selling price (exclude GST)
      let basePrice = item.unit_price;
      if (item.price_includes_gst && item.gst_percent) {
        basePrice = item.unit_price / (1 + item.gst_percent / 100);
      }

      const threshold = currentThresholds.find(t => t.category === category) 
        || currentThresholds.find(t => t.category === 'Default')
        || { minimum_margin_percent: 15, warning_margin_percent: 20 };

      if (costPrice && costPrice > 0) {
        hasCostData = true;
        const marginPercent = ((basePrice - costPrice) / basePrice) * 100;
        totalCost += costPrice * item.quantity;
        totalRevenue += basePrice * item.quantity;

        let riskLevel: 'safe' | 'warning' | 'danger' = 'safe';
        if (marginPercent < threshold.minimum_margin_percent) {
          riskLevel = 'danger';
          requiresApproval = true;
        } else if (marginPercent < threshold.warning_margin_percent) {
          riskLevel = 'warning';
        }

        if (riskLevel === 'danger') worstRiskLevel = 'danger';
        else if (riskLevel === 'warning' && worstRiskLevel !== 'danger') worstRiskLevel = 'warning';

        return {
          itemName: item.product_name,
          category,
          costPrice,
          sellingPrice: basePrice,
          marginPercent: Math.round(marginPercent * 100) / 100,
          riskLevel,
          thresholdPercent: threshold.minimum_margin_percent,
          warningPercent: threshold.warning_margin_percent,
        };
      }

      return {
        itemName: item.product_name,
        category,
        costPrice: null,
        sellingPrice: basePrice,
        marginPercent: null,
        riskLevel: 'unknown' as const,
        thresholdPercent: threshold.minimum_margin_percent,
        warningPercent: threshold.warning_margin_percent,
      };
    });

    if (!hasCostData) worstRiskLevel = 'unknown';

    return {
      items: analyzed,
      overallMarginPercent: totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 100 * 100) / 100 : null,
      requiresApproval,
      worstRiskLevel,
    };
  };

  const flagQuoteRisk = async (
    quoteId: string,
    analysis: QuoteMarginResult
  ) => {
    try {
      // Insert risk flags for items below threshold
      const flags = analysis.items
        .filter(item => item.riskLevel === 'danger' || item.riskLevel === 'warning')
        .map(item => ({
          quote_id: quoteId,
          item_product_name: item.itemName,
          item_category: item.category,
          item_margin_percent: item.marginPercent,
          overall_margin_percent: analysis.overallMarginPercent,
          threshold_percent: item.thresholdPercent,
          risk_level: item.riskLevel,
          requires_approval: item.riskLevel === 'danger',
        }));

      if (flags.length > 0) {
        const { error } = await supabase
          .from('quote_risk_flags')
          .insert(flags);
        if (error) throw error;
      }
    } catch (err) {
      console.error('Error flagging quote risk:', err);
    }
  };

  const approveQuoteRisk = async (quoteId: string): Promise<boolean> => {
    if (!user || (role !== 'admin' && role !== 'finance')) {
      toast.error('Only Admin or Finance can approve margin exceptions');
      return false;
    }

    try {
      const { error } = await supabase
        .from('quote_risk_flags')
        .update({
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          requires_approval: false,
        })
        .eq('quote_id', quoteId)
        .eq('requires_approval', true);

      if (error) throw error;
      toast.success('Margin exception approved');
      return true;
    } catch (err: any) {
      console.error('Error approving quote risk:', err);
      toast.error('Failed to approve margin exception');
      return false;
    }
  };

  const getQuoteRiskFlags = async (quoteId: string) => {
    const { data, error } = await supabase
      .from('quote_risk_flags')
      .select('*')
      .eq('quote_id', quoteId);
    if (error) {
      console.error('Error fetching risk flags:', error);
      return [];
    }
    return data || [];
  };

  const updateThreshold = async (id: string, updates: Partial<MarginThreshold>): Promise<boolean> => {
    if (role !== 'admin') {
      toast.error('Only admins can update margin thresholds');
      return false;
    }
    try {
      const { error } = await supabase
        .from('margin_thresholds')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
      toast.success('Threshold updated');
      fetchThresholds();
      return true;
    } catch (err: any) {
      toast.error('Failed to update threshold');
      return false;
    }
  };

  return {
    thresholds,
    loading,
    fetchThresholds,
    analyzeQuoteMargins,
    flagQuoteRisk,
    approveQuoteRisk,
    getQuoteRiskFlags,
    updateThreshold,
    getThresholdForCategory,
  };
}
