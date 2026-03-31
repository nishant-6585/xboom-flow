import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useGmailIntegration } from '@/hooks/useGmailIntegration';
import { useAuth } from '@/hooks/useAuth';
import { Mail, RefreshCw, Loader2, Trash2, Wifi, WifiOff, Clock, AlertCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function GmailIntegrationCard() {
  const { role } = useAuth();
  const {
    integrations,
    syncLogs,
    isLoading,
    connectGmail,
    isConnecting,
    syncNow,
    isSyncing,
    toggleIntegration,
    disconnectGmail,
  } = useGmailIntegration();

  const canManage = role === 'admin' || role === 'marketing';

  if (!canManage) return null;

  const recentLogs = syncLogs.slice(0, 5);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="w-5 h-5 text-red-500" />
            Gmail Integration
          </CardTitle>
          {integrations.length === 0 && (
            <Button
              size="sm"
              onClick={() => connectGmail()}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Mail className="w-4 h-4 mr-1" />
              )}
              Connect Gmail
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : integrations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Connect your Gmail account to automatically capture leads from incoming emails.
          </p>
        ) : (
          <>
            {integrations.map((integration) => (
              <div
                key={integration.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${integration.is_active ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                  <div>
                    <p className="text-sm font-medium">{integration.email}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {integration.last_synced_at
                        ? `Last synced ${formatDistanceToNow(new Date(integration.last_synced_at), { addSuffix: true })}`
                        : 'Never synced'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={integration.is_active}
                    onCheckedChange={(checked) =>
                      toggleIntegration({ id: integration.id, isActive: checked })
                    }
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncNow(integration.id)}
                    disabled={isSyncing || !integration.is_active}
                  >
                    {isSyncing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect Gmail?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove the Gmail connection for {integration.email}. Existing leads will not be affected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => disconnectGmail(integration.id)}>
                          Disconnect
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}

            {/* Add another account */}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => connectGmail()}
              disabled={isConnecting}
            >
              {isConnecting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}
              Connect Another Account
            </Button>

            {/* Recent Sync Logs */}
            {recentLogs.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-2">Recent Syncs</p>
                <div className="space-y-1">
                  {recentLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {format(new Date(log.created_at), 'dd MMM, HH:mm')}
                      </span>
                      <div className="flex items-center gap-2">
                        <span>{log.emails_fetched} scanned</span>
                        <Badge variant={log.leads_created > 0 ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                          {log.leads_created} leads
                        </Badge>
                        {log.errors && (
                          <AlertCircle className="w-3 h-3 text-destructive" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
