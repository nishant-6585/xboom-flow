import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Package, ShoppingCart, FileText, Users, Building2,
  Search, Box, ClipboardList, IndianRupee, Wrench,
  BarChart3, Briefcase, ListTodo, Ticket
} from 'lucide-react';

interface SearchResult {
  id: string;
  label: string;
  sublabel: string;
  type: 'order' | 'enquiry' | 'invoice' | 'supplier' | 'inventory' | 'pipeline' | 'customer';
  route: string;
}

const NAV_ITEMS = [
  { label: 'Dashboard', route: '/', icon: BarChart3 },
  { label: 'Sales Arena', route: '/sales', icon: Briefcase },
  { label: 'Orders', route: '/orders', icon: ShoppingCart },
  { label: 'Procurement', route: '/procurement', icon: Box },
  { label: 'Inventory', route: '/inventory', icon: Package },
  { label: 'Pricelist', route: '/pricelist', icon: ClipboardList },
  { label: 'Finance', route: '/finance', icon: IndianRupee },
  { label: 'Billing', route: '/billing', icon: FileText },
  { label: 'Suppliers', route: '/suppliers', icon: Building2 },
  { label: 'Tasks', route: '/tasks', icon: ListTodo },
  { label: 'Tickets', route: '/tickets', icon: Ticket },
  { label: 'Repairs', route: '/repairs', icon: Wrench },
  { label: 'HR', route: '/hr', icon: Users },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
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
        // Search orders
        const { data: orders } = await supabase
          .from('orders')
          .select('id, order_number, customer_name, customer_company, product_name')
          .or(`order_number.ilike.${searchTerm},customer_name.ilike.${searchTerm},customer_company.ilike.${searchTerm},product_name.ilike.${searchTerm}`)
          .limit(5);

        orders?.forEach(o => {
          searchResults.push({
            id: o.id,
            label: `${o.order_number || 'Order'} - ${o.customer_name}`,
            sublabel: o.product_name,
            type: 'order',
            route: `/orders?orderId=${o.id}`,
          });
        });

        // Search enquiries
        const { data: enquiries } = await supabase
          .from('enquiries')
          .select('id, customer_name, customer_company, product_name')
          .or(`customer_name.ilike.${searchTerm},customer_company.ilike.${searchTerm},product_name.ilike.${searchTerm}`)
          .limit(5);

        enquiries?.forEach(e => {
          searchResults.push({
            id: e.id,
            label: `${e.customer_name} - ${e.customer_company}`,
            sublabel: e.product_name,
            type: 'enquiry',
            route: `/sales?tab=enquiries&leadId=${e.id}`,
          });
        });

        // Search invoices
        const { data: invoices } = await supabase
          .from('invoices')
          .select('id, invoice_number, customer_name, customer_company')
          .or(`invoice_number.ilike.${searchTerm},customer_name.ilike.${searchTerm},customer_company.ilike.${searchTerm}`)
          .limit(5);

        invoices?.forEach(i => {
          searchResults.push({
            id: i.id,
            label: `${i.invoice_number} - ${i.customer_name}`,
            sublabel: i.customer_company || '',
            type: 'invoice',
            route: `/billing?invoiceId=${i.id}`,
          });
        });

        // Search suppliers
        const { data: suppliers } = await supabase
          .from('suppliers')
          .select('id, name, product_category')
          .or(`name.ilike.${searchTerm},product_category.ilike.${searchTerm}`)
          .limit(5);

        suppliers?.forEach(s => {
          searchResults.push({
            id: s.id,
            label: s.name,
            sublabel: s.product_category || 'Supplier',
            type: 'supplier',
            route: `/suppliers?supplierId=${s.id}`,
          });
        });

        // Search inventory
        const { data: inventory } = await supabase
          .from('inventory')
          .select('id, product_name, product_category, current_stock')
          .or(`product_name.ilike.${searchTerm},product_category.ilike.${searchTerm}`)
          .limit(5);

        inventory?.forEach(inv => {
          searchResults.push({
            id: inv.id,
            label: inv.product_name,
            sublabel: `${inv.product_category} • Stock: ${inv.current_stock}`,
            type: 'inventory',
            route: `/inventory`,
          });
        });

        setResults(searchResults);
      } catch (err) {
        console.error('Command palette search error:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, user]);

  const handleSelect = (route: string) => {
    setOpen(false);
    setQuery('');
    navigate(route);
  };

  const getIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'order': return ShoppingCart;
      case 'enquiry': return ClipboardList;
      case 'invoice': return FileText;
      case 'supplier': return Building2;
      case 'inventory': return Package;
      case 'pipeline': return BarChart3;
      default: return Search;
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search orders, customers, invoices, inventory..."
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
            {['order', 'enquiry', 'invoice', 'supplier', 'inventory'].map(type => {
              const typeResults = results.filter(r => r.type === type);
              if (typeResults.length === 0) return null;
              
              const headings: Record<string, string> = {
                order: 'Orders',
                enquiry: 'Enquiries',
                invoice: 'Invoices',
                supplier: 'Suppliers',
                inventory: 'Inventory',
              };

              return (
                <CommandGroup key={type} heading={headings[type]}>
                  {typeResults.map(result => {
                    const Icon = getIcon(result.type);
                    return (
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
                    );
                  })}
                </CommandGroup>
              );
            })}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
