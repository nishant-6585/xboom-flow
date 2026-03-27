import { Card, CardContent } from '@/components/ui/card';
import { Target, Star } from 'lucide-react';
import { startOfDay, startOfWeek, startOfMonth, endOfDay } from 'date-fns';
import { Prospect } from '@/hooks/useProspects';

interface ProspectAnalyticsCardsProps {
  prospects: Prospect[];
  sourceType: 'enquiry' | 'interakt' | 'myoperator' | 'email' | 'all';
}

export function ProspectAnalyticsCards({ prospects, sourceType }: ProspectAnalyticsCardsProps) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  const filtered = sourceType === 'all' ? prospects : prospects.filter(p => p.source_type === sourceType);

  const countByPeriod = (items: Prospect[], start: Date) =>
    items.filter(p => { const d = new Date(p.created_at); return d >= start && d <= endOfDay(now); }).length;

  const aItems = filtered.filter(p => p.is_a_category);

  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20">
              <Target className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{filtered.length}</p>
              <p className="text-[10px] text-muted-foreground">Prospects</p>
            </div>
          </div>
          <div className="mt-1.5 flex gap-2 text-[10px] text-muted-foreground">
            <span className="text-amber-600 font-medium">D:{countByPeriod(filtered, todayStart)}</span>
            <span>W:{countByPeriod(filtered, weekStart)}</span>
            <span>M:{countByPeriod(filtered, monthStart)}</span>
          </div>
        </CardContent>
      </Card>
      <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-red-500/20">
              <Star className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{aItems.length}</p>
              <p className="text-[10px] text-muted-foreground">A-Category</p>
            </div>
          </div>
          <div className="mt-1.5 flex gap-2 text-[10px] text-muted-foreground">
            <span className="text-red-600 font-medium">D:{countByPeriod(aItems, todayStart)}</span>
            <span>W:{countByPeriod(aItems, weekStart)}</span>
            <span>M:{countByPeriod(aItems, monthStart)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
