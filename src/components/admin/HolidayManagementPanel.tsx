import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useHolidays } from '@/hooks/useHolidays';
import { format, parseISO } from 'date-fns';
import { Plus, Trash2, Loader2, CalendarDays } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export function HolidayManagementPanel() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const { holidays, isLoading, addHoliday, deleteHoliday } = useHolidays(year);

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !date) return;
    addHoliday.mutate({ name: name.trim(), date, description: description.trim() || undefined }, {
      onSuccess: () => { setName(''); setDate(''); setDescription(''); }
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Holiday Management
          </CardTitle>
          <CardDescription>
            Add holidays that will appear in attendance views for all employees.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add holiday form */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs">Holiday Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Republic Day" />
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional note" />
            </div>
            <Button onClick={handleAdd} disabled={addHoliday.isPending || !name.trim() || !date} className="gap-1">
              {addHoliday.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>

          {/* Year selector */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setYear(y => y - 1)}>← {year - 1}</Button>
            <span className="font-semibold text-sm">{year}</span>
            <Button variant="outline" size="sm" onClick={() => setYear(y => y + 1)}>{year + 1} →</Button>
          </div>

          {/* Holiday list */}
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No holidays added for {year}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Description</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holidays.map(h => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs font-medium">{format(parseISO(h.holiday_date), 'dd MMM, EEE')}</TableCell>
                    <TableCell className="text-xs">{h.name}</TableCell>
                    <TableCell className="text-xs hidden sm:table-cell text-muted-foreground">{h.description || '—'}</TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-destructive hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Holiday</AlertDialogTitle>
                            <AlertDialogDescription>Remove "{h.name}" on {format(parseISO(h.holiday_date), 'dd MMM yyyy')}?</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteHoliday.mutate(h.id)} className="bg-destructive text-destructive-foreground">Remove</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
