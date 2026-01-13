import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Star, TrendingUp, Clock, MessageSquare, DollarSign, Package } from 'lucide-react';
import { SupplierScore } from '@/hooks/useSupplierRatings';

interface SupplierScoreBadgeProps {
  score: SupplierScore | null;
  size?: 'sm' | 'md' | 'lg';
  showDetails?: boolean;
}

export const SupplierScoreBadge: React.FC<SupplierScoreBadgeProps> = ({
  score,
  size = 'sm',
  showDetails = false
}) => {
  if (!score || score.total_ratings === 0) {
    return (
      <Badge variant="outline" className="text-muted-foreground text-xs">
        No ratings
      </Badge>
    );
  }

  const getScoreColor = (value: number | null) => {
    if (value === null) return 'text-muted-foreground';
    if (value >= 4) return 'text-green-600';
    if (value >= 3) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (value: number | null) => {
    if (value === null) return 'bg-muted';
    if (value >= 4) return 'bg-green-500';
    if (value >= 3) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const overallScore = score.overall_score || 0;
  const sizeClass = size === 'sm' ? 'text-xs px-1.5 py-0.5' : size === 'md' ? 'text-sm px-2 py-1' : 'text-base px-3 py-1.5';

  if (!showDetails) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              className={`${getScoreBgColor(overallScore)} text-white ${sizeClass} gap-1 cursor-help`}
            >
              <Star className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} fill="currentColor" />
              {overallScore.toFixed(1)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="w-64 p-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between font-medium">
                <span>Supplier Score</span>
                <span className={getScoreColor(overallScore)}>{overallScore.toFixed(1)}/5</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Based on {score.total_ratings} rating{score.total_ratings !== 1 ? 's' : ''}
              </div>
              <div className="space-y-1.5 pt-2 border-t">
                <ScoreRow icon={Clock} label="Delivery" value={score.avg_delivery} />
                <ScoreRow icon={Package} label="Quality" value={score.avg_quality} />
                <ScoreRow icon={DollarSign} label="Pricing" value={score.avg_pricing} />
                <ScoreRow icon={MessageSquare} label="Communication" value={score.avg_communication} />
              </div>
              {score.on_time_percentage !== null && (
                <div className="pt-2 border-t flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    On-time delivery
                  </span>
                  <span className={getScoreColor(score.on_time_percentage >= 80 ? 4 : score.on_time_percentage >= 60 ? 3 : 2)}>
                    {score.on_time_percentage}%
                  </span>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Detailed view
  return (
    <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
      <div className="flex items-center justify-between">
        <span className="font-medium flex items-center gap-2">
          <Star className="h-4 w-4 text-yellow-500" fill="currentColor" />
          Overall Score
        </span>
        <Badge className={`${getScoreBgColor(overallScore)} text-white`}>
          {overallScore.toFixed(1)}/5
        </Badge>
      </div>
      <div className="text-xs text-muted-foreground">
        Based on {score.total_ratings} rating{score.total_ratings !== 1 ? 's' : ''}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ScoreCard icon={Clock} label="Delivery" value={score.avg_delivery} />
        <ScoreCard icon={Package} label="Quality" value={score.avg_quality} />
        <ScoreCard icon={DollarSign} label="Pricing" value={score.avg_pricing} />
        <ScoreCard icon={MessageSquare} label="Communication" value={score.avg_communication} />
      </div>
      {score.on_time_percentage !== null && (
        <div className="flex items-center justify-between text-sm pt-2 border-t">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            On-time delivery rate
          </span>
          <span className={`font-medium ${getScoreColor(score.on_time_percentage >= 80 ? 4 : score.on_time_percentage >= 60 ? 3 : 2)}`}>
            {score.on_time_percentage}%
          </span>
        </div>
      )}
    </div>
  );
};

const ScoreRow: React.FC<{ icon: any; label: string; value: number | null }> = ({ icon: Icon, label, value }) => {
  const getColor = (v: number | null) => {
    if (v === null) return 'text-muted-foreground';
    if (v >= 4) return 'text-green-600';
    if (v >= 3) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className={getColor(value)}>
        {value !== null ? `${value.toFixed(1)}/5` : 'N/A'}
      </span>
    </div>
  );
};

const ScoreCard: React.FC<{ icon: any; label: string; value: number | null }> = ({ icon: Icon, label, value }) => {
  const getColor = (v: number | null) => {
    if (v === null) return 'text-muted-foreground';
    if (v >= 4) return 'text-green-600';
    if (v >= 3) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="p-2 bg-background rounded border text-center">
      <Icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
      <div className={`text-sm font-medium ${getColor(value)}`}>
        {value !== null ? value.toFixed(1) : '-'}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
};
