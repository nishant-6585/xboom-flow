import { useState } from 'react';
import { Sparkles, Target, MessageSquare, AlertTriangle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface EnquiryData {
  customer_name: string;
  customer_company: string;
  product_name: string;
  product_category: string;
  quantity: number;
  urgency: string;
  lead_temperature?: string | null;
  is_mega_deal?: boolean | null;
  notes?: string | null;
  requested_timeline?: string | null;
  response_pricing?: string | null;
  response_availability?: string | null;
  status: string;
}

interface LeadAnalysis {
  score: number;
  score_label: string;
  confidence: string;
  summary: string;
  key_factors: string[];
  suggested_approach: string;
  priority_actions: string[];
  talking_points: string[];
  risk_factors: string[];
  recommended_timeline: string;
}

interface AILeadScoringProps {
  enquiry: EnquiryData;
  className?: string;
}

export function AILeadScoring({ enquiry, className }: AILeadScoringProps) {
  const [analysis, setAnalysis] = useState<LeadAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const analyzeEnquiry = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-lead-scoring`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ enquiry }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      const data = await response.json();
      setAnalysis(data.analysis);
      toast.success('AI analysis complete');
    } catch (error) {
      console.error('AI analysis error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to analyze lead');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-500';
    if (score >= 6) return 'text-yellow-500';
    if (score >= 4) return 'text-orange-500';
    return 'text-red-500';
  };

  const getScoreBg = (score: number) => {
    if (score >= 8) return 'bg-green-500/10 border-green-500/20';
    if (score >= 6) return 'bg-yellow-500/10 border-yellow-500/20';
    if (score >= 4) return 'bg-orange-500/10 border-orange-500/20';
    return 'bg-red-500/10 border-red-500/20';
  };

  if (!analysis) {
    return (
      <div className={className}>
        <Button
          onClick={analyzeEnquiry}
          disabled={loading}
          variant="outline"
          className="w-full gap-2"
        >
          <Sparkles className={cn('w-4 h-4', loading && 'animate-pulse')} />
          {loading ? 'Analyzing Lead...' : 'AI Lead Analysis'}
        </Button>
      </div>
    );
  }

  return (
    <Card className={cn('border-primary/20', className)}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-primary" />
              AI Lead Analysis
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className={cn('flex items-center gap-2 px-3 py-1 rounded-full border', getScoreBg(analysis.score))}>
                <span className={cn('text-2xl font-bold', getScoreColor(analysis.score))}>
                  {analysis.score}
                </span>
                <span className="text-xs text-muted-foreground">/10</span>
              </div>
              <Badge variant={
                analysis.score_label === 'Hot' ? 'destructive' :
                analysis.score_label === 'Warm' ? 'default' : 'secondary'
              }>
                {analysis.score_label}
              </Badge>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{analysis.summary}</p>
          <Badge variant="outline" className="w-fit text-xs">
            Confidence: {analysis.confidence}
          </Badge>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {/* Key Factors */}
            <div>
              <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-primary" />
                Key Factors
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {analysis.key_factors.map((factor, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {factor}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Suggested Approach */}
            <div>
              <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Suggested Approach
              </h4>
              <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                {analysis.suggested_approach}
              </p>
            </div>

            {/* Priority Actions */}
            <div>
              <h4 className="text-sm font-medium mb-2">Priority Actions</h4>
              <ul className="space-y-1">
                {analysis.priority_actions.map((action, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-primary font-medium">{i + 1}.</span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>

            {/* Talking Points */}
            <div>
              <h4 className="text-sm font-medium mb-2">Talking Points</h4>
              <ul className="space-y-1">
                {analysis.talking_points.map((point, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-muted-foreground">•</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            {/* Risk Factors */}
            {analysis.risk_factors.length > 0 && (
              <div>
                <h4 className="text-sm font-medium flex items-center gap-2 mb-2 text-orange-500">
                  <AlertTriangle className="w-4 h-4" />
                  Risk Factors
                </h4>
                <ul className="space-y-1">
                  {analysis.risk_factors.map((risk, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-orange-500">⚠</span>
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Timeline */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">
                <span className="font-medium">Follow-up:</span>{' '}
                <span className="text-muted-foreground">{analysis.recommended_timeline}</span>
              </span>
            </div>

            {/* Re-analyze button */}
            <Button
              onClick={analyzeEnquiry}
              disabled={loading}
              variant="outline"
              size="sm"
              className="w-full gap-2"
            >
              <Sparkles className={cn('w-3 h-3', loading && 'animate-pulse')} />
              {loading ? 'Re-analyzing...' : 'Re-analyze'}
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
