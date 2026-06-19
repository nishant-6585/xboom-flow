import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Package, ShoppingCart, FileText, Users, Building2,
  Search, Box, ClipboardList, IndianRupee, Wrench,
  BarChart3, Briefcase, ListTodo, Ticket, Phone, UserCheck, Cpu
} from 'lucide-react';

interface SearchResult {
  id: string;
  label: string;
  sublabel: string;
  type: 'order' | 'enquiry' | 'invoice' | 'supplier' | 'inventory' | 'pipeline' | 'prospect' | 'company' | 'call_log' | 'candidate';
  route: string;
}

const NAV_ITEMS = [
  { label: 'Dashboard', route: '/', icon: BarChart3 },
  { label: 'Sales Arena', route: '/sales', icon: Briefcase },
  { label: 'Orders', route: '/orders', icon: ShoppingCart },
  { label: 'Procurement', route: '/procurement', icon: Box },
  { label: 'Inventory', route: '/inventory', icon: Package },
  { label: 'Spare Parts', route: '/spare-parts', icon: Package },
  { label: 'Pricelist', route: '/pricelist', icon: ClipboardList },
  { label: 'Finance', route: '/finance', icon: IndianRupee },
  { label: 'Quotes', route: '/sales?tab=quotes', icon: FileText },
  { label: 'Suppliers', route: '/suppliers', icon: Building2 },
  { label: 'Tasks', route: '/tasks', icon: ListTodo },
  { label: 'Tickets', route: '/tickets', icon: Ticket },
  { label: 'Repairs', route: '/repairs', icon: Wrench },
  { label: 'HR', route: '/hr', icon: Users },
  { label: 'Demo & Trainings', route: '/drone-operations', icon: Cpu },
];

