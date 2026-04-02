import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  Brain, Loader2, AlertTriangle, Clock, CheckCircle2, XCircle,
  Zap, ChevronDown, ChevronUp, Lightbulb
} from 'lucide-react';

interface Suggestion {
  type: 'gap' | 'overlap' | 'optimization' | 'workload' | 'missing';
  message: string;
  action: string;
  severity: 'low' | 'medium' | 'high';
  affected_rows?: number[];
  fix_data?: any;
}

interface AnalysisSummary {
  employee_name: string;
  total_tasks: number;
  total_work_minutes: number;
  total_break_minutes: number;
  gaps_detected: number;
  overlaps_detected: number;
  optimization_count: number;
  overall_health: 'excellent' | 'good' | 'needs_attention' | 'critical';
}

interface Props {
  items: any[];
  employeeName: string;
  onAutoFix?: (fix: any) => void;
}

const severityColors: Record<string, string> = {
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  high: 'bg-destructive/10 text-destructive',
};

const typeIcons: Record<string, React.ReactNode> = {
  gap: <Clock className="h-4 w-4" />,
  overlap: <XCircle className="h-4 w-4" />,
  optimization: <Lightbulb className="h-4 w-4" />,
  workload: <AlertTriangle className="h-4 w-4" />,
  missing: <AlertTriangle className="h-4 w-4" />,
};

const healthColors: Record<string, string> = {
  excellent: 'text-green-600',
  good: 'text-primary',
  needs_attention: 'text-amber-600',
  critical: 'text-destructive',
};

const healthLabels: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  needs_attention: 'Needs Attention',
  critical: 'Critical',
};

export function DailyFlowAISuggestions({ items, employeeName, onAutoFix }: Props) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [dismissedIndices, setDismissedIndices] = useState<Set<number>>(new Set());

  const analyze = async () => {
    if (!items.length) {
      toast.info('No tasks to analyze');
      return;
    }
    setLoading(true);
    setDismissedIndices(new Set());
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Not authenticated'); return; }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-daily-flow`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ items, employee_name: employeeName }),
        }
      );

      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Analysis failed'); return; }

      setSuggestions(data.suggestions || []);
      setSummary(data.summary || null);

      if (data.suggestions.length === 0) {
        toast.success('No issues detected — schedule looks great!');
      } else {
        toast.info(`Found ${data.suggestions.length} suggestion(s)`);
      }
    } catch (e: any) {
      toast.error(e.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const dismiss = (idx: number) => {
    setDismissedIndices(prev => new Set(prev).add(idx));
  };

  const activeSuggestions = suggestions.filter((_, i) => !dismissedIndices.has(i));

  if (!summary && !loading) {
    return (
      <Button variant="outline" size="sm" onClick={analyze} className="gap-1.5">
        <Brain className="h-4 w-4" /> Analyze Flow
      </Button>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            AI Flow Analysis
            {summary && (
              <Badge className={`text-xs ${severityColors[summary.overall_health === 'excellent' ? 'low' : summary.overall_health === 'critical' ? 'high' : 'medium']}`}>
                {healthLabels[summary.overall_health]}
              </Badge>
            )}
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={analyze} disabled={loading} className="h-7 text-xs">
              {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
              Re-analyze
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3 pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Analyzing schedule...
            </div>
          ) : (
            <>
              {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-muted rounded-lg p-2 text-center">
                    <p className="font-bold text-lg">{summary.total_tasks}</p>
                    <p className="text-muted-foreground">Tasks</p>
                  </div>
                  <div className="bg-muted rounded-lg p-2 text-center">
                    <p className="font-bold text-lg">{(summary.total_work_minutes / 60).toFixed(1)}h</p>
                    <p className="text-muted-foreground">Work Time</p>
                  </div>
                  <div className="bg-muted rounded-lg p-2 text-center">
                    <p className="font-bold text-lg">{summary.gaps_detected}</p>
                    <p className="text-muted-foreground">Gaps</p>
                  </div>
                  <div className="bg-muted rounded-lg p-2 text-center">
                    <p className="font-bold text-lg">{summary.overlaps_detected}</p>
                    <p className="text-muted-foreground">Overlaps</p>
                  </div>
                </div>
              )}

              {activeSuggestions.length === 0 && summary ? (
                <div className="flex items-center gap-2 py-3 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" /> Schedule looks great — no issues detected!
                </div>
              ) : (
                <ScrollArea className="max-h-[300px]">
                  <div className="space-y-2">
                    {activeSuggestions.map((s, realIdx) => {
                      const origIdx = suggestions.indexOf(s);
                      return (
                        <div key={origIdx} className="border rounded-lg p-3 space-y-1.5">
                          <div className="flex items-start gap-2">
                            <span className={severityColors[s.severity]}>
                              {typeIcons[s.type]}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium">{s.message}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{s.action}</p>
                            </div>
                            <Badge className={`text-[10px] shrink-0 ${severityColors[s.severity]}`}>
                              {s.severity}
                            </Badge>
                          </div>
                          <div className="flex gap-1.5 justify-end">
                            {s.fix_data && onAutoFix && (
                              <Button size="sm" variant="default" className="h-6 text-xs" onClick={() => { onAutoFix(s.fix_data); dismiss(origIdx); }}>
                                <Zap className="h-3 w-3 mr-1" /> Auto Fix
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => dismiss(origIdx)}>
                              Ignore
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
