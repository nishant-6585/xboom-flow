import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, MessageSquare, Send, Check, AlertCircle } from 'lucide-react';
import { useSlackSettings } from '@/hooks/useSlackSettings';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const SlackSettingsPanel = () => {
  const { settings, loading, updateSettings, testWebhook } = useSlackSettings();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);
  const [notifyNewOrders, setNotifyNewOrders] = useState(true);
  const [notifyHotLeads, setNotifyHotLeads] = useState(true);
  const [notifyPaymentReminders, setNotifyPaymentReminders] = useState(true);
  const [notifyStatusChanges, setNotifyStatusChanges] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (settings) {
      setWebhookUrl(settings.webhook_url || '');
      setIsEnabled(settings.is_enabled);
      setNotifyNewOrders(settings.notify_new_orders);
      setNotifyHotLeads(settings.notify_hot_leads);
      setNotifyPaymentReminders(settings.notify_payment_reminders);
      setNotifyStatusChanges(settings.notify_status_changes);
    }
  }, [settings]);

  useEffect(() => {
    if (settings) {
      const changed = 
        webhookUrl !== (settings.webhook_url || '') ||
        isEnabled !== settings.is_enabled ||
        notifyNewOrders !== settings.notify_new_orders ||
        notifyHotLeads !== settings.notify_hot_leads ||
        notifyPaymentReminders !== settings.notify_payment_reminders ||
        notifyStatusChanges !== settings.notify_status_changes;
      setHasChanges(changed);
    }
  }, [webhookUrl, isEnabled, notifyNewOrders, notifyHotLeads, notifyPaymentReminders, notifyStatusChanges, settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        webhook_url: webhookUrl || null,
        is_enabled: isEnabled,
        notify_new_orders: notifyNewOrders,
        notify_hot_leads: notifyHotLeads,
        notify_payment_reminders: notifyPaymentReminders,
        notify_status_changes: notifyStatusChanges
      });
      setHasChanges(false);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!webhookUrl) return;
    setTesting(true);
    try {
      await testWebhook(webhookUrl);
    } finally {
      setTesting(false);
    }
  };

  const isValidWebhookUrl = webhookUrl.startsWith('https://hooks.slack.com/');

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <CardTitle>Slack Integration</CardTitle>
          </div>
          <CardDescription>
            Receive notifications in your Slack workspace for key business events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Master Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Enable Slack Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Turn on/off all Slack notifications
              </p>
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
            />
          </div>

          {/* Webhook URL */}
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Webhook URL</Label>
            <div className="flex gap-2">
              <Input
                id="webhook-url"
                type="url"
                placeholder="https://hooks.slack.com/services/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={!isValidWebhookUrl || testing}
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Test
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Create an incoming webhook in your Slack workspace and paste the URL here.{' '}
              <a
                href="https://api.slack.com/messaging/webhooks"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Learn how
              </a>
            </p>
          </div>

          {webhookUrl && !isValidWebhookUrl && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please enter a valid Slack webhook URL (starts with https://hooks.slack.com/)
              </AlertDescription>
            </Alert>
          )}

          {/* Notification Types */}
          <div className="space-y-4">
            <Label className="text-base">Notification Types</Label>
            
            <div className="grid gap-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="font-medium">New Orders</Label>
                  <p className="text-xs text-muted-foreground">
                    Get notified when new orders are created
                  </p>
                </div>
                <Switch
                  checked={notifyNewOrders}
                  onCheckedChange={setNotifyNewOrders}
                  disabled={!isEnabled}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="font-medium">Hot Leads & Mega Deals</Label>
                  <p className="text-xs text-muted-foreground">
                    Get alerted for high-priority leads and mega deals
                  </p>
                </div>
                <Switch
                  checked={notifyHotLeads}
                  onCheckedChange={setNotifyHotLeads}
                  disabled={!isEnabled}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="font-medium">Payment Reminders</Label>
                  <p className="text-xs text-muted-foreground">
                    Get notified about overdue and upcoming payments
                  </p>
                </div>
                <Switch
                  checked={notifyPaymentReminders}
                  onCheckedChange={setNotifyPaymentReminders}
                  disabled={!isEnabled}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="font-medium">Order Status Changes</Label>
                  <p className="text-xs text-muted-foreground">
                    Track when order statuses are updated
                  </p>
                </div>
                <Switch
                  checked={notifyStatusChanges}
                  onCheckedChange={setNotifyStatusChanges}
                  disabled={!isEnabled}
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSave}
              disabled={saving || !hasChanges}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : hasChanges ? null : (
                <Check className="h-4 w-4 mr-2" />
              )}
              {saving ? 'Saving...' : hasChanges ? 'Save Changes' : 'Saved'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
