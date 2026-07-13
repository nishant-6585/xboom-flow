import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminTabsNav from '@/components/admin/AdminTabsNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { ShieldCheck, Loader2 } from 'lucide-react';

interface AuditRow {
  id: string;
  ledger_id: string;
  employee_id: string;
  action: 'submitted' | 'approved' | 'rejected';
  actor_name: string | null;
  reason: string | null;
  comment: string | null;
  earned_date: string | null;
  earned_type: string | null;
  created_at: string;
  employee_name?: string;
}

export default function CompOffAudit() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('compoff_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) { setLoading(false); return; }
      const ids = Array.from(new Set((data || []).map((r: any) => r.employee_id)));
      const nameById: Record<string, string> = {};
      if (ids.length) {
        const { data: emps } = await supabase
          .from('employees')
          .select('id, name')
          .in('id', ids);
        (emps || []).forEach((e: any) => { nameById[e.id] = e.name; });
      }
      setRows((data || []).map((r: any) => ({ ...r, employee_name: nameById[r.employee_id] })));
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <AdminTabsNav active="compoff-audit" />
      <div className="container mx-auto px-4 py-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Comp-off Approval Audit Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No comp-off audit entries yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/80">
                    <TableHead className="font-bold text-foreground">When</TableHead>
                    <TableHead className="font-bold text-foreground">Employee</TableHead>
                    <TableHead className="font-bold text-foreground">Action</TableHead>
                    <TableHead className="font-bold text-foreground">Actor</TableHead>
                    <TableHead className="font-bold text-foreground">Earned</TableHead>
                    <TableHead className="font-bold text-foreground">Reason / Comment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(parseISO(r.created_at), 'MMM d, yyyy • h:mm a')}
                      </TableCell>
                      <TableCell className="text-sm">{r.employee_name || r.employee_id.slice(0, 8)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.action === 'approved' ? 'default'
                              : r.action === 'rejected' ? 'destructive'
                              : 'secondary'
                          }
                          className="capitalize"
                        >
                          {r.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{r.actor_name || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {r.earned_date ? format(parseISO(r.earned_date), 'MMM d, yyyy') : '—'}
                        {r.earned_type ? ` (${r.earned_type})` : ''}
                      </TableCell>
                      <TableCell className="text-xs max-w-md">
                        {r.reason && <div className="text-red-700">Reason: {r.reason}</div>}
                        {r.comment && <div className="text-muted-foreground">{r.comment}</div>}
                        {!r.reason && !r.comment && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}