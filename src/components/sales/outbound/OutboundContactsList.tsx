import { useState } from "react";
import { Search, Users, Mail, Phone, Building2, MapPin, Linkedin, Star, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useOutboundContacts, OutboundContact } from "@/hooks/useOutboundContacts";

interface OutboundContactsListProps {
  filter?: 'all' | 'prospects' | 'attention';
}

export function OutboundContactsList({ filter = 'all' }: OutboundContactsListProps) {
  const { contacts, isLoadingContacts, toggleProspect, markAttention, resolveAttention } = useOutboundContacts();
  const [search, setSearch] = useState('');
  const [attentionDialog, setAttentionDialog] = useState<{ open: boolean; contactId: string }>({ open: false, contactId: '' });
  const [attentionReason, setAttentionReason] = useState('');

  let filtered = contacts.filter(c => {
    if (filter === 'prospects') return c.is_prospect;
    if (filter === 'attention') return c.needs_attention;
    return true;
  });

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(c =>
      c.contact_name?.toLowerCase().includes(q) ||
      c.company_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.city?.toLowerCase().includes(q)
    );
  }

  const title = filter === 'prospects' ? 'Prospects' : filter === 'attention' ? 'Attention Queue' : 'Outbound Contacts';
  const Icon = filter === 'prospects' ? Star : filter === 'attention' ? AlertTriangle : Users;

  const handleMarkAttention = async () => {
    if (!attentionReason.trim()) return;
    await markAttention.mutateAsync({ id: attentionDialog.contactId, reason: attentionReason });
    setAttentionDialog({ open: false, contactId: '' });
    setAttentionReason('');
  };

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Icon className="w-5 h-5 text-primary" />
              {title} ({filtered.length})
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingContacts ? (
            <p className="text-center text-muted-foreground py-8">Loading contacts...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {filter === 'prospects' ? 'No prospects yet. Mark contacts as prospects to see them here.' :
               filter === 'attention' ? 'No items need attention.' :
               'No contacts found. Upload an Excel file to get started.'}
            </p>
          ) : (
            <ScrollArea className="h-[500px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-2 font-medium">Contact</th>
                    <th className="text-left p-2 font-medium">Company</th>
                    <th className="text-left p-2 font-medium">Email</th>
                    <th className="text-left p-2 font-medium">Phone</th>
                    <th className="text-left p-2 font-medium">City</th>
                    <th className="text-left p-2 font-medium">Source</th>
                    <th className="text-left p-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id} className={`border-b hover:bg-muted/50 ${c.is_prospect ? 'bg-amber-500/5' : ''} ${c.needs_attention ? 'bg-destructive/5' : ''}`}>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-medium">{c.contact_name}</p>
                            {c.designation && <p className="text-xs text-muted-foreground">{c.designation}</p>}
                          </div>
                          {c.linkedin_url && (
                            <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                              <Linkedin className="w-3.5 h-3.5 text-blue-600 hover:text-blue-800" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        {c.company_name ? (
                          <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{c.company_name}</span>
                        ) : '-'}
                      </td>
                      <td className="p-2">
                        {c.email ? (
                          <span className="flex items-center gap-1 text-xs"><Mail className="w-3 h-3" />{c.email}</span>
                        ) : '-'}
                      </td>
                      <td className="p-2">
                        {c.phone ? (
                          <span className="flex items-center gap-1 text-xs"><Phone className="w-3 h-3" />{c.phone}</span>
                        ) : '-'}
                      </td>
                      <td className="p-2">
                        {c.city ? (
                          <span className="flex items-center gap-1 text-xs"><MapPin className="w-3 h-3" />{c.city}</span>
                        ) : '-'}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-col gap-1">
                          {c.source_type && <Badge variant="outline" className="text-xs w-fit">{c.source_type}</Badge>}
                          {c.source_sheet && <span className="text-[10px] text-muted-foreground">{c.source_sheet}</span>}
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost" size="icon"
                                className={`h-7 w-7 rounded-full ${c.is_prospect ? 'bg-amber-500/20 text-amber-600' : 'text-muted-foreground hover:text-amber-600'}`}
                                onClick={() => toggleProspect.mutate({ id: c.id, value: !c.is_prospect })}
                              >
                                <Star className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{c.is_prospect ? 'Remove Prospect' : 'Mark as Prospect'}</TooltipContent>
                          </Tooltip>

                          {filter === 'attention' && c.needs_attention ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-7 w-7 rounded-full text-green-600 hover:bg-green-500/20"
                                  onClick={() => resolveAttention.mutate(c.id)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Resolve Attention</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost" size="icon"
                                  className={`h-7 w-7 rounded-full ${c.needs_attention ? 'bg-destructive/20 text-destructive' : 'text-muted-foreground hover:text-destructive'}`}
                                  onClick={() => {
                                    if (!c.needs_attention) setAttentionDialog({ open: true, contactId: c.id });
                                  }}
                                  disabled={c.needs_attention}
                                >
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{c.needs_attention ? `Attention: ${c.attention_reason}` : 'Mark for Attention'}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={attentionDialog.open} onOpenChange={o => { if (!o) setAttentionDialog({ open: false, contactId: '' }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark for Attention</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Reason (e.g., wrong data, important lead, follow-up needed)"
            value={attentionReason}
            onChange={e => setAttentionReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttentionDialog({ open: false, contactId: '' })}>Cancel</Button>
            <Button onClick={handleMarkAttention} disabled={!attentionReason.trim() || markAttention.isPending}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
