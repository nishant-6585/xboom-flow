import { useState, useMemo, useEffect, useRef } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { usePricelist, PricelistItem } from '@/hooks/usePricelist';
import { usePopularProducts } from '@/hooks/usePopularProducts';

interface ProductSelectProps {
  value: string;
  onChange: (value: string, product?: PricelistItem) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ProductSelect({
  value,
  onChange,
  placeholder = "Select or type product...",
  disabled = false,
  className,
}: ProductSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const { items, loading } = usePricelist();
  const { rankMap, refetch } = usePopularProducts();

  // Refresh popular product data every time the dropdown opens
  useEffect(() => {
    if (open && refetch) {
      refetch();
    }
  }, [open, refetch]);

  // Keep focus in the search field when the list re-renders (mobile keyboards)
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    setSearchQuery('');
  }, [open]);

  const sortedItems = useMemo(() => {
    if (rankMap.size === 0) return items;
    const getRank = (name: string) => rankMap.get(name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    return [...items].sort((a, b) => {
      const ra = getRank(a.product_name);
      const rb = getRank(b.product_name);
      if (ra !== rb) return ra - rb;
      return a.product_name.localeCompare(b.product_name);
    });
  }, [items, rankMap]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery) return sortedItems.slice(0, 100); // Popular first when no search
    
    const query = searchQuery.toLowerCase();
    return sortedItems
      .filter(item => 
        item.product_name.toLowerCase().includes(query) ||
        (item.brand?.toLowerCase().includes(query) ?? false)
      )
      .slice(0, 100);
  }, [sortedItems, searchQuery]);

  const selectedProduct = items.find(p => p.product_name === value);

  const handleSelect = (productName: string) => {
    const product = items.find(p => p.product_name === productName);
    onChange(productName, product);
    setOpen(false);
    setSearchQuery('');
  };

  // Typing only updates local search state so the input never loses focus/caret
  // due to parent re-renders. The typed value is committed on close/blur.
  const handleInputChange = (newValue: string) => {
    setSearchQuery(newValue);
  };

  const commitTypedValue = () => {
    const typed = searchQuery.trim();
    if (!typed || typed === value) return;
    const matchedProduct = items.find(p => p.product_name.toLowerCase() === typed.toLowerCase());
    onChange(matchedProduct?.product_name ?? typed, matchedProduct);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) commitTypedValue();
    if (next) {
      setPortalContainer(triggerRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null);
    }
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
          disabled={disabled}
        >
          <span className="truncate">
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        portalContainer={portalContainer}
        className="w-[--radix-popover-trigger-width] min-w-[280px] max-w-[400px] max-h-[min(360px,50dvh)] overflow-hidden p-0 z-50"
        align="start"
        side="bottom"
        avoidCollisions={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <Command shouldFilter={false} className="max-h-[min(360px,50dvh)]">
          <div className="sticky top-0 z-10 flex shrink-0 items-center border-b bg-popover px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              ref={inputRef}
              type="search"
              inputMode="search"
              autoComplete="off"
              aria-label="Search products"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(event) => handleInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && searchQuery.trim()) {
                  event.preventDefault();
                  handleSelect(searchQuery.trim());
                }
              }}
              className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <CommandList className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Loading products...
              </div>
            ) : (
              <>
                <CommandEmpty>
                  <div className="py-4 text-center text-sm">
                    <p className="text-muted-foreground mb-2">No product found.</p>
                    {searchQuery && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSelect(searchQuery)}
                      >
                        Use "{searchQuery}" as custom product
                      </Button>
                    )}
                  </div>
                </CommandEmpty>
                <CommandGroup heading={searchQuery ? `Products (${filteredProducts.length}${items.length > 100 ? '+' : ''})` : `Popular Products (${filteredProducts.length}${items.length > 100 ? '+' : ''})`}>
                  {filteredProducts.map((product) => (
                    <CommandItem
                      key={product.id}
                      value={product.product_name}
                      onSelect={() => handleSelect(product.product_name)}
                      className="flex items-center justify-between"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Check
                            className={cn(
                              "h-4 w-4 shrink-0",
                              value === product.product_name ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="truncate font-medium">{product.product_name}</span>
                        </div>
                        <div className="ml-6 text-xs text-muted-foreground flex gap-2">
                          {product.brand && <span>{product.brand}</span>}
                          <span>•</span>
                          <span>{product.product_category}</span>
                        </div>
                      </div>
                      {product.website_price && (
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          ₹{product.website_price.toLocaleString()}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
