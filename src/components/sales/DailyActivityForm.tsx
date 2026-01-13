import { useState, useEffect } from "react";
import { Calendar, Save, TrendingUp, Users, Award, DollarSign, Target, Rocket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSalesDailyActivities } from "@/hooks/useSalesGamification";
import { format } from "date-fns";

export function DailyActivityForm() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const { activities, upsertActivity } = useSalesDailyActivities();
  
  const [formData, setFormData] = useState({
    leads_handled: 0,
    channel: '',
    pipeline_created: 0,
    orders_won: 0,
    payment_expected_today: 0,
    sweet_pipeline: 0,
    monthly_pipeline: 0,
    bonus_earned: 0,
    notes: '',
  });

  // Load existing data for selected date
  useEffect(() => {
    const existing = activities?.find(a => a.activity_date === selectedDate);
    if (existing) {
      setFormData({
        leads_handled: existing.leads_handled,
        channel: existing.channel || '',
        pipeline_created: existing.pipeline_created,
        orders_won: existing.orders_won,
        payment_expected_today: existing.payment_expected_today,
        sweet_pipeline: existing.sweet_pipeline,
        monthly_pipeline: existing.monthly_pipeline,
        bonus_earned: existing.bonus_earned,
        notes: existing.notes || '',
      });
    } else {
      setFormData({
        leads_handled: 0,
        channel: '',
        pipeline_created: 0,
        orders_won: 0,
        payment_expected_today: 0,
        sweet_pipeline: 0,
        monthly_pipeline: 0,
        bonus_earned: 0,
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

  const channels = ['Direct', 'Website', 'Referral', 'Social Media', 'Cold Call', 'Email', 'Trade Show', 'Partner'];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-green-500/10 via-emerald-500/5 to-transparent border-b">
        <CardTitle className="flex items-center gap-2">
          <Rocket className="w-5 h-5 text-green-500" />
          Daily Activity Tracker
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              Leads Handled
            </Label>
            <Input
              type="number"
              min={0}
              value={formData.leads_handled}
              onChange={(e) => setFormData({ ...formData, leads_handled: parseInt(e.target.value) || 0 })}
              className="bg-blue-500/5 border-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Target className="w-4 h-4 text-purple-500" />
              Channel
            </Label>
            <Select value={formData.channel} onValueChange={(v) => setFormData({ ...formData, channel: v })}>
              <SelectTrigger className="bg-purple-500/5 border-purple-500/20">
                <SelectValue placeholder="Select channel" />
              </SelectTrigger>
              <SelectContent>
                {channels.map((ch) => (
                  <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              Pipeline Created
            </Label>
            <Input
              type="number"
              min={0}
              value={formData.pipeline_created}
              onChange={(e) => setFormData({ ...formData, pipeline_created: parseInt(e.target.value) || 0 })}
              className="bg-green-500/5 border-green-500/20 focus:border-green-500"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Award className="w-4 h-4 text-yellow-500" />
              Orders Won
            </Label>
            <Input
              type="number"
              min={0}
              value={formData.orders_won}
              onChange={(e) => setFormData({ ...formData, orders_won: parseInt(e.target.value) || 0 })}
              className="bg-yellow-500/5 border-yellow-500/20 focus:border-yellow-500"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              Payment Expected Today
            </Label>
            <Input
              type="number"
              min={0}
              value={formData.payment_expected_today}
              onChange={(e) => setFormData({ ...formData, payment_expected_today: parseFloat(e.target.value) || 0 })}
              className="bg-emerald-500/5 border-emerald-500/20"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Rocket className="w-4 h-4 text-pink-500" />
              Sweet Pipeline
            </Label>
            <Input
              type="number"
              min={0}
              value={formData.sweet_pipeline}
              onChange={(e) => setFormData({ ...formData, sweet_pipeline: parseFloat(e.target.value) || 0 })}
              className="bg-pink-500/5 border-pink-500/20"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-500" />
              Monthly Pipeline
            </Label>
            <Input
              type="number"
              min={0}
              value={formData.monthly_pipeline}
              onChange={(e) => setFormData({ ...formData, monthly_pipeline: parseFloat(e.target.value) || 0 })}
              className="bg-indigo-500/5 border-indigo-500/20"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              Bonus Earned
            </Label>
            <Input
              type="number"
              min={0}
              value={formData.bonus_earned}
              onChange={(e) => setFormData({ ...formData, bonus_earned: parseFloat(e.target.value) || 0 })}
              className="bg-amber-500/5 border-amber-500/20"
            />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label>Notes</Label>
          <Textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Any additional notes for today..."
            rows={3}
          />
        </div>

        <Button 
          onClick={handleSubmit} 
          className="w-full mt-6 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
          disabled={upsertActivity.isPending}
        >
          <Save className="w-4 h-4 mr-2" />
          {upsertActivity.isPending ? 'Saving...' : 'Save Daily Activity'}
        </Button>
      </CardContent>
    </Card>
  );
}
