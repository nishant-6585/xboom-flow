import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { useCompOff } from '@/hooks/useCompOff';

interface CompOffHistoryTableProps {
  employeeId?: string;
}

export function CompOffHistoryTable({ employeeId }: CompOffHistoryTableProps) {
  const { ledger, loading } = useCompOff(employeeId);

  if (loading) return <div className="h-24 bg-muted rounded-lg animate-pulse" />;
  if (ledger.length === 0) return <p className="text-center py-8 text-muted-foreground">No CompOff entries yet</p>;

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Earned Date</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Redeemed On</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ledger.map(r => (
            <TableRow key={r.id}>
              <TableCell className="text-sm">{format(parseISO(r.earned_date), 'MMM d, yyyy')}</TableCell>
              <TableCell className="text-sm">
                {r.earned_type === 'holiday' ? `${r.holiday_name ?? 'Holiday'} (Holiday)` : 'Weekend'}
              </TableCell>
              <TableCell>
                <Badge variant={r.status === 'available' ? 'default' : r.status === 'redeemed' ? 'secondary' : 'destructive'} className="capitalize">
                  {r.status}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{r.redeemed_on ? format(parseISO(r.redeemed_on), 'MMM d, yyyy') : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}