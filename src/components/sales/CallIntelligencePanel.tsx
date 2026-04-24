import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useCallIntelligence, CallAiAnalysis } from '@/hooks/useCallIntelligence';
import { useAuth } from '@/hooks/useAuth';
import { CallButton } from '@/components/calls/CallButton';
import {
  Phone, PhoneCall, PhoneOff, PhoneMissed, Play, Brain,
  ChevronDown, Clock, Target, MessageSquare, Loader2,
  TrendingUp, AlertTriangle, CheckCircle2, Zap,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface CallIntelligencePanelProps {
  leadId: string;
  customerPhone?: string | null;
  customerName?: string | null;
}

export function CallIntelligencePanel({ leadId, customerPhone, customerName }: CallIntelligencePanelProps) {
  const { callLogs, loadingCalls, triggerAnalysis, fetchAnalysis, refetchCalls } = useCallIntelligence(leadId);
  const { role } = useAuth();
  const [analysisMap, setAnalysisMap] = useState<Record<string, CallAiAnalysis>>({});
  const [loadingAnalysis, setLoadingAnalysis] = useState<Record<string, boolean>>({});
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  // Load analysis for each call log
  useEffect(() => {
    callLogs.forEach(async (log) => {
      if (!analysisMap[log.id] && !loadingAnalysis[log.id]) {
        setLoadingAnalysis(prev => ({ ...prev, [log.id]: true }));
        const analysis = await fetchAnalysis(log.id);
        if (analysis) {
          setAnalysisMap(prev => ({ ...prev, [log.id]: analysis }));
        }
        setLoadingAnalysis(prev => ({ ...prev, [log.id]: false }));
      }
    });
  }, [callLogs]);

  const handleTriggerAnalysis = async (callLogId: string, recordingUrl?: string | null) => {
    setAnalyzingId(callLogId);
    const success = await triggerAnalysis(callLogId, recordingUrl || undefined);
    if (success) {
      const analysis = await fetchAnalysis(callLogId);
      if (analysis) {
        setAnalysisMap(prev => ({ ...prev, [callLogId]: analysis }));
      }
    }
    setAnalyzingId(null);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <PhoneCall className="h-4 w-4 text-green-500" />;
      case 'failed': case 'missed': return <PhoneMissed className="h-4 w-4 text-destructive" />;
      case 'ringing': return <Phone className="h-4 w-4 text-yellow-500 animate-pulse" />;
      case 'initiated': return <Phone className="h-4 w-4 text-blue-500" />;
      default: return <PhoneOff className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getIntentBadge = (intent: string | null) => {
    if (!intent) return null;
    const styles: Record<string, string> = {
      hot: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      warm: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      cold: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    };
    return (
      <Badge className={cn('capitalize', styles[intent] || '')}>
        {intent === 'hot' && <TrendingUp className="h-3 w-3 mr-1" />}
        {intent === 'warm' && <Target className="h-3 w-3 mr-1" />}
        {intent === 'cold' && <AlertTriangle className="h-3 w-3 mr-1" />}
        {intent}
      </Badge>
    );
  };

  const getSentimentColor = (sentiment: string | null) => {
    if (!sentiment) return 'text-muted-foreground';
    switch (sentiment) {
      case 'positive': return 'text-green-600 dark:text-green-400';
      case 'negative': return 'text-red-600 dark:text-red-400';
      default: return 'text-yellow-600 dark:text-yellow-400';
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  // Latest analysis for the summary card
  const latestAnalysis = callLogs.length > 0 ? analysisMap[callLogs[0].id] : null;

  return (
    <div className="space-y-4">
      {/* Header with Call Action */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Call Intelligence
        </h3>
        {customerPhone && (
          <CallButton
            phoneNumber={customerPhone}
            entityType="lead"
            entityId={leadId}
            label="Call Now"
            variant="default"
            onAfterCall={refetchCalls}
          />
        )}
      </div>

      {/* AI Insights Summary Card */}
      {latestAnalysis && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              Latest AI Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {getIntentBadge(latestAnalysis.intent)}
              <Badge variant="outline" className={cn('capitalize', getSentimentColor(latestAnalysis.sentiment))}>
                {latestAnalysis.sentiment || 'unknown'} sentiment
              </Badge>
              {latestAnalysis.confidence_score && (
                <Badge variant="outline">
                  {latestAnalysis.confidence_score}% confidence
                </Badge>
              )}
            </div>

            {latestAnalysis.summary && (
              <p className="text-sm text-muted-foreground">{latestAnalysis.summary}</p>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              {latestAnalysis.budget && latestAnalysis.budget !== 'unknown' && (
                <div>
                  <p className="text-muted-foreground text-xs">Budget</p>
                  <p className="font-medium">{latestAnalysis.budget}</p>
                </div>
              )}
              {latestAnalysis.timeline && latestAnalysis.timeline !== 'unknown' && (
                <div>
                  <p className="text-muted-foreground text-xs">Timeline</p>
                  <p className="font-medium">{latestAnalysis.timeline}</p>
                </div>
              )}
            </div>

            {latestAnalysis.next_action && (
              <div className="p-2 bg-background rounded-md border">
                <p className="text-xs text-muted-foreground mb-1">Recommended Action</p>
                <p className="text-sm font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  {latestAnalysis.next_action}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Call History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Call History ({callLogs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCalls ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : callLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No calls recorded for this lead</p>
            </div>
          ) : (
            <div className="space-y-2">
              {callLogs.map((log) => {
                const analysis = analysisMap[log.id];
                return (
                  <Collapsible key={log.id}>
                    <div className="border rounded-lg">
                      <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(log.call_status)}
                          <div className="text-left">
                            <p className="text-sm font-medium capitalize">
                              {log.call_type || 'call'} — {log.call_status}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {log.start_time
                                ? format(new Date(log.start_time), 'MMM dd, yyyy HH:mm')
                                : format(new Date(log.created_at), 'MMM dd, yyyy HH:mm')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {analysis && getIntentBadge(analysis.intent)}
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDuration(log.call_duration)}
                          </span>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="px-3 pb-3 space-y-3 border-t pt-3">
                          {/* Call Details */}
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">Phone</p>
                              <p className="font-mono text-xs">{log.caller_number}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Agent</p>
                              <p>{log.sales_person_name || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Duration</p>
                              <p>{formatDuration(log.call_duration)}</p>
                            </div>
                          </div>

                          {/* Recording */}
                          {(log.recording_url || log.recording_stream_url) && (
                            <div className="flex items-center gap-2">
                              <Play className="h-4 w-4 text-primary" />
                              <audio
                                controls
                                src={log.recording_stream_url || log.recording_url || ''}
                                className="h-8 flex-1"
                                preload="none"
                              />
                            </div>
                          )}

                          {/* AI Analysis */}
                          {analysis ? (
                            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <Brain className="h-4 w-4 text-primary" />
                                AI Analysis
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {getIntentBadge(analysis.intent)}
                                <Badge variant="outline" className={cn('text-xs capitalize', getSentimentColor(analysis.sentiment))}>
                                  {analysis.sentiment}
                                </Badge>
                              </div>
                              {analysis.summary && (
                                <p className="text-sm text-muted-foreground">{analysis.summary}</p>
                              )}
                              {analysis.next_action && (
                                <p className="text-xs text-foreground">
                                  <strong>Next:</strong> {analysis.next_action}
                                </p>
                              )}
                              {analysis.key_requirements && analysis.key_requirements.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Requirements:</p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {analysis.key_requirements.map((req, i) => (
                                      <Badge key={i} variant="outline" className="text-xs">{req}</Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTriggerAnalysis(log.id, log.recording_url)}
                              disabled={analyzingId === log.id}
                            >
                              {analyzingId === log.id ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Brain className="h-4 w-4 mr-2" />
                              )}
                              {analyzingId === log.id ? 'Analyzing...' : 'Run AI Analysis'}
                            </Button>
                          )}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
