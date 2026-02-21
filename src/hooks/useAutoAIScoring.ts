import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useAutoAIScoring() {
  const scoreEnquiry = useCallback(async (enquiryId: string) => {
    try {
      // Fetch the enquiry data
      const { data: enquiry, error: fetchError } = await supabase
        .from('enquiries')
        .select('*')
        .eq('id', enquiryId)
        .single();

      if (fetchError || !enquiry) {
        console.error('Failed to fetch enquiry for scoring:', fetchError);
        return;
      }

      // Call the AI lead scoring edge function
      const { data, error } = await supabase.functions.invoke('ai-lead-scoring', {
        body: {
          enquiry: {
            customer_name: enquiry.customer_name,
            customer_company: enquiry.customer_company,
            product_name: enquiry.product_name,
            product_category: enquiry.product_category,
            quantity: enquiry.quantity,
            urgency: enquiry.urgency,
            lead_temperature: enquiry.lead_temperature,
            is_mega_deal: enquiry.is_mega_deal,
            notes: enquiry.notes,
            requested_timeline: enquiry.requested_timeline,
            response_pricing: enquiry.response_pricing,
            response_availability: enquiry.response_availability,
            status: enquiry.status,
          },
          auto_score: true,
          enquiry_id: enquiryId,
        },
      });

      if (error) {
        console.error('AI scoring failed:', error);
        // Log the failure
        await supabase.from('ai_scoring_logs').insert({
          enquiry_id: enquiryId,
          error_message: error.message || 'Edge function invocation failed',
        });
        return;
      }

      const analysis = data?.analysis;
      if (!analysis) {
        await supabase.from('ai_scoring_logs').insert({
          enquiry_id: enquiryId,
          error_message: 'No analysis returned from AI',
        });
        return;
      }

      // Map score to priority level
      const score = analysis.score || 5;
      const priorityLevel = score >= 8 ? 'critical' : score >= 6 ? 'high' : score >= 4 ? 'medium' : 'low';
      
      // Calculate probability from score (rough mapping)
      const probability = Math.min(1, Math.max(0, (score / 10) * 0.8 + (analysis.confidence === 'High' ? 0.15 : analysis.confidence === 'Medium' ? 0.1 : 0.05)));
      const confidence = analysis.confidence === 'High' ? 0.9 : analysis.confidence === 'Medium' ? 0.7 : 0.5;

      // Update the enquiry with AI scores
      await supabase
        .from('enquiries')
        .update({
          ai_score: score,
          probability_to_close: Math.round(probability * 100) / 100,
          ai_priority_level: priorityLevel,
          ai_last_scored_at: new Date().toISOString(),
          ai_confidence: confidence,
        })
        .eq('id', enquiryId);

      // Log the scoring event
      await supabase.from('ai_scoring_logs').insert({
        enquiry_id: enquiryId,
        raw_response: analysis,
        score,
        probability: Math.round(probability * 100) / 100,
        confidence,
        priority_level: priorityLevel,
      });

      console.log(`AI scored enquiry ${enquiryId}: ${score}/10`);
    } catch (err) {
      console.error('Auto AI scoring error:', err);
      // Don't throw - scoring failure should not block enquiry creation
    }
  }, []);

  return { scoreEnquiry };
}
