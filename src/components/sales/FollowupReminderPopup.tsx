import { useEffect, useRef, useState, useCallback } from 'react';
import { useFollowups, Followup } from '@/hooks/useFollowups';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Bell, Phone, Mail, Clock, User } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { CallButton } from '@/components/calls/CallButton';

// Notification sound - using a simple beep via Web Audio
function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    
    // Play 3 ascending beeps
    [0, 200, 400].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 520 + (i * 80);
      gain.gain.value = 0.3;
      const t = ctx.currentTime + delay / 1000;
      osc.start(t);
      osc.stop(t + 0.15);
    });
    
    // Cleanup after sounds finish
    setTimeout(() => ctx.close(), 2000);
  } catch (e) {
    console.error('Sound play failed:', e);
  }
}

export function FollowupReminderPopup() {
  const { user, role } = useAuth();
  const { followups } = useFollowups();
  const [activeReminder, setActiveReminder] = useState<Followup | null>(null);
  const dismissedIds = useRef<Set<string>>(new Set());
  const snoozedUntil = useRef<Map<string, number>>(new Map());
  const checkIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const soundPlayedIds = useRef<Set<string>>(new Set());

  const checkReminders = useCallback(() => {
    if (!followups.length || activeReminder) return;
    // Reminders are only for sales people
    if (role !== 'sales' && role !== 'sales_manager') return;
    const now = new Date();
    const nowMs = now.getTime();
    
    for (const f of followups) {
      if (f.status !== 'pending') continue;
      if (dismissedIds.current.has(f.id)) continue;
      
      // Check if snoozed
      const snoozeEnd = snoozedUntil.current.get(f.id);
      if (snoozeEnd && nowMs < snoozeEnd) continue;
      
      const followupTime = new Date(f.followup_at);
      const minsUntil = differenceInMinutes(followupTime, now);
      
      // Show reminder 10 minutes before or if it's due now (within last 5 mins)
      if (minsUntil <= 10 && minsUntil >= -5) {
        setActiveReminder(f);
        // Only play sound once per followup
        if (!soundPlayedIds.current.has(f.id)) {
          playNotificationSound();
          soundPlayedIds.current.add(f.id);
        }
        break;
      }
    }
  }, [followups, activeReminder, role]);

  useEffect(() => {
    if (!user) return;
    if (role !== 'sales' && role !== 'sales_manager') return;
    checkReminders();
    checkIntervalRef.current = setInterval(checkReminders, 60000);
    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [user, checkReminders]);

  const handleDismiss = () => {
    if (activeReminder) {
      dismissedIds.current.add(activeReminder.id);
    }
    setActiveReminder(null);
  };

  const handleSnooze = () => {
    if (activeReminder) {
      // Snooze for 10 minutes
      snoozedUntil.current.set(activeReminder.id, Date.now() + 10 * 60 * 1000);
    }
    setActiveReminder(null);
  };

  if (!activeReminder) return null;

  const minsUntil = differenceInMinutes(new Date(activeReminder.followup_at), new Date());

  return (
    <Dialog open={!!activeReminder} onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center animate-pulse">
              <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            Follow-up Reminder!
          </DialogTitle>
          <DialogDescription>
            {minsUntil > 0
              ? `⏰ In ${minsUntil} minutes`
              : minsUntil === 0
                ? '🔔 Right now!'
                : `⚠️ ${Math.abs(minsUntil)} minutes ago`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="bg-muted/50 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold text-sm">{activeReminder.customer_name}</span>
              {activeReminder.is_a_category && (
                <span className="bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] font-bold px-1.5 rounded-full">A-Priority</span>
              )}
            </div>
            {activeReminder.customer_company && (
              <div className="text-xs text-muted-foreground">{activeReminder.customer_company}</div>
            )}
            {activeReminder.product_name && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                📦 {activeReminder.product_name}
              </div>
            )}
            <div className="flex items-center gap-3 text-xs">
              {activeReminder.phone && (
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Phone className="w-3 h-3" />{activeReminder.phone}
                  </span>
                  <CallButton
                    phoneNumber={activeReminder.phone}
                    entityType={activeReminder.source_type as any}
                    entityId={activeReminder.source_id}
                    iconOnly
                    variant="ghost"
                    className="h-6 w-6"
                  />
                </div>
              )}
              {activeReminder.email && (
                <a href={`mailto:${activeReminder.email}`} className="flex items-center gap-1 text-primary hover:underline">
                  <Mail className="w-3 h-3" />{activeReminder.email}
                </a>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {format(new Date(activeReminder.followup_at), 'dd MMM yyyy, hh:mm a')}
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={handleSnooze}>
            Snooze
          </Button>
          <Button size="sm" onClick={handleDismiss}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
