import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { PhoneCall, Loader2, Check, X, Info } from 'lucide-react';
import { useExotelCallerIdSetting } from '@/hooks/useExotelCallerIdSetting';

export function ExotelSettingsPanel() {
  const { callerId, loading, saving, save } = useExotelCallerIdSetting();
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setDraft(callerId);
  }, [callerId]);

  const dirty = draft.trim() !== callerId.trim();
  const isConfigured = !!callerId.trim();

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
            <div className="p-2 rounded-lg bg-primary/10">
              <PhoneCall className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Exotel Outbound Calling</CardTitle>
              <CardDescription>Caller ID used when initiating outbound calls via Exotel → ElevenLabs Flow</CardDescription>
            </div>
          </div>
          <Badge variant={isConfigured ? 'default' : 'secondary'} className={isConfigured ? 'bg-green-600' : ''}>
            {isConfigured ? (
              <><Check className="w-3 h-3 mr-1" /> Configured</>
            ) : (
              <><X className="w-3 h-3 mr-1" /> Using fallback</>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="exotel-caller-id">Exotel Caller ID</Label>
          <Input
            id="exotel-caller-id"
            placeholder="e.g. 08047259999"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            inputMode="tel"
          />
          <p className="text-xs text-muted-foreground">
            Your verified Exotel virtual number. This appears as the Caller ID for outbound calls.
            Leave empty to fall back to the EXOTEL_CALLER_ID environment secret.
          </p>
        </div>

        <Separator />

        <div className="flex flex-wrap gap-3">
          <Button onClick={() => save(draft)} disabled={saving || !dirty}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Caller ID
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={() => setDraft(callerId)} disabled={saving}>
              Cancel
            </Button>
          )}
        </div>

        <Alert>
          <Info className="w-4 h-4" />
          <AlertDescription className="text-xs">
            All API credentials (SID, API Key, Token, Flow URL) are stored as encrypted secrets and never exposed to the browser.
            Calls are routed via the India region endpoint (api.in.exotel.com) and logged in <code>call_logs</code>.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
