import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Building2, Loader2, Check, Plus } from 'lucide-react';
import { useCompanies } from '@/hooks/useCompanies';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePushToCompany, pushLeadToCompanyToast, type PushLeadInput } from '@/hooks/usePushToCompany';
import { normalizeCompanyName } from '@/lib/companyNormalize';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface Props {
  /** Lead context — used to (a) auto-create a company when the user picks "create" and (b) attach the contact to the chosen company. */
  lead: PushLeadInput;
  /** Optional preselected text for the search box. Defaults to lead.company. */
  initialQuery?: string;
  className?: string;
}

/**
 * Compact icon button rendered in lead-source rows. Opens a picker that lets the
 * user link this lead's contact to an existing Company, or create one on the fly
 * (matching the `Sync from Leads` flow). Stops row click-through.
 */
export function LinkToCompanyButton({ lead, initialQuery, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const { companies, loading } = useCompanies();
  const { user, userName } = useAuth();
  const { pushLeadToCompany } = usePushToCompany();
  const qc = useQueryClient();

  const personName = (lead.customer_name || '').trim();

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setQuery(initialQuery || lead.company || '');
    setOpen(true);
  };

  // Attach lead's contact to an already-existing company (no fuzzy match needed)
  const linkToExisting = async (companyId: string, companyName: string) => {
    if (!user) return;
    setBusy(true);
    try {
      const { data: existingContacts } = await supabase
        .from('company_contacts')
        .select('id, name, phone, email')
        .eq('company_id', companyId);

      const dup = (existingContacts || []).find((c: any) =>
        (personName && c.name && c.name.toLowerCase().trim() === personName.toLowerCase().trim()) ||
        (lead.phone && c.phone && c.phone.replace(/\D/g, '') === (lead.phone || '').replace(/\D/g, '')) ||
        (lead.email && c.email && c.email.toLowerCase() === (lead.email || '').toLowerCase())
      );

      if (dup) {
        const patch: Record<string, any> = { is_primary: true };
        if (!dup.phone && lead.phone) patch.phone = lead.phone;
        if (!dup.email && lead.email) patch.email = lead.email;
        if (!dup.name && personName) patch.name = personName;
        await supabase.from('company_contacts').update({ is_primary: false }).eq('company_id', companyId);
        await supabase.from('company_contacts').update(patch).eq('id', dup.id);
      } else if (personName || lead.phone || lead.email) {
        await supabase.from('company_contacts').update({ is_primary: false }).eq('company_id', companyId);
        const { error } = await supabase.from('company_contacts').insert([{
          company_id: companyId,
          name: personName || lead.phone || lead.email || 'Unknown',
          phone: lead.phone || null,
          email: lead.email || null,
          is_primary: true,
          notes: lead.source_label ? `From ${lead.source_label}` : null,
        } as any]);
        if (error) throw error;
      }

      // Patch missing company-level fields
      const target = companies.find(c => c.id === companyId);
      if (target) {
        const patch: Record<string, any> = {};
        if (!target.phone && lead.phone) patch.phone = lead.phone;
        if (!target.email && lead.email) patch.email = lead.email;
        if (!target.city && lead.city) patch.city = lead.city;
        if (!target.state && lead.state) patch.state = lead.state;
        if (Object.keys(patch).length) {
          await supabase.from('companies').update(patch).eq('id', companyId);
        }
      }

      qc.invalidateQueries({ queryKey: ['companies'] });
      qc.invalidateQueries({ queryKey: ['company-contacts', companyId] });
      toast.success(`Linked to ${companyName}`);
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'Link failed');
    } finally {
      setBusy(false);
    }
  };

  const createAndLink = async () => {
    const name = query.trim();
    if (!name) {
      toast.error('Type a company name');
      return;
    }
    if (!user) return;
    setBusy(true);
    try {
      const r = await pushLeadToCompanyToast(() => pushLeadToCompany({ ...lead, company: name }));
      if (r.ok) setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const q = query.toLowerCase().trim();
  const filtered = q
    ? companies.filter(c => c.name?.toLowerCase().includes(q))
    : companies.slice(0, 20);

  const exactKey = q ? normalizeCompanyName(query) : '';
  const exactExists = !!q && companies.some(c => normalizeCompanyName(c.name) === exactKey);

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className={cn('h-7 w-7 text-muted-foreground hover:text-primary', className)}
        onClick={handleOpen}
        title="Link to a company"
      >
        <Building2 className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
        <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Link to Company
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              {personName || lead.phone || lead.email || 'This contact'} will be added as the primary contact.
            </div>
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search or type new company name..."
                value={query}
                onValueChange={setQuery}
              />
              <CommandList className="max-h-64">
                {loading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <CommandEmpty>No matching companies.</CommandEmpty>
                    <CommandGroup heading="Existing companies">
                      {filtered.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.id}
                          onSelect={() => linkToExisting(c.id, c.name)}
                          disabled={busy}
                        >
                          <Check className="mr-2 h-3.5 w-3.5 opacity-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{c.name}</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {[c.industry, c.city].filter(Boolean).join(' · ') || '—'}
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground ml-2 capitalize">{c.status}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </div>
          <DialogFooter className="sm:justify-between gap-2">
            <div className="text-[11px] text-muted-foreground self-center">
              {exactExists ? 'Exact match found in list above.' : 'No exact match — you can create it.'}
            </div>
            <Button
              size="sm"
              onClick={createAndLink}
              disabled={busy || !query.trim() || exactExists}
              className="gap-1.5"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create "{query.trim() || '...'}"
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}