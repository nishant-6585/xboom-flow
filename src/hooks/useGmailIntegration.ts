import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface GmailIntegration {
  id: string;
  user_id: string;
  email: string;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
}

export interface GmailSyncLog {
  id: string;
  integration_id: string;
  emails_fetched: number;
  leads_created: number;
  errors: string | null;
  created_at: string;
}

export function useGmailIntegration() {
  const queryClient = useQueryClient();

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['gmail-integrations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gmail_integrations')
        .select('id, user_id, email, is_active, last_synced_at, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as GmailIntegration[];
    },
  });

  const { data: syncLogs = [] } = useQuery({
    queryKey: ['gmail-sync-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gmail_sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as GmailSyncLog[];
    },
  });

  const connectGmail = useMutation({
    mutationFn: async () => {
      const redirectUri = window.location.origin + '/sales';
      console.log('[Gmail OAuth] Redirect URI (frontend):', redirectUri);
      console.log('[Gmail OAuth] Origin:', window.location.origin);
      
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const functionUrl = `https://${projectId}.supabase.co/functions/v1/gmail-oauth-callback`;
      console.log('[Gmail OAuth] Calling edge function:', functionUrl);
      
      const res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ redirect_uri: redirectUri }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get OAuth URL');
      
      console.log('[Gmail OAuth] Generated OAuth URL:', data.url);
      
      // Parse and log key params for debugging
      try {
        const oauthUrl = new URL(data.url);
        console.log('[Gmail OAuth] Params:', {
          client_id: oauthUrl.searchParams.get('client_id'),
          redirect_uri: oauthUrl.searchParams.get('redirect_uri'),
          access_type: oauthUrl.searchParams.get('access_type'),
          prompt: oauthUrl.searchParams.get('prompt'),
          scope: oauthUrl.searchParams.get('scope'),
        });
      } catch { /* ignore parse errors */ }
      
      return data.url as string;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err: Error) => {
      console.error('[Gmail OAuth] Error:', err.message);
      toast.error(`Gmail connection failed: ${err.message}`);
    },
  });

  const syncNow = useMutation({
    mutationFn: async (integrationId?: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/gmail-lead-sync`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(integrationId ? { integration_id: integrationId } : {}),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['gmail-integrations'] });
      queryClient.invalidateQueries({ queryKey: ['gmail-sync-logs'] });
      queryClient.invalidateQueries({ queryKey: ['email-leads'] });
      const results = data.results || [];
      const totalLeads = results.reduce((s: number, r: any) => s + (r.leads_created || 0), 0);
      const totalFetched = results.reduce((s: number, r: any) => s + (r.emails_fetched || 0), 0);
      toast.success(`Sync complete: ${totalFetched} emails scanned, ${totalLeads} leads created`);
    },
    onError: (err: Error) => {
      toast.error(`Sync failed: ${err.message}`);
    },
  });

  const processWithAI = useMutation({
    mutationFn: async (leadId?: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      // Step 1: Claim pending leads via edge function
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const claimRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/ai-email-lead-processor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'claim', ...(leadId ? { lead_id: leadId } : {}) }),
        }
      );
      const claimData = await claimRes.json();
      if (!claimRes.ok) throw new Error(claimData.error || 'Failed to claim leads');

      const leads = claimData.leads || [];
      if (leads.length === 0) {
        return { processed: 0, enquiries_created: 0, rejected: 0, needs_review: 0, failed: 0 };
      }

      // Step 2: Call AI from browser (ai.lovable.dev is reachable from client)
      const INTENT_KEYWORDS = ['buy', 'price', 'quotation', 'urgent', 'require', 'purchase', 'order', 'quote', 'need'];
      const processedResults: Array<{
        lead_id: string;
        ai_result: Record<string, unknown> | null;
        status: string;
        error?: string;
      }> = [];

      for (const lead of leads) {
        try {
          const emailContent = [
            `Customer Name: ${lead.customer_name}`,
            lead.email ? `Email: ${lead.email}` : '',
            lead.phone_number ? `Phone: ${lead.phone_number}` : '',
            lead.customer_company ? `Company: ${lead.customer_company}` : '',
            lead.product_name ? `Product: ${lead.product_name}` : '',
            lead.notes ? `\nEmail Content:\n${lead.notes}` : '',
          ].filter(Boolean).join('\n');

          const aiRes = await fetch('https://ai.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                {
                  role: 'system',
                  content: `You are a lead extraction AI for XBoom, a drone and technology company. Analyze the email content and extract structured lead information.\n\nYou MUST respond with valid JSON matching this exact schema:\n{\n  "is_lead": true/false,\n  "confidence": 0.0-1.0,\n  "name": "sender's name or 'Unknown'",\n  "company": "company name or 'Unknown'",\n  "phone": "phone number if found or empty string",\n  "email": "email address if found or empty string",\n  "product_interest": "specific product/drone mentioned or 'General Enquiry'",\n  "product_category": "one of: Consumer Drones, Enterprise Drones, Agriculture Drones, FPV Drones, Camera Drones, Drone Parts, Drone Accessories, Other",\n  "quantity": 1,\n  "urgency": "one of: high, medium, low",\n  "city": "city if mentioned or empty string",\n  "summary": "one-line summary of the enquiry"\n}\n\nRules:\n- Auto-replies, newsletters, OOO messages, promotional emails → is_lead: false\n- Price enquiries, bulk orders, product questions → is_lead: true\n- If urgency words like "urgent", "asap", "immediately" → urgency: "high"\n- If timeline mentioned (weeks/months) → urgency: "medium"\n- Default urgency: "low"`,
                },
                {
                  role: 'user',
                  content: `Analyze this email and extract lead information:\n\n${emailContent}`,
                },
              ],
              response_format: { type: 'json_object' },
              temperature: 0.1,
            }),
          });

          if (!aiRes.ok) throw new Error(`AI API error ${aiRes.status}`);
          const aiData = await aiRes.json();
          const content = aiData.choices?.[0]?.message?.content;
          if (!content) throw new Error('Empty AI response');

          const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
          const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
          const aiResult = JSON.parse(jsonStr);

          // Determine status
          const emailText = (lead.notes || '').toLowerCase();
          const hasStrongIntent = INTENT_KEYWORDS.some((kw) => emailText.includes(kw));
          let status = 'rejected';
          if (aiResult.is_lead || hasStrongIntent) {
            if (aiResult.confidence >= 0.7 || hasStrongIntent) status = 'processed';
            else if (aiResult.confidence >= 0.5) status = 'needs_review';
            else status = 'needs_review';
          } else {
            if (aiResult.confidence >= 0.5) status = 'needs_review';
          }

          processedResults.push({ lead_id: lead.id, ai_result: aiResult, status });
        } catch (err) {
          processedResults.push({
            lead_id: lead.id,
            ai_result: null,
            status: 'error',
            error: String(err),
          });
        }
      }

      // Step 3: Send results back to edge function for DB writes
      const saveRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/ai-email-lead-processor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'save_results', results: processedResults }),
        }
      );
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || 'Failed to save AI results');
      return saveData;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['email-leads'] });
      toast.success(`AI processed ${data.processed || 0} leads: ${data.enquiries_created || 0} enquiries created, ${data.rejected || 0} rejected`);
    },
    onError: (err: Error) => {
      toast.error(`AI processing failed: ${err.message}`);
    },
  });

  const toggleIntegration = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('gmail_integrations')
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gmail-integrations'] });
      toast.success('Integration updated');
    },
  });

  const disconnectGmail = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('gmail_integrations')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gmail-integrations'] });
      toast.success('Gmail disconnected');
    },
  });

  return {
    integrations,
    syncLogs,
    isLoading,
    connectGmail: connectGmail.mutate,
    isConnecting: connectGmail.isPending,
    syncNow: syncNow.mutate,
    isSyncing: syncNow.isPending,
    processWithAI: processWithAI.mutate,
    isProcessingAI: processWithAI.isPending,
    toggleIntegration: toggleIntegration.mutate,
    disconnectGmail: disconnectGmail.mutate,
  };
}
