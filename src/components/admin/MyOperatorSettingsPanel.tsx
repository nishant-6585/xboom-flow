import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Phone, Check, X, Copy, ExternalLink } from 'lucide-react';
import { useMyOperatorConfig } from '@/hooks/useMyOperatorConfig';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

export const MyOperatorSettingsPanel = () => {
  const { config, loading, saveConfig, disconnect, testConnection } = useMyOperatorConfig();

  const [apiToken, setApiToken] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [xApiKey, setXApiKey] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/myoperator-webhook`;

  useEffect(() => {
    if (config) {
      setApiToken(config.api_token);
      setSecretKey(config.secret_key);
      setXApiKey(config.x_api_key);
      setCompanyId(config.company_id);
    }
  }, [config]);

  useEffect(() => {
    if (config) {
      setHasChanges(
        apiToken !== config.api_token ||
        secretKey !== config.secret_key ||
        xApiKey !== config.x_api_key ||
        companyId !== config.company_id
      );
    } else {
      setHasChanges(!!(apiToken || secretKey || xApiKey || companyId));
    }
  }, [apiToken, secretKey, xApiKey, companyId, config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveConfig({ api_token: apiToken, secret_key: secretKey, x_api_key: xApiKey, company_id: companyId });
      setHasChanges(false);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await testConnection({ api_token: apiToken, x_api_key: xApiKey, company_id: companyId });
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setApiToken('');
    setSecretKey('');
    setXApiKey('');
    setCompanyId('');
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied to clipboard');
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <Phone className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <CardTitle className="text-lg">MyOperator Integration</CardTitle>
              <CardDescription>Connect MyOperator for call-based lead automation</CardDescription>
            </div>
          </div>
          <Badge variant={config?.is_connected ? 'default' : 'secondary'} className={config?.is_connected ? 'bg-green-600' : ''}>
            {config?.is_connected ? (
              <><Check className="w-3 h-3 mr-1" /> Connected</>
            ) : (
              <><X className="w-3 h-3 mr-1" /> Not Connected</>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Webhook URL */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Webhook URL</Label>
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-xs bg-muted" />
            <Button variant="outline" size="icon" onClick={copyWebhookUrl} title="Copy URL">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Add this URL in your MyOperator dashboard under Webhooks/API Settings to receive call events.
          </p>
        </div>

        <Separator />

        {/* API Credentials */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold">API Credentials</h4>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mo-api-token">API Token</Label>
              <Input
                id="mo-api-token"
                type="password"
                placeholder="Enter API Token"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mo-secret-key">Secret Key</Label>
              <Input
                id="mo-secret-key"
                type="password"
                placeholder="Enter Secret Key"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mo-x-api-key">X-API-Key</Label>
              <Input
                id="mo-x-api-key"
                type="password"
                placeholder="Enter X-API-Key"
                value={xApiKey}
                onChange={(e) => setXApiKey(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mo-company-id">Company ID</Label>
              <Input
                id="mo-company-id"
                placeholder="Enter Company ID"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {config?.is_connected ? 'Update Configuration' : 'Connect & Save'}
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Test Connection
          </Button>
          {config?.is_connected && (
            <Button variant="destructive" onClick={handleDisconnect}>
              Disconnect
            </Button>
          )}
        </div>

        {/* Info */}
        <Alert>
          <Phone className="w-4 h-4" />
          <AlertDescription>
            Once connected, incoming calls will automatically create leads in the Enquiries panel. 
            Configure the webhook URL above in your MyOperator dashboard to start receiving call events.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};
