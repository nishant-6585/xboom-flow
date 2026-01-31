import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { History, PenTool, FileText, Loader2 } from 'lucide-react';

interface AuditLogEntry {
  id: string;
  invoice_id: string;
  invoice_number: string;
  invoice_version: number;
  action: string;
  signed_by_name: string | null;
  signed_at: string | null;
  pdf_url: string | null;
  metadata: any;
  created_at: string;
}

interface InvoiceAuditLogProps {
  invoiceId: string;
}

export function InvoiceAuditLog({ invoiceId }: InvoiceAuditLogProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, [invoiceId]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('invoice_audit_logs')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'signed':
        return <PenTool className="h-4 w-4 text-green-600" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'signed':
        return 'Signed';
      case 'created':
        return 'Created';
      case 'updated':
        return 'Updated';
      default:
        return action;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <History className="h-4 w-4" />
            Audit Log
          </CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground text-center">
            No audit entries yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <History className="h-4 w-4" />
          Audit Log
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-3">
            {logs.map((log) => (
              <div 
                key={log.id} 
                className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getActionIcon(log.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">
                      {getActionLabel(log.action)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      v{log.invoice_version}
                    </span>
                  </div>
                  {log.signed_by_name && (
                    <p className="text-sm font-medium">
                      Signed by {log.signed_by_name}
                    </p>
                  )}
                  {log.metadata?.total_amount && (
                    <p className="text-xs text-muted-foreground">
                      Amount: ₹{log.metadata.total_amount.toLocaleString('en-IN')}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(log.created_at), 'dd MMM yyyy, HH:mm')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
