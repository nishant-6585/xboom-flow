import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Pencil, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreditCard, CCStatement } from '@/hooks/useCreditCards';

interface Props {
  cards: CreditCard[];
  statements: CCStatement[];
  getCardMetrics: (id: string) => any;
  onEditStatement?: (statement: CCStatement) => void;
  onMarkPaid?: (statement: CCStatement) => void;
}

const riskBadge = (level: string) => {
  if (level === 'CRITICAL') return <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] px-1.5">CRITICAL</Badge>;
  if (level === 'HIGH') return <Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border-yellow-500/20 text-[10px] px-1.5">HIGH</Badge>;
  return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 border-emerald-500/20 text-[10px] px-1.5">SAFE</Badge>;
};

const statusBadge = (status: string) => {
  if (status === 'FULL') return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 border-emerald-500/20 text-[10px] px-1.5">FULL</Badge>;
  if (status === 'PARTIAL') return <Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border-yellow-500/20 text-[10px] px-1.5">PARTIAL</Badge>;
  return <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] px-1.5">UNPAID</Badge>;
};

const utilizationColor = (v: number) => {
  if (v > 80) return 'text-destructive';
  if (v > 50) return 'text-yellow-600 dark:text-yellow-500';
  return 'text-emerald-600 dark:text-emerald-500';
};

const progressColor = (v: number) => {
  if (v > 80) return '[&>div]:bg-destructive';
  if (v > 50) return '[&>div]:bg-yellow-500';
  return '[&>div]:bg-emerald-500';
};

export function CCCardReport({ cards, statements, getCardMetrics, onEditStatement, onMarkPaid }: Props) {
  const latestByCard = new Map<string, CCStatement>();
  statements.forEach(s => {
    if (!latestByCard.has(s.card_id)) latestByCard.set(s.card_id, s);
  });
  const rows = Array.from(latestByCard.values());

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Card-wise Statement Report</CardTitle></CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <div className="min-w-[1100px]">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="sticky left-0 bg-background z-10 font-semibold text-xs">Card</TableHead>
                  <TableHead className="font-semibold text-xs">Bank</TableHead>
                  <TableHead className="sticky left-[140px] bg-background z-10 font-semibold text-xs">Month</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Limit</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Available</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Outstanding</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Min Due</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Total Due</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Paid</TableHead>
                  <TableHead className="text-center font-semibold text-xs">Status</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Interest</TableHead>
                  <TableHead className="text-right font-semibold text-xs">Late Fee</TableHead>
                  <TableHead className="text-center font-semibold text-xs w-[120px]">Utilization</TableHead>
                  <TableHead className="text-center font-semibold text-xs">Risk</TableHead>
                  <TableHead className="text-center font-semibold text-xs">Due In</TableHead>
                  <TableHead className="text-center font-semibold text-xs w-[50px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(s => {
                  const card = cards.find(c => c.id === s.card_id);
                  const m = getCardMetrics(s.card_id);
                  if (!card || !m) return null;
                  const util = m.utilization;
                  return (
                    <TableRow key={s.id} className="group">
                      <TableCell className="sticky left-0 bg-background z-10 font-medium whitespace-nowrap text-xs">{card.card_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{card.bank_name}</TableCell>
                      <TableCell className="sticky left-[140px] bg-background z-10 text-xs">{s.billing_month}</TableCell>
                      <TableCell className="text-right text-xs">₹{(s.outstanding_balance + s.available_credit_limit).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right text-xs">₹{s.available_credit_limit.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right text-xs font-medium">₹{s.outstanding_balance.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right text-xs">₹{s.minimum_due.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right text-xs">₹{s.total_due.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right text-xs">₹{(s.amount_paid || 0).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-center">{statusBadge(s.payment_status)}</TableCell>
                      <TableCell className="text-right text-xs">{s.interest_charged > 0 ? `₹${s.interest_charged.toLocaleString('en-IN')}` : '—'}</TableCell>
                      <TableCell className="text-right text-xs">{s.late_fee > 0 ? `₹${s.late_fee.toLocaleString('en-IN')}` : '—'}</TableCell>
                      <TableCell className="px-2">
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(util, 100)} className={cn('h-2 flex-1', progressColor(util))} />
                          <span className={cn('text-[10px] font-semibold w-8 text-right', utilizationColor(util))}>{util}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{riskBadge(m.riskLevel)}</TableCell>
                      <TableCell className="text-center text-xs">
                        {m.daysUntilDue !== null ? (
                          <span className={cn(
                            'font-medium',
                            m.daysUntilDue < 0 ? 'text-destructive font-bold' : m.daysUntilDue <= 3 ? 'text-yellow-600' : 'text-muted-foreground'
                          )}>
                            {m.daysUntilDue < 0 ? `${Math.abs(m.daysUntilDue)}d overdue` : `${m.daysUntilDue}d`}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem><Eye className="h-3 w-3 mr-2" />View Details</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onEditStatement?.(s)}><Pencil className="h-3 w-3 mr-2" />Edit Statement</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onMarkPaid?.(s)}><CheckCircle2 className="h-3 w-3 mr-2" />Mark as Paid</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={16} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <p className="text-muted-foreground text-sm">No statements added yet</p>
                        <p className="text-muted-foreground/70 text-xs">Add your first statement to get started</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
