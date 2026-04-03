import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, CreditCard, AlertTriangle, Download, Zap } from 'lucide-react';

interface Props {
  onAddStatement: () => void;
  onAddCard: () => void;
  onExport: () => void;
  overdueCount: number;
}

export function CCQuickActions({ onAddStatement, onAddCard, onExport, overdueCount }: Props) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4 flex flex-col gap-2">
        <Button variant="outline" size="sm" className="justify-start h-9 text-xs" onClick={onAddStatement}>
          <FileText className="h-3.5 w-3.5 mr-2" />Add Statement
        </Button>
        <Button variant="outline" size="sm" className="justify-start h-9 text-xs" onClick={onAddCard}>
          <CreditCard className="h-3.5 w-3.5 mr-2" />Add Card
        </Button>
        <Button variant="outline" size="sm" className="justify-start h-9 text-xs" onClick={onExport}>
          <Download className="h-3.5 w-3.5 mr-2" />Export Report
        </Button>
        {overdueCount > 0 && (
          <Button variant="outline" size="sm" className="justify-start h-9 text-xs text-destructive border-destructive/30">
            <AlertTriangle className="h-3.5 w-3.5 mr-2" />{overdueCount} Overdue
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
