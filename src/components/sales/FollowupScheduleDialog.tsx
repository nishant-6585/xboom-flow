import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Clock, Bell, User, Package } from 'lucide-react';
import { useFollowups } from '@/hooks/useFollowups';
import { format, addHours } from 'date-fns';

interface FollowupScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceType: 'prospect' | 'pipeline' | 'enquiry' | 'lead';
  sourceId: string;
  customerName: string;
  customerCompany?: string | null;
  productName?: string | null;
  phone?: string | null;
  email?: string | null;
  isACategory?: boolean;
  onScheduled?: () => void;
}

export function FollowupScheduleDialog({
  open,
  onOpenChange,
  sourceType,
  sourceId,
  customerName,
  customerCompany,
  productName,
  phone,
  email,
  isACategory,
  onScheduled,
}: FollowupScheduleDialogProps) {
  const { createFollowup } = useFollowups();
  const [loading, setLoading] = useState(false);
  
  // Default to tomorrow at 10:00 AM
  const defaultDate = format(addHours(new Date(), 24), "yyyy-MM-dd");
  const defaultTime = '10:00';
  
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(defaultTime);

  const handleSubmit = async () => {
    if (!date || !time) return;
    setLoading(true);
    try {
      const followupAt = new Date(`${date}T${time}:00`).toISOString();
      const result = await createFollowup({
        source_type: sourceType,
        source_id: sourceId,
        customer_name: customerName,
        customer_company: customerCompany || null,
        product_name: productName || null,
        phone: phone || null,
        email: email || null,
        is_a_category: isACategory || false,
        followup_at: followupAt,
      });
      if (result) {
        onOpenChange(false);
        onScheduled?.();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    onOpenChange(false);
    onScheduled?.();
  };

  const quickOptions = [
    { label: 'In 1 hour', hours: 1 },
    { label: 'In 4 hours', hours: 4 },
    { label: 'Tomorrow 10 AM', hours: null, preset: 'tomorrow' },
    { label: 'In 2 days', hours: 48 },
    { label: 'Next week', hours: 168 },
  ];

  const applyQuick = (opt: typeof quickOptions[0]) => {
    const now = new Date();
    let target: Date;
    if (opt.preset === 'tomorrow') {
      target = new Date(now);
      target.setDate(target.getDate() + 1);
      target.setHours(10, 0, 0, 0);
    } else if (opt.hours) {
      target = addHours(now, opt.hours);
    } else {
      return;
    }
    setDate(format(target, 'yyyy-MM-dd'));
    setTime(format(target, 'HH:mm'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Bell className="w-5 h-5 text-primary" />
            Schedule Follow-up
          </DialogTitle>
          <DialogDescription>
            Set a reminder to follow up with this contact. You'll get notified before the scheduled time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Contact Info Summary */}
          <div className="bg-muted/50 rounded-xl p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              {customerName}
              {customerCompany && <span className="text-muted-foreground">· {customerCompany}</span>}
              {isACategory && <span className="bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] font-bold px-1.5 rounded-full">A</span>}
            </div>
            {productName && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Package className="w-3 h-3" />
                {productName}
              </div>
            )}
            <div className="text-[10px] text-muted-foreground/70 capitalize">
              Source: {sourceType}
            </div>
          </div>

          {/* Quick Options */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Quick Schedule</Label>
            <div className="flex flex-wrap gap-1.5">
              {quickOptions.map(opt => (
                <Button
                  key={opt.label}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 rounded-lg"
                  onClick={() => applyQuick(opt)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Date/Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                <Calendar className="w-3 h-3 inline mr-1" />Date
              </Label>
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
                className="h-9 rounded-lg"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                <Clock className="w-3 h-3 inline mr-1" />Time
              </Label>
              <Input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="h-9 rounded-lg"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
            Skip
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !date || !time} size="sm" className="min-w-[120px]">
            {loading ? 'Scheduling...' : '📅 Schedule Follow-up'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
