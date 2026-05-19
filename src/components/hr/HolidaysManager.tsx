import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CalendarDays, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useHolidays, useUpdateHoliday, HOLIDAY_TYPES, type Holiday, type HolidayType } from "@/hooks/useHolidays";
import { useAuth } from "@/hooks/useAuth";

const schema = z.object({
  name: z.string().min(1, "Required").max(120),
  holiday_date: z.string().min(1, "Required").refine((d) => {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return false;
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    return dt >= fiveYearsAgo;
  }, "Date must be within the last 5 years or in the future"),
  holiday_type: z.enum(["national", "regional", "company", "religious", "restricted"]),
  description: z.string().optional(),
  is_restricted: z.boolean(),
  is_active: z.boolean(),
});
type FormVals = z.infer<typeof schema>;

const TYPE_STYLES: Record<HolidayType, string> = {
  national: "bg-primary/10 text-primary border-primary/20",
  regional: "bg-accent/10 text-accent-foreground border-accent/20",
  company: "bg-secondary text-secondary-foreground border-border",
  religious: "bg-muted text-muted-foreground border-border",
  restricted: "bg-destructive/10 text-destructive border-destructive/20",
};

export function HolidaysManager() {
  const { role } = useAuth();
  const canManage = role === "hr" || role === "admin";
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const { holidays, isLoading, addHoliday, deleteHoliday } = useHolidays({ year });
  const updateHoliday = useUpdateHoliday();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);

  const form = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", holiday_date: "", holiday_type: "company", description: "", is_restricted: false, is_active: true },
  });

  const openAdd = () => {
    setEditing(null);
    form.reset({ name: "", holiday_date: "", holiday_type: "company", description: "", is_restricted: false, is_active: true });
    setDialogOpen(true);
  };
  const openEdit = (h: Holiday) => {
    setEditing(h);
    form.reset({
      name: h.name,
      holiday_date: h.holiday_date,
      holiday_type: h.holiday_type,
      description: h.description ?? "",
      is_restricted: h.is_restricted,
      is_active: h.is_active,
    });
    setDialogOpen(true);
  };

  const onSubmit = form.handleSubmit(async (vals) => {
    if (editing) {
      await updateHoliday.mutateAsync({ id: editing.id, ...vals, description: vals.description || null });
    } else {
      await addHoliday.mutateAsync(vals);
    }
    setDialogOpen(false);
  });

  const grouped = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const h of holidays) {
      const key = format(parseISO(h.holiday_date), "MMMM yyyy");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(h);
    }
    return Array.from(map.entries());
  }, [holidays]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Holiday Calendar</CardTitle>
          <CardDescription>Company holidays visible to all employees on the dashboard.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canManage && (
            <Button onClick={openAdd} size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add Holiday</Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : holidays.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No holidays set for {year}</p>
        ) : (
          <div className="space-y-6">
            {grouped.map(([month, items]) => (
              <div key={month}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 border-b pb-1">{month}</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-24">Date</TableHead>
                      <TableHead className="text-xs w-20">Day</TableHead>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs w-28">Type</TableHead>
                      <TableHead className="text-xs w-24">Status</TableHead>
                      {canManage && <TableHead className="text-xs text-right w-24">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((h) => {
                      const d = parseISO(h.holiday_date);
                      return (
                        <TableRow key={h.id}>
                          <TableCell className="text-xs font-medium">{format(d, "dd MMM")}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{format(d, "EEEE")}</TableCell>
                          <TableCell className="text-xs">
                            <div className="font-medium">{h.name}</div>
                            {h.description && <div className="text-muted-foreground text-[11px] mt-0.5">{h.description}</div>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${TYPE_STYLES[h.holiday_type]}`}>{h.holiday_type}</Badge>
                            {h.is_restricted && <Badge variant="outline" className="ml-1 text-[10px]">Restricted</Badge>}
                          </TableCell>
                          <TableCell>
                            {h.is_active ? <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">Active</Badge>
                              : <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                          </TableCell>
                          {canManage && (
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(h)}><Pencil className="h-3 w-3" /></Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="h-3 w-3" /></Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove Holiday</AlertDialogTitle>
                                    <AlertDialogDescription>Remove "{h.name}" on {format(d, "dd MMM yyyy")}?</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteHoliday.mutate(h.id)} className="bg-destructive text-destructive-foreground">Remove</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Holiday" : "Add Holiday"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input {...form.register("name")} placeholder="e.g. Republic Day" />
              {form.formState.errors.name && <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Date *</Label>
                <Input type="date" {...form.register("holiday_date")} />
                {form.formState.errors.holiday_date && <p className="text-xs text-destructive mt-1">{form.formState.errors.holiday_date.message}</p>}
              </div>
              <div>
                <Label className="text-xs">Type *</Label>
                <Select value={form.watch("holiday_type")} onValueChange={(v) => form.setValue("holiday_type", v as HolidayType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HOLIDAY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea {...form.register("description")} placeholder="Optional note" rows={2} />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.watch("is_restricted")} onCheckedChange={(v) => form.setValue("is_restricted", v)} />
                <Label className="text-xs">Restricted</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.watch("is_active")} onCheckedChange={(v) => form.setValue("is_active", v)} />
                <Label className="text-xs">Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                {editing ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
