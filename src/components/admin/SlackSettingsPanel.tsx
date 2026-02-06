import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, MessageSquare, Send, Check, AlertCircle, Hash, Info } from 'lucide-react';
import { useSlackSettings } from '@/hooks/useSlackSettings';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';

export const SlackSettingsPanel = () => {
  const { settings, loading, updateSettings, testWebhook, testChannel } = useSlackSettings();
  
  // Legacy webhook mode
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);
  const [notifyNewOrders, setNotifyNewOrders] = useState(true);
  const [notifyHotLeads, setNotifyHotLeads] = useState(true);
  const [notifyPaymentReminders, setNotifyPaymentReminders] = useState(true);
  const [notifyStatusChanges, setNotifyStatusChanges] = useState(true);
  
  // Multi-channel mode
  const [botToken, setBotToken] = useState('');
  const [channelOrders, setChannelOrders] = useState('');
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
  
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState('channels');

  useEffect(() => {
    if (settings) {
      setWebhookUrl(settings.webhook_url || '');
      setIsEnabled(settings.is_enabled);
      setNotifyNewOrders(settings.notify_new_orders);
      setNotifyHotLeads(settings.notify_hot_leads);
      setNotifyPaymentReminders(settings.notify_payment_reminders);
      setNotifyStatusChanges(settings.notify_status_changes);
      setBotToken(settings.slack_bot_token || '');
      setChannelOrders(settings.channel_orders || '');
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
        notifyStatusChanges !== settings.notify_status_changes ||
        botToken !== (settings.slack_bot_token || '') ||
        channelOrders !== (settings.channel_orders || '') ||
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
        notifyTicketStatusChange !== (settings.notify_ticket_status_change ?? true);
      setHasChanges(changed);
    }
  }, [
    webhookUrl, isEnabled, notifyNewOrders, notifyHotLeads, notifyPaymentReminders, notifyStatusChanges,
    botToken, channelOrders, channelEnquiries, channelProcurements, channelSuppliers, channelPipeline,
    channelTickets, notifyNewEnquiries, notifyNewProcurements, notifyNewSuppliers, notifyNewPipeline,
    notifyTicketAssigned, notifyTicketStatusChange, settings
  ]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        webhook_url: webhookUrl || null,
        slack_bot_token: botToken || null,
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
      });
      setHasChanges(false);
    } finally {
      setSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl) return;
    setTesting(true);
    try {
      await testWebhook(webhookUrl);
    } finally {
      setTesting(false);
    }
  };

  const handleTestChannel = async (channelName: string, channelId: string) => {
    if (!channelId || !botToken) return;
    setTestingChannel(channelName);
    try {
      await testChannel(channelId, botToken);
    } finally {
      setTestingChannel(null);
    }
  };

  const isValidWebhookUrl = webhookUrl.startsWith('https://hooks.slack.com/');
  const isValidBotToken = botToken.startsWith('xoxb-');

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

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="channels">Multi-Channel (Recommended)</TabsTrigger>
              <TabsTrigger value="webhook">Single Webhook</TabsTrigger>
            </TabsList>

            <TabsContent value="channels" className="space-y-6 mt-4">
              {/* Bot Token */}
              <div className="space-y-2">
                <Label htmlFor="bot-token">Slack Bot Token</Label>
                <Input
                  id="bot-token"
                  type="password"
                  placeholder="xoxb-..."
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Create a Slack App and get the Bot Token from OAuth & Permissions.{' '}
                  <a
                    href="https://api.slack.com/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Create Slack App
                  </a>
                </p>
                {botToken && !isValidBotToken && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Bot token should start with 'xoxb-'
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Your Slack Bot needs the <code className="text-xs bg-muted px-1 rounded">chat:write</code> permission scope. 
                  Don't forget to invite the bot to each channel with <code className="text-xs bg-muted px-1 rounded">/invite @YourBotName</code>
                </AlertDescription>
              </Alert>

              <Separator />

              {/* Channel Configuration */}
              <div className="space-y-4">
                <Label className="text-base">Channel Configuration</Label>
                <p className="text-sm text-muted-foreground">
                  Enter channel IDs (e.g., C04XXXXXX) or channel names (e.g., #orders) for each notification type
                </p>

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
                      disabled={!channelOrders || !isValidBotToken || testingChannel === 'orders'}
                    >
                      {testingChannel === 'orders' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">New orders and order status changes</p>
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
                      disabled={!channelEnquiries || !isValidBotToken || testingChannel === 'enquiries'}
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
                      disabled={!channelPipeline || !isValidBotToken || testingChannel === 'pipeline'}
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
                      disabled={!channelProcurements || !isValidBotToken || testingChannel === 'procurements'}
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
                      disabled={!channelSuppliers || !isValidBotToken || testingChannel === 'suppliers'}
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
                      disabled={!channelTickets || !isValidBotToken || testingChannel === 'tickets'}
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
              </div>
            </TabsContent>

            <TabsContent value="webhook" className="space-y-6 mt-4">
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
                    onClick={handleTestWebhook}
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

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Single webhook mode sends all notifications to one channel. 
                  For multi-channel support, use the "Multi-Channel" tab with a Slack Bot Token.
                </AlertDescription>
              </Alert>

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
            </TabsContent>
          </Tabs>

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
