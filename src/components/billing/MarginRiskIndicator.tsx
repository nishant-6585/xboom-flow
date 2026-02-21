import { AlertTriangle, CheckCircle, ShieldAlert, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { QuoteMarginResult, MarginAnalysis } from '@/hooks/useMarginGuardrail';

interface MarginRiskIndicatorProps {
  analysis: QuoteMarginResult | null;
  compact?: boolean;
}

const riskConfig = {
  safe: { icon: CheckCircle, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', label: 'Margin Safe' },
  warning: { icon: AlertTriangle, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', label: 'Margin Warning' },
  danger: { icon: ShieldAlert, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', label: 'Below Threshold' },
  unknown: { icon: HelpCircle, color: 'text-muted-foreground', bg: 'bg-muted', label: 'No Cost Data' },
};

export function MarginRiskIndicator({ analysis, compact = false }: MarginRiskIndicatorProps) {
  if (!analysis) return null;

  const config = riskConfig[analysis.worstRiskLevel];
  const Icon = config.icon;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className={`${config.bg} ${config.color} border-0 gap-1`}>
              <Icon className="h-3 w-3" />
              {analysis.overallMarginPercent != null ? `${analysis.overallMarginPercent}%` : '—'}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">{config.label}</p>
            {analysis.overallMarginPercent != null && (
              <p className="text-xs">Overall margin: {analysis.overallMarginPercent}%</p>
            )}
            {analysis.requiresApproval && (
              <p className="text-xs text-red-400 font-medium">⚠ Admin approval required</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={`rounded-lg p-3 ${config.bg} border`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${config.color}`} />
        <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
        {analysis.overallMarginPercent != null && (
          <span className="text-sm text-muted-foreground ml-auto">
            Overall: {analysis.overallMarginPercent}%
          </span>
        )}
      </div>

      {analysis.requiresApproval && (
        <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-2">
          ⚠ This quote requires Admin/Finance approval due to below-threshold margins
        </p>
      )}

      {analysis.items.filter(i => i.riskLevel !== 'safe' && i.riskLevel !== 'unknown').length > 0 && (
        <div className="space-y-1 mt-2">
          {analysis.items
            .filter(i => i.riskLevel !== 'safe' && i.riskLevel !== 'unknown')
            .map((item, idx) => {
              const itemConfig = riskConfig[item.riskLevel];
              return (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span className="truncate max-w-[200px]">{item.itemName}</span>
                  <span className={itemConfig.color}>
                    {item.marginPercent != null ? `${item.marginPercent}%` : '—'} (min: {item.thresholdPercent}%)
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
