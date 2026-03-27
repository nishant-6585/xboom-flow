import { useState } from 'react';
import { Zap, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AIAction {
  label: string;
  action_type: string;
  payload: Record<string, unknown>;
}

/** Parse ```actions [...] ``` blocks from content */
export function parseActionBlocks(content: string): { cleanContent: string; actions: AIAction[] } {
  const actionRegex = /```actions\s*\n?([\s\S]*?)```/g;
  let actions: AIAction[] = [];
  const cleanContent = content.replace(actionRegex, (_, json) => {
    try {
      const parsed = JSON.parse(json.trim());
      if (Array.isArray(parsed)) actions = parsed;
    } catch { /* ignore parse errors */ }
    return '';
  }).trim();
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

  return (
    <div className="mt-3 pt-2.5 border-t border-border/30 dark:border-primary/10">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
        <Zap className="w-3 h-3 text-primary" />
        Suggested Actions
      </p>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action, i) => {
          const status = results[i];
          const isRunning = executing === i;

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
                !status && "border-primary/30 hover:border-primary/50 hover:bg-primary/5 dark:hover:bg-primary/10"
              )}
            >
              {isRunning ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : status === 'success' ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : status === 'error' ? (
                <XCircle className="w-3 h-3" />
              ) : (
                <Zap className="w-3 h-3 text-primary" />
              )}
              {action.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
