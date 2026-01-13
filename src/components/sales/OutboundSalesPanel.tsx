import { useState, useEffect } from "react";
import { Phone, Mail, Calendar, Users, RefreshCcw, UserPlus, Save, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOutboundActivities } from "@/hooks/useSalesGamification";
import { format } from "date-fns";

export function OutboundSalesPanel() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const { activities, upsertActivity } = useOutboundActivities();

  const [formData, setFormData] = useState({
    calls_made: 0,
    emails_sent: 0,
    meetings_scheduled: 0,
    demos_given: 0,
    follow_ups: 0,
    new_contacts: 0,
    notes: '',
  });

  // Load existing data
  useEffect(() => {
    const existing = activities?.find(a => a.activity_date === selectedDate);
    if (existing) {
      setFormData({
        calls_made: existing.calls_made,
        emails_sent: existing.emails_sent,
        meetings_scheduled: existing.meetings_scheduled,
        demos_given: existing.demos_given,
        follow_ups: existing.follow_ups,
        new_contacts: existing.new_contacts,
        notes: existing.notes || '',
      });
    } else {
      setFormData({
        calls_made: 0,
        emails_sent: 0,
        meetings_scheduled: 0,
        demos_given: 0,
        follow_ups: 0,
        new_contacts: 0,
        notes: '',
      });
    }
  }, [selectedDate, activities]);

  const handleSubmit = () => {
    upsertActivity.mutate({
      activity_date: selectedDate,
      ...formData,
    });
  };

  const metrics = [
    { key: 'calls_made', label: 'Calls Made', icon: Phone, color: 'from-blue-500 to-blue-600' },
    { key: 'emails_sent', label: 'Emails Sent', icon: Mail, color: 'from-green-500 to-emerald-600' },
    { key: 'meetings_scheduled', label: 'Meetings Scheduled', icon: Calendar, color: 'from-purple-500 to-purple-600' },
    { key: 'demos_given', label: 'Demos Given', icon: Users, color: 'from-pink-500 to-rose-600' },
    { key: 'follow_ups', label: 'Follow Ups', icon: RefreshCcw, color: 'from-amber-500 to-orange-600' },
    { key: 'new_contacts', label: 'New Contacts', icon: UserPlus, color: 'from-cyan-500 to-teal-600' },
  ];

  // Calculate totals from all activities
  const totals = activities?.reduce((acc, a) => ({
    calls_made: acc.calls_made + a.calls_made,
    emails_sent: acc.emails_sent + a.emails_sent,
    meetings_scheduled: acc.meetings_scheduled + a.meetings_scheduled,
    demos_given: acc.demos_given + a.demos_given,
    follow_ups: acc.follow_ups + a.follow_ups,
    new_contacts: acc.new_contacts + a.new_contacts,
  }), {
    calls_made: 0,
    emails_sent: 0,
    meetings_scheduled: 0,
    demos_given: 0,
    follow_ups: 0,
    new_contacts: 0,
  }) || {
    calls_made: 0,
    emails_sent: 0,
    meetings_scheduled: 0,
    demos_given: 0,
    follow_ups: 0,
    new_contacts: 0,
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.key} className="overflow-hidden">
              <CardContent className={`p-4 bg-gradient-to-br ${metric.color} text-white`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold">{totals[metric.key as keyof typeof totals]}</p>
                <p className="text-xs opacity-80">{metric.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Daily Entry Form */}
      <Card className="overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-indigo-500/10 via-violet-500/5 to-transparent border-b">
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-500" />
            Outbound Activity Entry
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-48"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.key} className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {metric.label}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData[metric.key as keyof typeof formData]}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      [metric.key]: parseInt(e.target.value) || 0 
                    })}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-4 space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notes about today's outbound activities..."
              rows={3}
            />
          </div>

          <Button 
            onClick={handleSubmit} 
            className="w-full mt-6 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600"
            disabled={upsertActivity.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            {upsertActivity.isPending ? 'Saving...' : 'Save Outbound Activity'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
