import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface FlowItem {
  sl_no: number;
  description: string;
  time_from: string;
  time_to: string;
  duration_mins: number;
  target_value: number;
  is_break: boolean;
  frequency: string;
}

interface Suggestion {
  type: 'gap' | 'overlap' | 'optimization' | 'workload' | 'missing';
  message: string;
  action: string;
  severity: 'low' | 'medium' | 'high';
  affected_rows?: number[];
  fix_data?: any;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function analyzeFlow(items: FlowItem[]): Suggestion[] {
  const suggestions: Suggestion[] = [];
  if (!items.length) return suggestions;

  const parsed = items
    .map((item, idx) => ({
      ...item,
      idx,
      fromMins: toMinutes(item.time_from),
      toMins: toMinutes(item.time_to),
    }))
    .filter(i => i.toMins > i.fromMins)
    .sort((a, b) => a.fromMins - b.fromMins);

  // Detect gaps > 5 minutes
  for (let i = 0; i < parsed.length - 1; i++) {
    const gapStart = parsed[i].toMins;
    const gapEnd = parsed[i + 1].fromMins;
    const gapDuration = gapEnd - gapStart;
    if (gapDuration > 5) {
      suggestions.push({
        type: 'gap',
        message: `${gapDuration}-minute gap detected between "${parsed[i].description}" and "${parsed[i + 1].description}" (${formatTime(gapStart)}–${formatTime(gapEnd)})`,
        action: 'Add a task or break to fill this time slot',
        severity: gapDuration > 30 ? 'high' : gapDuration > 15 ? 'medium' : 'low',
        affected_rows: [parsed[i].sl_no, parsed[i + 1].sl_no],
        fix_data: { type: 'fill_gap', time_from: formatTime(gapStart), time_to: formatTime(gapEnd), duration_mins: gapDuration },
      });
    }
  }

  // Detect overlaps
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      if (parsed[i].fromMins < parsed[j].toMins && parsed[j].fromMins < parsed[i].toMins) {
        const overlapStart = Math.max(parsed[i].fromMins, parsed[j].fromMins);
        const overlapEnd = Math.min(parsed[i].toMins, parsed[j].toMins);
        suggestions.push({
          type: 'overlap',
          message: `Time overlap between "${parsed[i].description}" and "${parsed[j].description}" (${formatTime(overlapStart)}–${formatTime(overlapEnd)})`,
          action: 'Adjust times to remove overlap',
          severity: 'high',
          affected_rows: [parsed[i].sl_no, parsed[j].sl_no],
          fix_data: { type: 'fix_overlap', row_a: parsed[i].sl_no, row_b: parsed[j].sl_no, adjust_b_start: formatTime(parsed[i].toMins) },
        });
      }
    }
  }

  // Workload analysis
  const totalWorkMins = parsed.filter(i => !i.is_break).reduce((sum, i) => sum + i.duration_mins, 0);
  const totalBreakMins = parsed.filter(i => i.is_break).reduce((sum, i) => sum + i.duration_mins, 0);
  const workHours = totalWorkMins / 60;

  if (workHours > 9) {
    suggestions.push({
      type: 'workload',
      message: `Total work time is ${workHours.toFixed(1)} hours — this may lead to burnout`,
      action: 'Consider adding breaks or reducing task duration',
      severity: workHours > 10 ? 'high' : 'medium',
    });
  }

  if (workHours < 6 && parsed.length > 0) {
    suggestions.push({
      type: 'workload',
      message: `Total work time is only ${workHours.toFixed(1)} hours — schedule appears underutilized`,
      action: 'Consider adding more tasks to fill the workday',
      severity: workHours < 4 ? 'high' : 'medium',
    });
  }

  if (totalBreakMins === 0 && totalWorkMins > 240) {
    suggestions.push({
      type: 'missing',
      message: 'No breaks scheduled in a 4+ hour workday',
      action: 'Add at least one break for employee wellbeing',
      severity: 'medium',
    });
  }

  // Check for zero targets on non-break tasks
  const zeroTargetTasks = parsed.filter(i => !i.is_break && i.target_value === 0);
  if (zeroTargetTasks.length > 0 && zeroTargetTasks.length < parsed.length) {
    suggestions.push({
      type: 'optimization',
      message: `${zeroTargetTasks.length} task(s) have no target set: ${zeroTargetTasks.map(t => `"${t.description}"`).join(', ')}`,
      action: 'Set measurable targets for better tracking',
      severity: 'low',
      affected_rows: zeroTargetTasks.map(t => t.sl_no),
    });
  }

  // Check for very long single tasks
  const longTasks = parsed.filter(i => !i.is_break && i.duration_mins > 120);
  for (const task of longTasks) {
    suggestions.push({
      type: 'optimization',
      message: `"${task.description}" is ${task.duration_mins} minutes long — consider splitting into smaller focused blocks`,
      action: 'Break into 60-90 minute focused sessions',
      severity: 'low',
      affected_rows: [task.sl_no],
    });
  }

  // Check for very short tasks (< 10 min)
  const shortTasks = parsed.filter(i => i.duration_mins < 10 && i.duration_mins > 0);
  if (shortTasks.length >= 3) {
    suggestions.push({
      type: 'optimization',
      message: `${shortTasks.length} tasks are under 10 minutes — frequent switching reduces productivity`,
      action: 'Consider combining short related tasks',
      severity: 'low',
      affected_rows: shortTasks.map(t => t.sl_no),
    });
  }

  return suggestions;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { items, employee_name } = body;

    if (!items || !Array.isArray(items)) {
      return new Response(JSON.stringify({ error: 'Invalid items array' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const suggestions = analyzeFlow(items);

    // Summary stats
    const parsed = items.filter((i: any) => i.time_from && i.time_to);
    const totalWorkMins = parsed.filter((i: any) => !i.is_break).reduce((s: number, i: any) => s + (i.duration_mins || 0), 0);
    const totalBreakMins = parsed.filter((i: any) => i.is_break).reduce((s: number, i: any) => s + (i.duration_mins || 0), 0);
    const gaps = suggestions.filter(s => s.type === 'gap').length;
    const overlaps = suggestions.filter(s => s.type === 'overlap').length;

    return new Response(JSON.stringify({
      suggestions,
      summary: {
        employee_name: employee_name || 'Unknown',
        total_tasks: items.length,
        total_work_minutes: totalWorkMins,
        total_break_minutes: totalBreakMins,
        gaps_detected: gaps,
        overlaps_detected: overlaps,
        optimization_count: suggestions.filter(s => s.type === 'optimization').length,
        overall_health: overlaps > 0 ? 'critical' : gaps > 2 ? 'needs_attention' : suggestions.length === 0 ? 'excellent' : 'good',
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
