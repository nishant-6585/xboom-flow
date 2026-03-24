import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, FileText, Pencil, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface SavedTemplate {
  employee_id: string;
  employee_name: string;
  template_name: string;
  task_count: number;
  total_target: number;
  total_duration: number;
}

interface TemplateBrowserProps {
  onSelectTemplate: (employeeId: string, employeeName: string) => void;
}

export function TemplateBrowser({ onSelectTemplate }: TemplateBrowserProps) {
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('daily_flow_templates')
        .select('employee_id, employee_name, template_name, sl_no, target_value, duration_mins')
        .order('employee_name');

      if (data) {
        // Group by employee_id
        const grouped = new Map<string, SavedTemplate>();
        data.forEach((row: any) => {
          const key = row.employee_id;
          if (!grouped.has(key)) {
            grouped.set(key, {
              employee_id: row.employee_id,
              employee_name: row.employee_name,
              template_name: row.template_name || 'Default Template',
              task_count: 0,
              total_target: 0,
              total_duration: 0,
            });
          }
          const g = grouped.get(key)!;
          g.task_count += 1;
          g.total_target += row.target_value || 0;
          g.total_duration += row.duration_mins || 0;
        });
        setTemplates(Array.from(grouped.values()));
      }
      setLoading(false);
    };
    fetchAll();
  }, []);

  const filtered = templates.filter(t =>
    t.employee_name.toLowerCase().includes(search.toLowerCase()) ||
    t.template_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Saved Templates ({templates.length})
          </span>
        </CardTitle>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by employee or template name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-6 text-muted-foreground animate-pulse">Loading templates...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            {search ? 'No templates match your search.' : 'No templates saved yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(t => (
              <div
                key={t.employee_id}
                className="border rounded-lg p-3 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer group"
                onClick={() => onSelectTemplate(t.employee_id, t.employee_name)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-medium text-sm">{t.employee_name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <FileText className="h-3 w-3" />
                      {t.template_name}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Pencil className="h-3.5 w-3.5 text-primary" />
                  </Button>
                </div>
                <div className="flex gap-2 mt-2">
                  <Badge variant="secondary" className="text-xs">{t.task_count} tasks</Badge>
                  <Badge variant="outline" className="text-xs">{t.total_duration} min</Badge>
                  {t.total_target > 0 && (
                    <Badge variant="outline" className="text-xs">Target: {t.total_target}</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
