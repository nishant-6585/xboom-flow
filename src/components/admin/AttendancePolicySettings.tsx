import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Clock, Coffee, Bell, ShieldAlert, Save, Info } from "lucide-react";

interface AttendancePolicy {
  id: string;
  work_start_time: string;
  grace_period_minutes: number;
  break_warning_minutes: number;
  break_severe_minutes: number;
  no_checkout_warning_enabled: boolean;
  late_alert_enabled: boolean;
  employee_nudge_enabled: boolean;
  hr_severe_alert_enabled: boolean;
}

const DEFAULTS: Omit<AttendancePolicy, "id"> = {
  work_start_time: "09:30",
  grace_period_minutes: 15,
  break_warning_minutes: 60,
  break_severe_minutes: 90,
  no_checkout_warning_enabled: false,
  late_alert_enabled: false,
  employee_nudge_enabled: false,
  hr_severe_alert_enabled: false,
};

function HelperText({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground flex items-start gap-1.5 mt-1.5">
      <Info className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/60" />
      {children}
    </p>
  );
}

export function AttendancePolicySettings() {
  const { toast } = useToast();
  const [policy, setPolicy] = useState<Omit<AttendancePolicy, "id">>(DEFAULTS);
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPolicy = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("attendance_policy_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setPolicyId(data.id);
      setPolicy({
        work_start_time: (data.work_start_time as string).slice(0, 5), // "HH:MM"
        grace_period_minutes: data.grace_period_minutes,
        break_warning_minutes: data.break_warning_minutes,
        break_severe_minutes: data.break_severe_minutes,
        no_checkout_warning_enabled: data.no_checkout_warning_enabled,
        late_alert_enabled: data.late_alert_enabled,
        employee_nudge_enabled: data.employee_nudge_enabled,
        hr_severe_alert_enabled: data.hr_severe_alert_enabled,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPolicy(); }, [fetchPolicy]);

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      work_start_time: policy.work_start_time + ":00",
      grace_period_minutes: policy.grace_period_minutes,
      break_warning_minutes: policy.break_warning_minutes,
      break_severe_minutes: policy.break_severe_minutes,
      no_checkout_warning_enabled: policy.no_checkout_warning_enabled,
      late_alert_enabled: policy.late_alert_enabled,
      employee_nudge_enabled: policy.employee_nudge_enabled,
      hr_severe_alert_enabled: policy.hr_severe_alert_enabled,
    };

    let error;
    if (policyId) {
      ({ error } = await supabase
        .from("attendance_policy_settings")
        .update(payload)
        .eq("id", policyId));
    } else {
      const res = await supabase
        .from("attendance_policy_settings")
        .insert(payload)
        .select("id")
        .single();
      error = res.error;
      if (res.data) setPolicyId(res.data.id);
    }

    setSaving(false);
    if (error) {
      toast({ title: "Error", description: "Failed to save policy settings.", variant: "destructive" });
    } else {
      toast({ title: "Policy saved", description: "Attendance policy updated successfully." });
    }
  };

  const num = (v: string) => Math.max(0, parseInt(v) || 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Loading policy settings…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Section A — Work Timing */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Work Timing
          </CardTitle>
          <CardDescription>
            Define the standard working hours and grace window.  
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="work_start_time">Work Start Time</Label>
              <Input
                id="work_start_time"
                type="time"
                value={policy.work_start_time}
                onChange={e => setPolicy(p => ({ ...p, work_start_time: e.target.value }))}
              />
              <HelperText>The official shift start time for the organisation.</HelperText>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grace_period_minutes">Grace Period (minutes)</Label>
              <Input
                id="grace_period_minutes"
                type="number"
                min={0}
                max={60}
                value={policy.grace_period_minutes}
                onChange={e => setPolicy(p => ({ ...p, grace_period_minutes: num(e.target.value) }))}
              />
              <HelperText>
                Late is calculated as check-in after <strong>Work Start + Grace Period</strong>.
                E.g. 09:30 + 15 min = late after 09:45.
              </HelperText>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section B — Break Monitoring */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Coffee className="h-4 w-4 text-orange-500" />
            Break Monitoring
          </CardTitle>
          <CardDescription>
            Thresholds used for anomaly detection in the control center. No alerts are sent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="break_warning_minutes">Break Warning Threshold (minutes)</Label>
              <Input
                id="break_warning_minutes"
                type="number"
                min={0}
                value={policy.break_warning_minutes}
                onChange={e => setPolicy(p => ({ ...p, break_warning_minutes: num(e.target.value) }))}
              />
              <HelperText>
                Breaks exceeding this duration appear as a warning anomaly on the dashboard.
              </HelperText>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="break_severe_minutes">Break Severe Threshold (minutes)</Label>
              <Input
                id="break_severe_minutes"
                type="number"
                min={0}
                value={policy.break_severe_minutes}
                onChange={e => setPolicy(p => ({ ...p, break_severe_minutes: num(e.target.value) }))}
              />
              <HelperText>
                Breaks exceeding this duration appear as a critical anomaly — highlighted in red.
              </HelperText>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section C — Alert Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            Alert Controls
            <span className="ml-auto text-xs font-normal px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
              Phase A — All off by default
            </span>
          </CardTitle>
          <CardDescription>
            Alerts are optional and should be enabled only after observing attendance patterns for 2–3 weeks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 divide-y divide-border">
          <ToggleRow
            id="late_alert"
            icon={<Clock className="h-4 w-4 text-orange-500" />}
            label="Enable Late Check-in Alerts"
            description="Notify HR when an employee checks in after the grace period ends."
            checked={policy.late_alert_enabled}
            onChange={v => setPolicy(p => ({ ...p, late_alert_enabled: v }))}
          />
          <ToggleRow
            id="no_checkout"
            icon={<ShieldAlert className="h-4 w-4 text-red-500" />}
            label="Enable No Checkout Alert"
            description="Flag employees who had no checkout recorded from the previous day."
            checked={policy.no_checkout_warning_enabled}
            onChange={v => setPolicy(p => ({ ...p, no_checkout_warning_enabled: v }))}
          />
          <ToggleRow
            id="employee_nudge"
            icon={<Bell className="h-4 w-4 text-blue-500" />}
          label="Enable Employee Nudges"
            description="Send a single soft reminder to employees who have not checked in. Max one nudge per day."
            checked={policy.employee_nudge_enabled}
            onChange={v => setPolicy(p => ({ ...p, employee_nudge_enabled: v }))}
          />
          <ToggleRow
            id="hr_severe_alert"
            icon={<ShieldAlert className="h-4 w-4 text-destructive" />}
            label="Enable HR Severe Alerts"
            description="Notify HR for critical anomalies only: break > severe threshold or repeated late patterns."
            checked={policy.hr_severe_alert_enabled}
            onChange={v => setPolicy(p => ({ ...p, hr_severe_alert_enabled: v }))}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save Policy"}
        </Button>
      </div>
    </div>
  );
}

interface ToggleRowProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ id, icon, label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <Label htmlFor={id} className="text-sm font-medium cursor-pointer">{label}</Label>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
