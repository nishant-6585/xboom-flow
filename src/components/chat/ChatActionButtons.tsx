import { useState } from 'react';
import { Zap, Loader2, CheckCircle2, XCircle, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AIAction {
  label: string;
  action_type: string;
  payload: Record<string, unknown>;
}

/** Parse action blocks from content - handles multiple formats AI might use */
export function parseActionBlocks(content: string): { cleanContent: string; actions: AIAction[] } {
  let actions: AIAction[] = [];
  let cleanContent = content;

  // 1. Standard ```actions ... ``` blocks
  cleanContent = cleanContent.replace(/```actions\s*\n?([\s\S]*?)```/g, (_, json) => {
    try {
      const parsed = JSON.parse(json.trim());
      if (Array.isArray(parsed)) actions = [...actions, ...parsed];
    } catch { /* ignore */ }
    return '';
  });

  // 2. Loose "actions [...]" or "actions\n[...]" patterns (AI sometimes skips backticks)
  cleanContent = cleanContent.replace(/\bactions\s*\n?\s*(\[[\s\S]*?\])\s*$/gm, (_, json) => {
    try {
      const parsed = JSON.parse(json.trim());
      if (Array.isArray(parsed) && parsed.every(a => a.label && a.action_type)) {
        actions = [...actions, ...parsed];
        return '';
      }
    } catch { /* ignore */ }
    return _;
  });

  // 3. Standalone JSON arrays that look like action blocks
  cleanContent = cleanContent.replace(/\n\s*(\[\s*\{\s*"label"\s*:\s*"[^"]+"\s*,\s*"action_type"\s*:\s*"[^"]+"[\s\S]*?\}\s*\])\s*$/g, (_, json) => {
    try {
      const parsed = JSON.parse(json.trim());
      if (Array.isArray(parsed) && parsed.every(a => a.label && a.action_type)) {
        actions = [...actions, ...parsed];
        return '';
      }
    } catch { /* ignore */ }
    return _;
  });

  // 4. Clean up residual empty lines and whitespace
  cleanContent = cleanContent.replace(/\n{3,}/g, '\n\n').trim();

  return { cleanContent, actions };
}

export function ChatActionButtons({ actions }: { actions: AIAction[] }) {
  const [executing, setExecuting] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, 'success' | 'error'>>({});

  if (!actions.length) return null;

  const executeAction = async (action: AIAction, index: number) => {
    setExecuting(index);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      // Handle access request action specially
      if (action.action_type === 'request_data_access') {
        const { data: profile } = await supabase.from('profiles').select('name').eq('user_id', session.user.id).single();
        const { error } = await supabase.from('ai_access_requests').insert({
          requester_user_id: session.user.id,
          requester_name: profile?.name || 'User',
          requested_data_type: action.payload.data_type as string,
          target_description: action.payload.reason as string || 'AI data access request',
          reason: action.payload.reason as string,
          status: 'pending',
        });
        if (error) throw new Error(error.message);
        setResults(prev => ({ ...prev, [index]: 'success' }));
        toast.success('Access request submitted! The relevant team will review it shortly.');
        return;
      }

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-action-executor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action_type: action.action_type,
            payload: action.payload,
          }),
        }
      );

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Action failed');

      setResults(prev => ({ ...prev, [index]: 'success' }));
      toast.success(data.result?.message || 'Action executed successfully');
    } catch (err) {
      setResults(prev => ({ ...prev, [index]: 'error' }));
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setExecuting(null);
    }
  };

  const isAccessRequest = (action: AIAction) => action.action_type === 'request_data_access';

  return (
    <div className="mt-3 pt-2.5 border-t border-border/30 dark:border-primary/10">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
        {actions.some(isAccessRequest) ? (
          <>
            <ShieldCheck className="w-3 h-3 text-amber-500" />
            Available Actions
          </>
        ) : (
          <>
            <Zap className="w-3 h-3 text-primary" />
            Suggested Actions
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action, i) => {
          const status = results[i];
          const isRunning = executing === i;
          const isAccess = isAccessRequest(action);

          return (
            <Button
              key={i}
              variant="outline"
              size="sm"
              disabled={isRunning || status === 'success'}
              onClick={() => executeAction(action, i)}
              className={cn(
                "h-7 text-[11px] rounded-lg gap-1.5 transition-all",
                status === 'success' && "border-green-500/30 text-green-600 dark:text-green-400 bg-green-500/5",
                status === 'error' && "border-destructive/30 text-destructive",
                isAccess && !status && "border-amber-500/40 hover:border-amber-500/60 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400",
                !isAccess && !status && "border-primary/30 hover:border-primary/50 hover:bg-primary/5 dark:hover:bg-primary/10"
              )}
            >
              {isRunning ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : status === 'success' ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : status === 'error' ? (
                <XCircle className="w-3 h-3" />
              ) : isAccess ? (
                <Lock className="w-3 h-3 text-amber-500" />
              ) : (
                <Zap className="w-3 h-3 text-primary" />
              )}
              {status === 'success' && isAccess ? 'Request Sent' : action.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