const TYPE_CONFIG: Record<string, { heading: string; icon: typeof Search }> = {
  order: { heading: 'Orders', icon: ShoppingCart },
  enquiry: { heading: 'Enquiries', icon: ClipboardList },
  invoice: { heading: 'Invoices', icon: FileText },
  supplier: { heading: 'Suppliers', icon: Building2 },
  inventory: { heading: 'Inventory', icon: Package },
  pipeline: { heading: 'Pipeline', icon: BarChart3 },
  prospect: { heading: 'Prospects', icon: UserCheck },
  company: { heading: 'Companies', icon: Building2 },
  call_log: { heading: 'Call Logs', icon: Phone },
  candidate: { heading: 'Candidates', icon: Users },
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const { user, role } = useAuth();

  // Global keyboard shortcut + custom event listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    const handleOpen = () => setOpen(true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-command-palette', handleOpen);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-command-palette', handleOpen);
    };
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2 || !user) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      const searchResults: SearchResult[] = [];
      const searchTerm = `%${query}%`;

      try {
        // Run all searches in parallel for speed
        const promises: Promise<void>[] = [];

        // Search orders
        promises.push(
          supabase
            .from('orders')
            .select('id, order_number, customer_name, customer_company, product_name, customer_email')
            .or(`order_number.ilike.${searchTerm},customer_name.ilike.${searchTerm},customer_company.ilike.${searchTerm},product_name.ilike.${searchTerm},customer_email.ilike.${searchTerm}`)
            .limit(5)
            .then(({ data }) => {
              data?.forEach(o => {
                searchResults.push({
                  id: o.id,
                  label: `${o.order_number || 'Order'} - ${o.customer_name}`,
                  sublabel: [o.product_name, o.customer_company, o.customer_email].filter(Boolean).join(' • '),
                  type: 'order',
                  route: `/orders?orderId=${o.id}`,
                });
              });
            }) as unknown as Promise<void>
        );

        // Search enquiries
        promises.push(
          supabase
            .from('enquiries')
            .select('id, customer_name, customer_company, product_name, customer_state')
            .or(`customer_name.ilike.${searchTerm},customer_company.ilike.${searchTerm},product_name.ilike.${searchTerm}`)
            .limit(5)
            .then(({ data }) => {
              data?.forEach(e => {
                searchResults.push({
                  id: e.id,
                  label: `${e.customer_name} - ${e.customer_company}`,
                  sublabel: [e.product_name, e.customer_state].filter(Boolean).join(' • '),
                  type: 'enquiry',
                  route: `/sales?tab=enquiries&leadId=${e.id}`,
                });
              });
            }) as unknown as Promise<void>
        );

        // Search invoices
        promises.push(
          supabase
            .from('invoices')
            .select('id, invoice_number, customer_name, customer_company')
            .or(`invoice_number.ilike.${searchTerm},customer_name.ilike.${searchTerm},customer_company.ilike.${searchTerm}`)
            .limit(5)
            .then(({ data }) => {
              data?.forEach(i => {
                searchResults.push({
                  id: i.id,
                  label: `${i.invoice_number} - ${i.customer_name}`,
                  sublabel: i.customer_company || '',
                  type: 'invoice',
                  route: `/billing?invoiceId=${i.id}`,
                });
              });
            }) as unknown as Promise<void>
        );

        // Search suppliers via SECURITY DEFINER RPC (works for supply_chain
        // role which no longer has direct SELECT on the base table).
        promises.push(
          supabase
            .rpc('get_suppliers_safe')
            .then(({ data }) => {
              const q = query.toLowerCase();
              const matches = ((data as any[]) || []).filter(s => {
                return (
                  (s.name || '').toLowerCase().includes(q) ||
                  (s.product_category || '').toLowerCase().includes(q) ||
                  (s.email || '').toLowerCase().includes(q) ||
                  (s.phone || '').toLowerCase().includes(q)
                );
              }).slice(0, 5);
              matches.forEach(s => {
                searchResults.push({
                  id: s.id,
                  label: s.name,
                  sublabel: [s.product_category, s.phone, s.email].filter(Boolean).join(' • '),
                  type: 'supplier',
                  route: `/suppliers?supplierId=${s.id}`,
                });
              });
            }) as unknown as Promise<void>
        );

        // Search inventory
        promises.push(
          supabase
            .from('inventory')
            .select('id, product_name, product_category, current_stock')
            .or(`product_name.ilike.${searchTerm},product_category.ilike.${searchTerm}`)
            .limit(5)
            .then(({ data }) => {
              data?.forEach(inv => {
                searchResults.push({
                  id: inv.id,
                  label: inv.product_name,
                  sublabel: `${inv.product_category} • Stock: ${inv.current_stock}`,
                  type: 'inventory',
                  route: `/inventory`,
                });
              });
            }) as unknown as Promise<void>
        );

        // Search pipeline orders
        promises.push(
          supabase
            .from('pipeline_orders')
            .select('id, customer_name, customer_company, product_name, customer_phone, customer_email, status')
            .or(`customer_name.ilike.${searchTerm},customer_company.ilike.${searchTerm},product_name.ilike.${searchTerm},customer_phone.ilike.${searchTerm},customer_email.ilike.${searchTerm}`)
            .limit(5)
            .then(({ data }) => {
              data?.forEach(p => {
                searchResults.push({
                  id: p.id,
                  label: `${p.customer_name} - ${p.customer_company}`,
                  sublabel: [p.product_name, p.customer_phone, p.status].filter(Boolean).join(' • '),
                  type: 'pipeline',
                  route: `/sales?tab=pipeline&leadId=${p.id}`,
                });
              });
            }) as unknown as Promise<void>
        );

        // Search prospects
        promises.push(
          supabase
            .from('prospects')
            .select('id, customer_name, customer_company, phone_number, email, product_name, status')
            .or(`customer_name.ilike.${searchTerm},customer_company.ilike.${searchTerm},phone_number.ilike.${searchTerm},email.ilike.${searchTerm},product_name.ilike.${searchTerm}`)
            .limit(5)
            .then(({ data }) => {
              data?.forEach(pr => {
                searchResults.push({
                  id: pr.id,
                  label: `${pr.customer_name}${pr.customer_company ? ' - ' + pr.customer_company : ''}`,
                  sublabel: [pr.product_name, pr.phone_number, pr.status].filter(Boolean).join(' • '),
                  type: 'prospect',
                  route: `/sales?tab=prospects&leadId=${pr.id}`,
                });
              });
            }) as unknown as Promise<void>
        );

        // Search companies
        promises.push(
          supabase
            .from('companies')
            .select('id, name, city, phone, email, industry')
            .or(`name.ilike.${searchTerm},city.ilike.${searchTerm},phone.ilike.${searchTerm},email.ilike.${searchTerm},industry.ilike.${searchTerm}`)
            .limit(5)
            .then(({ data }) => {
              data?.forEach(c => {
                searchResults.push({
                  id: c.id,
                  label: c.name,
                  sublabel: [c.industry, c.city, c.phone].filter(Boolean).join(' • '),
                  type: 'company',
                  route: `/sales?tab=companies&leadId=${c.id}`,
                });
              });
            }) as unknown as Promise<void>
        );

        // Search call logs
        promises.push(
          supabase
            .from('call_logs')
            .select('id, caller_number, full_number, customer_name, customer_company, product_name, email')
            .or(`caller_number.ilike.${searchTerm},full_number.ilike.${searchTerm},customer_name.ilike.${searchTerm},customer_company.ilike.${searchTerm},email.ilike.${searchTerm}`)
            .limit(5)
            .then(({ data }) => {
              data?.forEach(cl => {
                searchResults.push({
                  id: cl.id,
                  label: `${cl.customer_name || 'Unknown'} - ${cl.caller_number}`,
                  sublabel: [cl.customer_company, cl.product_name].filter(Boolean).join(' • '),
                  type: 'call_log',
                  route: `/sales?tab=leads&search=${encodeURIComponent(cl.caller_number || cl.full_number || '')}`,
                });
              });
            }) as unknown as Promise<void>
        );

        // Search candidates (HR/Admin only)
        if (role === 'admin' || role === 'hr') {
          promises.push(
            supabase
              .from('candidates')
              .select('id, full_name, email, phone, job_role_applied, current_company')
              .or(`full_name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm},job_role_applied.ilike.${searchTerm},current_company.ilike.${searchTerm}`)
              .limit(5)
              .then(({ data }) => {
                data?.forEach(ca => {
                  searchResults.push({
                    id: ca.id,
                    label: ca.full_name,
                    sublabel: [ca.job_role_applied, ca.current_company, ca.phone].filter(Boolean).join(' • '),
                    type: 'candidate',
                    route: `/candidates`,
                  });
                });
              }) as unknown as Promise<void>
          );
        }

        await Promise.all(promises);
        setResults(searchResults);
      } catch (err) {
        console.error('Command palette search error:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, user, role]);

  const handleSelect = (route: string) => {
    setOpen(false);
    setQuery('');
    navigate(route);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <CommandInput
        placeholder="Search by name, phone, email, company across all modules..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {searching ? 'Searching...' : query.length < 2 ? 'Type to search...' : 'No results found.'}
        </CommandEmpty>

        {/* Navigation */}
        {!query && (
          <CommandGroup heading="Navigate">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.route}
                  onSelect={() => handleSelect(item.route)}
                  className="gap-2"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Search Results */}
        {results.length > 0 && (
          <>
            {Object.keys(TYPE_CONFIG).map(type => {
              const typeResults = results.filter(r => r.type === type);
              if (typeResults.length === 0) return null;
              const config = TYPE_CONFIG[type];
              const Icon = config.icon;

              return (
                <CommandGroup key={type} heading={config.heading}>
                  {typeResults.map(result => (
                    <CommandItem
                      key={`${result.type}-${result.id}`}
                      onSelect={() => handleSelect(result.route)}
                      className="gap-2"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{result.label}</p>
                        {result.sublabel && (
                          <p className="text-xs text-muted-foreground truncate">{result.sublabel}</p>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
