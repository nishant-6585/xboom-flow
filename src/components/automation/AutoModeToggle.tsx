import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, ShieldCheck, Activity } from 'lucide-react';
import { toast } from 'sonner';

export function AutoModeToggle() {
  const [autoMode, setAutoMode] = useState(() => {
    return localStorage.getItem('xboom_ai_auto_mode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('xboom_ai_auto_mode', String(autoMode));
  }, [autoMode]);

  const handleToggle = (checked: boolean) => {
    setAutoMode(checked);
    toast.success(checked
      ? 'Auto Mode ON — Low-risk actions will execute automatically'
      : 'Auto Mode OFF — All actions will require manual confirmation'
    );
  };

  return (
    <Card className={autoMode ? 'border-primary/30 bg-primary/5' : ''}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${autoMode ? 'bg-primary/10' : 'bg-muted'}`}>
              <Bot className={`w-5 h-5 ${autoMode ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">AI Auto Mode</p>
                <Badge variant={autoMode ? 'default' : 'secondary'} className="text-[10px]">
                  {autoMode ? 'ON' : 'OFF'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {autoMode
                  ? 'Low-risk actions auto-execute. Medium/High require approval.'
                  : 'All AI actions require manual confirmation.'
                }
              </p>
            </div>
          </div>
          <Switch checked={autoMode} onCheckedChange={handleToggle} />
        </div>
        {autoMode && (
          <div className="flex gap-3 mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-xs text-green-600">
              <Activity className="w-3.5 h-3.5" /> Low risk: Auto
            </div>
            <div className="flex items-center gap-1.5 text-xs text-amber-600">
              <ShieldCheck className="w-3.5 h-3.5" /> Medium: Confirm
            </div>
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <ShieldCheck className="w-3.5 h-3.5" /> High: Approval
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
