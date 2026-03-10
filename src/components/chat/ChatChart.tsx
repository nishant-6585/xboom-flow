import { useMemo } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface ChartSpec {
  type: 'bar' | 'pie' | 'line';
  title?: string;
  data: Record<string, unknown>[];
  xKey?: string;
  yKey?: string;
  yKeys?: string[];
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2, 150 60% 50%))',
  'hsl(var(--chart-3, 40 90% 55%))',
  'hsl(var(--chart-4, 280 60% 55%))',
  'hsl(var(--chart-5, 200 70% 50%))',
  '#f97316', '#06b6d4', '#8b5cf6', '#ec4899',
];

export function parseChartBlocks(content: string): Array<{ type: 'text'; value: string } | { type: 'chart'; spec: ChartSpec }> {
  const parts: Array<{ type: 'text'; value: string } | { type: 'chart'; spec: ChartSpec }> = [];
  const regex = /```chart\s*\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    try {
      const spec = JSON.parse(match[1]) as ChartSpec;
      if (spec.type && spec.data?.length) {
        parts.push({ type: 'chart', spec });
      } else {
        parts.push({ type: 'text', value: match[0] });
      }
    } catch {
      parts.push({ type: 'text', value: match[0] });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return parts;
}

function formatValue(val: unknown): string {
  if (typeof val === 'number') {
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
    return val.toLocaleString('en-IN');
  }
  return String(val);
}

export function ChatChart({ spec }: { spec: ChartSpec }) {
  const { type, title, data, xKey, yKey, yKeys } = spec;

  const resolvedXKey = useMemo(() => xKey || Object.keys(data[0] || {}).find(k => typeof data[0][k] === 'string') || 'name', [xKey, data]);
  const resolvedYKeys = useMemo(() => {
    if (yKeys?.length) return yKeys;
    if (yKey) return [yKey];
    return Object.keys(data[0] || {}).filter(k => typeof data[0][k] === 'number');
  }, [yKey, yKeys, data]);

  const truncateLabel = (label: string) => label.length > 12 ? label.slice(0, 12) + '…' : label;

  return (
    <div className="my-2 p-2 rounded-lg bg-background/60 border border-border/40">
      {title && <p className="text-[11px] font-semibold text-foreground mb-1.5 px-1">{title}</p>}
      <ResponsiveContainer width="100%" height={180}>
        {type === 'bar' ? (
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey={resolvedXKey} tick={{ fontSize: 9 }} tickFormatter={truncateLabel} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => formatValue(v)} width={45} />
            <Tooltip
              contentStyle={{ fontSize: 11, background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
              formatter={(v: number) => [formatValue(v)]}
            />
            {resolvedYKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {resolvedYKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        ) : type === 'line' ? (
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey={resolvedXKey} tick={{ fontSize: 9 }} tickFormatter={truncateLabel} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => formatValue(v)} width={45} />
            <Tooltip
              contentStyle={{ fontSize: 11, background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
              formatter={(v: number) => [formatValue(v)]}
            />
            {resolvedYKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {resolvedYKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
            ))}
          </LineChart>
        ) : (
          <PieChart>
            <Pie
              data={data}
              dataKey={resolvedYKeys[0]}
              nameKey={resolvedXKey}
              cx="50%"
              cy="50%"
              outerRadius={65}
              label={({ name, percent }) => `${truncateLabel(String(name))} ${(percent * 100).toFixed(0)}%`}
              labelLine={{ strokeWidth: 0.5 }}
              fontSize={9}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 11, background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
              formatter={(v: number) => [formatValue(v)]}
            />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
