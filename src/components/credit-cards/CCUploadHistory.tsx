import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { CreditCard } from '@/hooks/useCreditCards';
import { Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface Props {
  cards: CreditCard[];
}

export function CCUploadHistory({ cards }: Props) {
  const [uploads, setUploads] = useState<any[]>([]);

  useEffect(() => {
    const fetchUploads = async () => {
      const { data } = await supabase
        .from('statement_uploads' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      setUploads((data as any[]) || []);
    };
    fetchUploads();
  }, []);

  if (uploads.length === 0) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case 'failed': return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      case 'processing':
      case 'parsed': return <Loader2 className="h-3.5 w-3.5 text-yellow-500 animate-spin" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success': return <Badge className="bg-green-500/10 text-green-600 border-green-500/30 text-[10px]">Success</Badge>;
      case 'failed': return <Badge className="bg-red-500/10 text-red-600 border-red-500/30 text-[10px]">Failed</Badge>;
      case 'parsed': return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-[10px]">Parsed</Badge>;
      default: return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30 text-[10px]">Processing</Badge>;
    }
  };

  return (
    <div className="space-y-2 pt-2 border-t border-border/50">
      <p className="text-xs font-medium text-muted-foreground">Recent Uploads</p>
      <div className="space-y-1.5">
        {uploads.map((u: any) => {
          const card = cards.find(c => c.id === u.card_id);
          return (
            <div key={u.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                {getStatusIcon(u.status)}
                <span className="truncate font-medium">{u.file_name}</span>
                {card && <span className="text-muted-foreground shrink-0">• {card.card_name}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {u.ai_confidence_score != null && (
                  <span className="text-muted-foreground">{u.ai_confidence_score}%</span>
                )}
                {getStatusBadge(u.status)}
                <span className="text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
