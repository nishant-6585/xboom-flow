import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTasks, Task } from '@/hooks/useTasks';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import { 
  ListTodo, AlertTriangle, Clock, CheckCircle2, 
  ArrowRight, Users, TrendingUp 
} from 'lucide-react';
import { startOfWeek, isWithinInterval, endOfWeek, differenceInHours, startOfDay, isAfter } from 'date-fns';

interface MetricCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  variant?: 'default' | 'warning' | 'success' | 'destructive';
  description?: string;
}

function MetricCard({ title, value, icon, variant = 'default', description }: MetricCardProps) {
  const bgColors = {
    default: 'bg-primary/10 text-primary',
    warning: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    success: 'bg-green-500/10 text-green-600 dark:text-green-400',
    destructive: 'bg-red-500/10 text-red-600 dark:text-red-400',
  };

  const isZero = value === 0;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <div className={`p-2.5 rounded-lg ${isZero ? 'bg-muted text-muted-foreground' : bgColors[variant]}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-2xl font-bold tabular-nums ${isZero ? 'text-muted-foreground' : ''}`}>{value}</p>
        <p className="text-xs text-muted-foreground truncate">{title}</p>
        {description && (
          <p className="text-[10px] text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}

export function TaskMetricsWidget() {
  const { tasks, taskCounts, loading, overdueTasks } = useTasks();
  const { role, user } = useAuth();

  // Calculate metrics
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const todayStart = startOfDay(now);

  const myOpenTasks = tasks.filter(t => t.assigned_to === user?.id && t.status !== 'completed').length;
  const myOverdueTasks = overdueTasks.filter(t => t.assigned_to === user?.id).length;
  const tasksDueToday = tasks.filter(t => 
    t.due_date && 
    startOfDay(new Date(t.due_date)).getTime() === todayStart.getTime() &&
    t.status !== 'completed'
  ).length;
  const completedThisWeek = tasks.filter(t => 
    t.status === 'completed' && 
    t.completed_at &&
    isWithinInterval(new Date(t.completed_at), { start: weekStart, end: weekEnd })
  ).length;

  // Team metrics (for admin/manager)
  const isManager = role === 'admin' || role === 'supply_chain';

  const tasksByDepartment = tasks.reduce((acc, task) => {
    const dept = task.assigned_role || 'other';
    acc[dept] = (acc[dept] || 0) + (task.status !== 'completed' ? 1 : 0);
    return acc;
  }, {} as Record<string, number>);

  // Calculate avg completion time for completed tasks this week
  const completedTasksWithTime = tasks.filter(t => 
    t.status === 'completed' && 
    t.completed_at && 
    t.created_at &&
    isWithinInterval(new Date(t.completed_at), { start: weekStart, end: weekEnd })
  );
  const avgCompletionHours = completedTasksWithTime.length > 0
    ? Math.round(completedTasksWithTime.reduce((acc, t) => 
        acc + differenceInHours(new Date(t.completed_at!), new Date(t.created_at)), 0
      ) / completedTasksWithTime.length)
    : 0;

  // Most overdue tasks
  const topOverdueTasks = overdueTasks
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 5);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-muted rounded w-1/3"></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-20 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ListTodo className="w-5 h-5" />
            Task Overview
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/tasks">
              View All
              <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Personal Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            title="My Open Tasks"
            value={myOpenTasks}
            icon={<ListTodo className="w-4 h-4" />}
            variant="default"
          />
          <MetricCard
            title="Overdue Tasks"
            value={myOverdueTasks}
            icon={<AlertTriangle className="w-4 h-4" />}
            variant={myOverdueTasks > 0 ? 'destructive' : 'default'}
          />
          <MetricCard
            title="Due Today"
            value={tasksDueToday}
            icon={<Clock className="w-4 h-4" />}
            variant={tasksDueToday > 0 ? 'warning' : 'default'}
          />
          <MetricCard
            title="Completed This Week"
            value={completedThisWeek}
            icon={<CheckCircle2 className="w-4 h-4" />}
            variant="success"
          />
        </div>

        {/* Team Metrics (for managers) */}
        {isManager && (
          <>
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Team Metrics
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard
                  title="Sales Tasks"
                  value={tasksByDepartment['sales'] || 0}
                  icon={<TrendingUp className="w-4 h-4" />}
                />
                <MetricCard
                  title="Supply Chain Tasks"
                  value={tasksByDepartment['supply_chain'] || 0}
                  icon={<TrendingUp className="w-4 h-4" />}
                />
                <MetricCard
                  title="Finance Tasks"
                  value={tasksByDepartment['finance'] || 0}
                  icon={<TrendingUp className="w-4 h-4" />}
                />
                <MetricCard
                  title="Avg Completion"
                  value={avgCompletionHours}
                  icon={<Clock className="w-4 h-4" />}
                  description="hours"
                />
              </div>
            </div>

            {/* Bottleneck List */}
            {topOverdueTasks.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  Most Overdue Tasks
                </h4>
                <div className="space-y-2">
                  {topOverdueTasks.map(task => (
                    <div 
                      key={task.id} 
                      className="flex items-center justify-between p-2 rounded-lg bg-destructive/5 border border-destructive/20"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Assigned to: {task.assigned_to_name}
                        </p>
                      </div>
                      <Badge variant="destructive" className="shrink-0 ml-2">
                        {Math.abs(differenceInHours(new Date(task.due_date!), now))}h overdue
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
