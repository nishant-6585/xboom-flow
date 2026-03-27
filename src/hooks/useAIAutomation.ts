import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AIAutoRule {
  id: string;
  rule_name: string;
  description: string | null;
  trigger_type: string;
  condition: Record<string, unknown>;
  action_type: string;
  payload: Record<string, unknown>;
  risk_level: string;
  requires_approval: boolean;
  allowed_roles: string[];
  is_active: boolean;
  created_by: string;
  created_by_name: string;
  created_at: string;
}

export interface AIPolicy {
  id: string;
  policy_name: string;
  description: string | null;
  role: string;
  allowed_actions: string[];
  blocked_actions: string[];
  amount_threshold: number | null;
  requires_approval_above: number | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export interface AIActionQueueItem {
  id: string;
  rule_id: string | null;
  action_type: string;
  payload: Record<string, unknown>;
  status: string;
  risk_level: string;
  requires_approval: boolean;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  executed_at: string | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  retry_count: number;
  triggered_by: string;
  user_id: string;
  user_name: string;
  created_at: string;
}

export function useAIAutomation() {
  const [rules, setRules] = useState<AIAutoRule[]>([]);
  const [policies, setPolicies] = useState<AIPolicy[]>([]);
  const [queue, setQueue] = useState<AIActionQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    const { data } = await supabase.from('ai_auto_rules').select('*').order('created_at', { ascending: false });
    if (data) setRules(data as unknown as AIAutoRule[]);
  }, []);

  const fetchPolicies = useCallback(async () => {
    const { data } = await supabase.from('ai_policies').select('*').order('created_at', { ascending: false });
    if (data) setPolicies(data as unknown as AIPolicy[]);
  }, []);

  const fetchQueue = useCallback(async () => {
    const { data } = await supabase.from('ai_action_queue').select('*').order('created_at', { ascending: false }).limit(100);
    if (data) setQueue(data as unknown as AIActionQueueItem[]);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchRules(), fetchPolicies(), fetchQueue()]);
    setLoading(false);
  }, [fetchRules, fetchPolicies, fetchQueue]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggleRule = async (ruleId: string, isActive: boolean) => {
    const { error } = await supabase.from('ai_auto_rules').update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('id', ruleId);
    if (error) { toast.error('Failed to update rule'); return; }
    toast.success(isActive ? 'Rule activated' : 'Rule deactivated');
    fetchRules();
  };

  const approveQueueItem = async (itemId: string, userName: string, userId: string) => {
    const { error } = await supabase.from('ai_action_queue').update({
      status: 'approved',
      approved_by: userId,
      approved_by_name: userName,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', itemId);
    if (error) { toast.error('Failed to approve'); return; }
    toast.success('Action approved — will be executed shortly');
    fetchQueue();
  };

  const rejectQueueItem = async (itemId: string) => {
    const { error } = await supabase.from('ai_action_queue').update({
      status: 'rejected',
      updated_at: new Date().toISOString(),
    }).eq('id', itemId);
    if (error) { toast.error('Failed to reject'); return; }
    toast.success('Action rejected');
    fetchQueue();
  };

  const createRule = async (rule: Partial<AIAutoRule>) => {
    const { error } = await supabase.from('ai_auto_rules').insert(rule as any);
    if (error) { toast.error('Failed to create rule: ' + error.message); return false; }
    toast.success('Rule created');
    fetchRules();
    return true;
  };

  const createPolicy = async (policy: Partial<AIPolicy>) => {
    const { error } = await supabase.from('ai_policies').insert(policy as any);
    if (error) { toast.error('Failed to create policy: ' + error.message); return false; }
    toast.success('Policy created');
    fetchPolicies();
    return true;
  };

  const deleteRule = async (ruleId: string) => {
    const { error } = await supabase.from('ai_auto_rules').delete().eq('id', ruleId);
    if (error) { toast.error('Failed to delete rule'); return; }
    toast.success('Rule deleted');
    fetchRules();
  };

  return {
    rules, policies, queue, loading, refresh,
    toggleRule, approveQueueItem, rejectQueueItem,
    createRule, createPolicy, deleteRule,
  };
}
