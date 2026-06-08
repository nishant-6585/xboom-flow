import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, MessageSquare, Send, Check, Info, Hash, Lock, BarChart3 } from 'lucide-react';
import { useSlackSettings } from '@/hooks/useSlackSettings';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

export const SlackSettingsPanel = () => {
  const { settings, loading, updateSettings, testWebhook, testChannel, triggerSalesReport } = useSlackSettings();
  
  const [isEnabled, setIsEnabled] = useState(false);
  const [notifyNewOrders, setNotifyNewOrders] = useState(true);
  const [notifyHotLeads, setNotifyHotLeads] = useState(true);
  const [notifyPaymentReminders, setNotifyPaymentReminders] = useState(true);
  const [notifyStatusChanges, setNotifyStatusChanges] = useState(true);
  
  // Multi-channel mode
  const [channelOrders, setChannelOrders] = useState('');
  const [channelOrderStatus, setChannelOrderStatus] = useState('');
  const [channelEnquiries, setChannelEnquiries] = useState('');
  const [channelProcurements, setChannelProcurements] = useState('');
  const [channelSuppliers, setChannelSuppliers] = useState('');
  const [channelPipeline, setChannelPipeline] = useState('');
  const [channelTickets, setChannelTickets] = useState('');
  const [notifyNewEnquiries, setNotifyNewEnquiries] = useState(true);
  const [notifyNewProcurements, setNotifyNewProcurements] = useState(true);
  const [notifyNewSuppliers, setNotifyNewSuppliers] = useState(true);
  const [notifyNewPipeline, setNotifyNewPipeline] = useState(true);
  const [notifyTicketAssigned, setNotifyTicketAssigned] = useState(true);
  const [notifyTicketStatusChange, setNotifyTicketStatusChange] = useState(true);
  
  // Sales report settings
  const [channelSalesReport, setChannelSalesReport] = useState('');
  const [enableDailyReport, setEnableDailyReport] = useState(false);
  const [enableWeeklyReport, setEnableWeeklyReport] = useState(false);
  const [enableAIInsights, setEnableAIInsights] = useState(true);
  const [enableInteractiveActions, setEnableInteractiveActions] = useState(true);
  
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [triggeringReport, setTriggeringReport] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (settings) {
      setIsEnabled(settings.is_enabled);
      setNotifyNewOrders(settings.notify_new_orders);
      setNotifyHotLeads(settings.notify_hot_leads);
      setNotifyPaymentReminders(settings.notify_payment_reminders);
      setNotifyStatusChanges(settings.notify_status_changes);
      setChannelOrders(settings.channel_orders || '');
      setChannelOrderStatus(settings.channel_order_status || '');
      setChannelEnquiries(settings.channel_enquiries || '');
      setChannelProcurements(settings.channel_procurements || '');
      setChannelSuppliers(settings.channel_suppliers || '');
      setChannelPipeline(settings.channel_pipeline || '');
      setChannelTickets(settings.channel_tickets || '');
      setNotifyNewEnquiries(settings.notify_new_enquiries ?? true);
      setNotifyNewProcurements(settings.notify_new_procurements ?? true);
      setNotifyNewSuppliers(settings.notify_new_suppliers ?? true);
      setNotifyNewPipeline(settings.notify_new_pipeline ?? true);
      setNotifyTicketAssigned(settings.notify_ticket_assigned ?? true);
      setNotifyTicketStatusChange(settings.notify_ticket_status_change ?? true);
      setChannelSalesReport((settings as any).channel_sales_report || '');
      setEnableDailyReport((settings as any).enable_daily_report ?? false);
      setEnableWeeklyReport((settings as any).enable_weekly_report ?? false);
      setEnableAIInsights((settings as any).enable_ai_insights ?? true);
      setEnableInteractiveActions((settings as any).enable_interactive_actions ?? true);
    }
  }, [settings]);

  useEffect(() => {
    if (settings) {
      const changed = 
        isEnabled !== settings.is_enabled ||
        notifyNewOrders !== settings.notify_new_orders ||
        notifyHotLeads !== settings.notify_hot_leads ||
        notifyPaymentReminders !== settings.notify_payment_reminders ||
        notifyStatusChanges !== settings.notify_status_changes ||
        channelOrders !== (settings.channel_orders || '') ||
        channelOrderStatus !== ((settings as any).channel_order_status || '') ||
        channelEnquiries !== (settings.channel_enquiries || '') ||
        channelProcurements !== (settings.channel_procurements || '') ||
        channelSuppliers !== (settings.channel_suppliers || '') ||
        channelPipeline !== (settings.channel_pipeline || '') ||
        channelTickets !== (settings.channel_tickets || '') ||
        notifyNewEnquiries !== (settings.notify_new_enquiries ?? true) ||
        notifyNewProcurements !== (settings.notify_new_procurements ?? true) ||
        notifyNewSuppliers !== (settings.notify_new_suppliers ?? true) ||
        notifyNewPipeline !== (settings.notify_new_pipeline ?? true) ||
        notifyTicketAssigned !== (settings.notify_ticket_assigned ?? true) ||
        notifyTicketStatusChange !== (settings.notify_ticket_status_change ?? true) ||
        channelSalesReport !== ((settings as any).channel_sales_report || '') ||
        enableDailyReport !== ((settings as any).enable_daily_report ?? false) ||
        enableWeeklyReport !== ((settings as any).enable_weekly_report ?? false) ||
        enableAIInsights !== ((settings as any).enable_ai_insights ?? true) ||
        enableInteractiveActions !== ((settings as any).enable_interactive_actions ?? true);
      setHasChanges(changed);
    }
  }, [
    isEnabled, notifyNewOrders, notifyHotLeads, notifyPaymentReminders, notifyStatusChanges,
    channelOrders, channelOrderStatus, channelEnquiries, channelProcurements, channelSuppliers, channelPipeline,
    channelTickets, notifyNewEnquiries, notifyNewProcurements, notifyNewSuppliers, notifyNewPipeline,
    notifyTicketAssigned, notifyTicketStatusChange,
    channelSalesReport, enableDailyReport, enableWeeklyReport, enableAIInsights, enableInteractiveActions,
    settings
  ]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        is_enabled: isEnabled,
        notify_new_orders: notifyNewOrders,
        notify_hot_leads: notifyHotLeads,
        notify_payment_reminders: notifyPaymentReminders,
        notify_status_changes: notifyStatusChanges,
        notify_new_enquiries: notifyNewEnquiries,
        notify_new_procurements: notifyNewProcurements,
        notify_new_suppliers: notifyNewSuppliers,
        notify_new_pipeline: notifyNewPipeline,
        channel_orders: channelOrders || null,
        channel_enquiries: channelEnquiries || null,
        channel_procurements: channelProcurements || null,
        channel_suppliers: channelSuppliers || null,
        channel_pipeline: channelPipeline || null,
        channel_tickets: channelTickets || null,
        notify_ticket_assigned: notifyTicketAssigned,
        notify_ticket_status_change: notifyTicketStatusChange,
        channel_sales_report: channelSalesReport || null,
        enable_daily_report: enableDailyReport,
        enable_weekly_report: enableWeeklyReport,
        enable_ai_insights: enableAIInsights,
        enable_interactive_actions: enableInteractiveActions,
      } as any);
      setHasChanges(false);
    } finally {
      setSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    setTesting(true);
    try {
      await testWebhook();
    } finally {
      setTesting(false);
    }
  };

  const handleTestChannel = async (channelName: string, channelId: string) => {
    if (!channelId) return;
    setTestingChannel(channelName);
    try {
      await testChannel(channelId);
    } finally {
      setTestingChannel(null);
    }
  };

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
            Send notifications to different Slack channels for various business events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Credentials Info */}
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Slack Bot Token and Webhook URL are securely stored as environment secrets. 
              To update them, use the Secrets management panel.
            </AlertDescription>
          </Alert>

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

          <Separator />

          {/* Channel Configuration */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Channel Configuration</Label>
                <p className="text-sm text-muted-foreground">
                  Enter channel IDs (e.g., C04XXXXXX) or channel names (e.g., #orders) for each notification type
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestWebhook}
                disabled={testing}
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Test Webhook
              </Button>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Your Slack Bot needs the <code className="text-xs bg-muted px-1 rounded">chat:write</code> permission scope. 
                Don't forget to invite the bot to each channel with <code className="text-xs bg-muted px-1 rounded">/invite @YourBotName</code>
              </AlertDescription>
            </Alert>

            {/* Orders Channel */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-medium">Orders Channel</Label>
                </div>
                <Switch
                  checked={notifyNewOrders}
                  onCheckedChange={setNotifyNewOrders}
                  disabled={!isEnabled}
                />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="orders or C04XXXXXX"
                  value={channelOrders}
                  onChange={(e) => setChannelOrders(e.target.value)}
                  disabled={!isEnabled || !notifyNewOrders}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestChannel('orders', channelOrders)}
                  disabled={!channelOrders || testingChannel === 'orders'}
                >
                  {testingChannel === 'orders' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">New orders</p>
            </div>

            {/* Order Status Channel */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-medium">Order Status Channel</Label>
                </div>
                <Switch
                  checked={notifyStatusChanges}
                  onCheckedChange={setNotifyStatusChanges}
                  disabled={!isEnabled}
                />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="sales-order-confirmations or C04XXXXXX"
                  value={channelOrderStatus}
                  onChange={(e) => setChannelOrderStatus(e.target.value)}
                  disabled={!isEnabled || !notifyStatusChanges}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestChannel('order-status', channelOrderStatus)}
                  disabled={!channelOrderStatus || testingChannel === 'order-status'}
                >
                  {testingChannel === 'order-status' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Order status updates (shipped, delivered, cancelled)</p>
            </div>

            {/* Enquiries Channel */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-medium">Enquiries Channel</Label>
                </div>
                <Switch
                  checked={notifyNewEnquiries}
                  onCheckedChange={setNotifyNewEnquiries}
                  disabled={!isEnabled}
                />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="enquiries or C04XXXXXX"
                  value={channelEnquiries}
                  onChange={(e) => setChannelEnquiries(e.target.value)}
                  disabled={!isEnabled || !notifyNewEnquiries}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestChannel('enquiries', channelEnquiries)}
                  disabled={!channelEnquiries || testingChannel === 'enquiries'}
                >
                  {testingChannel === 'enquiries' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">New customer enquiries and hot leads</p>
            </div>

            {/* Pipeline Channel */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-medium">Pipeline Channel</Label>
                </div>
                <Switch
                  checked={notifyNewPipeline}
                  onCheckedChange={setNotifyNewPipeline}
                  disabled={!isEnabled}
                />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="pipeline or C04XXXXXX"
                  value={channelPipeline}
                  onChange={(e) => setChannelPipeline(e.target.value)}
                  disabled={!isEnabled || !notifyNewPipeline}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestChannel('pipeline', channelPipeline)}
                  disabled={!channelPipeline || testingChannel === 'pipeline'}
                >
                  {testingChannel === 'pipeline' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">New pipeline leads and mega deals</p>
            </div>

            {/* Procurements Channel */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-medium">Procurements Channel</Label>
                </div>
                <Switch
                  checked={notifyNewProcurements}
                  onCheckedChange={setNotifyNewProcurements}
                  disabled={!isEnabled}
                />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="procurements or C04XXXXXX"
                  value={channelProcurements}
                  onChange={(e) => setChannelProcurements(e.target.value)}
                  disabled={!isEnabled || !notifyNewProcurements}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestChannel('procurements', channelProcurements)}
                  disabled={!channelProcurements || testingChannel === 'procurements'}
                >
                  {testingChannel === 'procurements' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">New procurement entries</p>
            </div>

            {/* Suppliers Channel */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-medium">Suppliers Channel</Label>
                </div>
                <Switch
                  checked={notifyNewSuppliers}
                  onCheckedChange={setNotifyNewSuppliers}
                  disabled={!isEnabled}
                />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="suppliers or C04XXXXXX"
                  value={channelSuppliers}
                  onChange={(e) => setChannelSuppliers(e.target.value)}
                  disabled={!isEnabled || !notifyNewSuppliers}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestChannel('suppliers', channelSuppliers)}
                  disabled={!channelSuppliers || testingChannel === 'suppliers'}
                >
                  {testingChannel === 'suppliers' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">New supplier registrations</p>
            </div>

            {/* Tickets Channel */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-medium">Tickets Channel</Label>
                </div>
                <Switch
                  checked={notifyTicketAssigned}
                  onCheckedChange={setNotifyTicketAssigned}
                  disabled={!isEnabled}
                />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="tickets or C04XXXXXX"
                  value={channelTickets}
                  onChange={(e) => setChannelTickets(e.target.value)}
                  disabled={!isEnabled || !notifyTicketAssigned}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestChannel('tickets', channelTickets)}
                  disabled={!channelTickets || testingChannel === 'tickets'}
                >
                  {testingChannel === 'tickets' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-muted-foreground">Ticket assignments and status updates</p>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Status Updates</Label>
                  <Switch
                    checked={notifyTicketStatusChange}
                    onCheckedChange={setNotifyTicketStatusChange}
                    disabled={!isEnabled}
                  />
                </div>
              </div>
            </div>

            {/* Additional notification toggles */}
            <Separator />
            <Label className="text-base">Additional Notifications</Label>
            <div className="grid gap-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="font-medium">Hot Leads & Mega Deals</Label>
                  <p className="text-xs text-muted-foreground">Get alerted for high-priority leads</p>
                </div>
                <Switch checked={notifyHotLeads} onCheckedChange={setNotifyHotLeads} disabled={!isEnabled} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="font-medium">Payment Reminders</Label>
                  <p className="text-xs text-muted-foreground">Overdue and upcoming payments</p>
                </div>
                <Switch checked={notifyPaymentReminders} onCheckedChange={setNotifyPaymentReminders} disabled={!isEnabled} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="font-medium">Order Status Changes</Label>
                  <p className="text-xs text-muted-foreground">Track when order statuses are updated</p>
                </div>
                <Switch checked={notifyStatusChanges} onCheckedChange={setNotifyStatusChanges} disabled={!isEnabled} />
              </div>
            </div>
          </div>

          {/* Sales Report Section */}
          <Separator />
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <Label className="text-base font-medium">Automated Sales Reports</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Get automated sales performance reports with AI-generated insights delivered to Slack
            </p>

            {/* Report Channel */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <Label className="font-medium">Sales Report Channel</Label>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="sales-reports or C04XXXXXX"
                  value={channelSalesReport}
                  onChange={(e) => setChannelSalesReport(e.target.value)}
                  disabled={!isEnabled}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestChannel('sales-report', channelSalesReport)}
                  disabled={!channelSalesReport || testingChannel === 'sales-report'}
                >
                  {testingChannel === 'sales-report' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Channel where sales reports will be posted</p>
            </div>

            {/* Report Schedule Toggles */}
            <div className="grid gap-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="font-medium">Daily Report (9:00 PM)</Label>
                  <p className="text-xs text-muted-foreground">Daily summary with leads, orders, revenue & AI insights</p>
                </div>
                <Switch checked={enableDailyReport} onCheckedChange={setEnableDailyReport} disabled={!isEnabled} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="font-medium">Weekly Report (Sunday 9:00 PM)</Label>
                  <p className="text-xs text-muted-foreground">Weekly performance summary with trends</p>
                </div>
                <Switch checked={enableWeeklyReport} onCheckedChange={setEnableWeeklyReport} disabled={!isEnabled} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="font-medium">AI Insights</Label>
                  <p className="text-xs text-muted-foreground">Include AI-generated insights, risks & recommendations</p>
                </div>
                <Switch checked={enableAIInsights} onCheckedChange={setEnableAIInsights} disabled={!isEnabled} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="font-medium">Interactive Actions</Label>
                  <p className="text-xs text-muted-foreground">Add action buttons (follow-up, assign, remind) in report</p>
                </div>
                <Switch checked={enableInteractiveActions} onCheckedChange={setEnableInteractiveActions} disabled={!isEnabled} />
              </div>
            </div>

            {/* Manual Trigger Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setTriggeringReport('daily');
                  await triggerSalesReport('daily');
                  setTriggeringReport(null);
                }}
                disabled={!isEnabled || triggeringReport !== null}
              >
                {triggeringReport === 'daily' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BarChart3 className="h-4 w-4 mr-2" />}
                Send Daily Report Now
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setTriggeringReport('weekly');
                  await triggerSalesReport('weekly');
                  setTriggeringReport(null);
                }}
                disabled={!isEnabled || triggeringReport !== null}
              >
                {triggeringReport === 'weekly' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BarChart3 className="h-4 w-4 mr-2" />}
                Send Weekly Report Now
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setTriggeringReport('mtd');
                  await triggerSalesReport('mtd');
                  setTriggeringReport(null);
                }}
                disabled={!isEnabled || triggeringReport !== null}
              >
                {triggeringReport === 'mtd' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BarChart3 className="h-4 w-4 mr-2" />}
                Send MTD Report Now
              </Button>
            </div>
          </div>


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
