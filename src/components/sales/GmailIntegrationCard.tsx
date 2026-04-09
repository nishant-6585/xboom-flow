import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useGmailIntegration } from '@/hooks/useGmailIntegration';
import { useAuth } from '@/hooks/useAuth';
import { Mail, RefreshCw, Loader2, Trash2, Clock, AlertCircle, CheckCircle2, XCircle, Timer } from 'lucide-react';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

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
  const [logsExpanded, setLogsExpanded] = useState(false);

  const canManage = role === 'admin' || role === 'sales_manager';

  if (!canManage) return null;

  const recentLogs = syncLogs.slice(0, 5);
  const allLogs = syncLogs.slice(0, 20);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="w-5 h-5 text-red-500" />
            Gmail Integration
            <Badge variant="outline" className="ml-2 text-[10px] bg-green-500/10 text-green-600 border-green-500/30">
              <Timer className="w-3 h-3 mr-1" />
              Auto-sync every 1hr
            </Badge>
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

            {/* Sync History */}
            {recentLogs.length > 0 && (
              <Collapsible open={logsExpanded} onOpenChange={setLogsExpanded}>
                <div className="pt-2 border-t">
                  <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground mb-2 hover:text-foreground transition-colors">
                    <span className="flex items-center gap-1">
                      {logsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      Sync History ({syncLogs.length} total)
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {syncLogs.reduce((s, l) => s + l.leads_created, 0)} total leads synced
                    </Badge>
                  </CollapsibleTrigger>

                  {/* Always show last 5 */}
                  <div className="space-y-1">
                    {recentLogs.map((log) => (
                      <SyncLogRow key={log.id} log={log} />
                    ))}
                  </div>

                  <CollapsibleContent>
                    <div className="space-y-1 mt-1">
                      {allLogs.slice(5).map((log) => (
                        <SyncLogRow key={log.id} log={log} />
                      ))}
                    </div>
                  </CollapsibleContent>

                  {syncLogs.length > 5 && (
                    <CollapsibleTrigger className="text-[10px] text-primary hover:underline mt-1 block">
                      {logsExpanded ? 'Show less' : `Show ${Math.min(syncLogs.length - 5, 15)} more…`}
                    </CollapsibleTrigger>
                  )}
                </div>
              </Collapsible>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SyncLogRow({ log }: { log: { id: string; emails_fetched: number; leads_created: number; errors: string | null; created_at: string } }) {
  const hasError = !!log.errors;
  return (
    <div className="flex items-center justify-between text-xs py-1 px-1 rounded hover:bg-muted/30">
      <div className="flex items-center gap-2">
        {hasError ? (
          <XCircle className="w-3 h-3 text-destructive shrink-0" />
        ) : (
          <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
        )}
        <span className="text-muted-foreground">
          {format(new Date(log.created_at), 'dd MMM, HH:mm')}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">{log.emails_fetched} scanned</span>
        <Badge
          variant={log.leads_created > 0 ? 'default' : 'secondary'}
          className="text-[10px] px-1.5 py-0"
        >
          +{log.leads_created} leads
        </Badge>
        {hasError && (
          <AlertCircle className="w-3 h-3 text-destructive" />
        )}
      </div>
    </div>
  );
}
