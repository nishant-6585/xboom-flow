import { Card, CardContent } from '@/components/ui/card';
import { Target, Star, TrendingUp, Calendar } from 'lucide-react';
import { startOfDay, startOfWeek, startOfMonth, endOfDay } from 'date-fns';

interface AnalyticsItem {
  created_at: string;
  is_prospect?: boolean;
  is_a_category?: boolean;
  is_mega_deal?: boolean;
}

interface ProspectAnalyticsCardsProps {
  items: AnalyticsItem[];
  sourceLabel: string;
  prospectField?: 'is_prospect';
  aCategoryField?: 'is_a_category' | 'is_mega_deal';
}

export function ProspectAnalyticsCards({
  items,
  sourceLabel,
  prospectField = 'is_prospect',
  aCategoryField = 'is_a_category',
}: ProspectAnalyticsCardsProps) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  const getField = (item: AnalyticsItem, field: string): boolean => {
    return !!(item as any)[field];
  };

  const countByPeriod = (field: string, start: Date) => {
    return items.filter(item => {
      if (!getField(item, field)) return false;
      const d = new Date(item.created_at);
      return d >= start && d <= endOfDay(now);
    }).length;
  };

  const totalProspects = items.filter(i => getField(i, prospectField)).length;
  const todayProspects = countByPeriod(prospectField, todayStart);
  const weekProspects = countByPeriod(prospectField, weekStart);
  const monthProspects = countByPeriod(prospectField, monthStart);

  const totalA = items.filter(i => getField(i, aCategoryField)).length;
  const todayA = countByPeriod(aCategoryField, todayStart);
  const weekA = countByPeriod(aCategoryField, weekStart);
  const monthA = countByPeriod(aCategoryField, monthStart);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20">
              <Target className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{totalProspects}</p>
              <p className="text-[10px] text-muted-foreground">Prospects</p>
            </div>
          </div>
          <div className="mt-1.5 flex gap-2 text-[10px] text-muted-foreground">
            <span className="text-amber-600 font-medium">D:{todayProspects}</span>
            <span>W:{weekProspects}</span>
            <span>M:{monthProspects}</span>
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
              <p className="text-lg font-bold">{totalA}</p>
              <p className="text-[10px] text-muted-foreground">A-Category</p>
            </div>
          </div>
          <div className="mt-1.5 flex gap-2 text-[10px] text-muted-foreground">
            <span className="text-red-600 font-medium">D:{todayA}</span>
            <span>W:{weekA}</span>
            <span>M:{monthA}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
