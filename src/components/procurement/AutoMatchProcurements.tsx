import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useOrders, Order } from '@/hooks/useOrders';
import { useInventoryProcurements, InventoryProcurement } from '@/hooks/useInventoryProcurements';
import { useOrderProcurementLinks } from '@/hooks/useOrderProcurementLinks';
import { format, parseISO, isWithinInterval, subDays, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  Loader2, Wand2, CalendarIcon, Check, X, Link2, 
  ArrowRight, Package, FileText, AlertCircle, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

interface AutoMatchProcurementsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMatchesCreated?: () => void;
}

interface MatchSuggestion {
  order: Order;
  procurement: InventoryProcurement;
  score: number;
  reasons: string[];
}

// Calculate similarity between two strings (simple Jaccard-like coefficient)
function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  
  // Split into words
  const words1 = new Set(s1.split(/\s+/));
  const words2 = new Set(s2.split(/\s+/));
  
  // Calculate intersection
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

export function AutoMatchProcurements({
  open,
  onOpenChange,
  onMatchesCreated,
}: AutoMatchProcurementsProps) {
  const { orders, loading: ordersLoading } = useOrders();
  const { procurements, loading: procurementsLoading } = useInventoryProcurements();
  const { links, createLink } = useOrderProcurementLinks();
  
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: addDays(new Date(), 7),
  });
  const [minSimilarity, setMinSimilarity] = useState(0.5);
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Get existing linked pairs to exclude
  const existingLinks = useMemo(() => {
    const linkSet = new Set<string>();
    links.forEach(link => {
      linkSet.add(`${link.order_id}-${link.inventory_procurement_id}`);
    });
    return linkSet;
  }, [links]);

  // Generate match suggestions
  const suggestions = useMemo(() => {
    if (!showResults) return [];
    
    const matches: MatchSuggestion[] = [];
    
    // Filter orders within date range
    const filteredOrders = orders.filter(order => {
      const orderDate = parseISO(order.created_at);
      return isWithinInterval(orderDate, { start: dateRange.from, end: dateRange.to });
    });

    // Filter procurements within date range
    const filteredProcurements = procurements.filter(proc => {
      const procDate = parseISO(proc.procurement_date);
      return isWithinInterval(procDate, { start: dateRange.from, end: dateRange.to });
    });

    // Find matches
    filteredOrders.forEach(order => {
      filteredProcurements.forEach(procurement => {
        // Skip if already linked
        const linkKey = `${order.id}-${procurement.id}`;
        if (existingLinks.has(linkKey)) return;

        const reasons: string[] = [];
        let score = 0;

        // Product name similarity
        const nameSimilarity = calculateStringSimilarity(
          order.product_name, 
          procurement.product_name
        );
        if (nameSimilarity >= minSimilarity) {
          score += nameSimilarity * 50;
          reasons.push(`Product match: ${Math.round(nameSimilarity * 100)}%`);
        }

        // Category match
        if (order.product_category === procurement.product_category) {
          score += 20;
          reasons.push('Same category');
        }

        // Supplier match
        if (order.supplier_name && procurement.supplier_name &&
            order.supplier_name.toLowerCase() === procurement.supplier_name.toLowerCase()) {
          score += 15;
          reasons.push('Same supplier');
        }

        // Date proximity
        const orderDate = parseISO(order.created_at);
        const procDate = parseISO(procurement.procurement_date);
        const daysDiff = Math.abs((orderDate.getTime() - procDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff <= 7) {
          score += 15 - (daysDiff * 2);
          reasons.push(`Within ${Math.round(daysDiff)} days`);
        }

        // Only include if score is above threshold
        if (score >= 30 && nameSimilarity >= minSimilarity) {
          matches.push({
            order,
            procurement,
            score: Math.min(score, 100),
            reasons,
          });
        }
      });
    });

    // Sort by score descending
    return matches.sort((a, b) => b.score - a.score);
  }, [orders, procurements, dateRange, minSimilarity, existingLinks, showResults]);

  const handleToggleMatch = (matchKey: string) => {
    setSelectedMatches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(matchKey)) {
        newSet.delete(matchKey);
      } else {
        newSet.add(matchKey);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedMatches.size === suggestions.length) {
      setSelectedMatches(new Set());
    } else {
      setSelectedMatches(new Set(suggestions.map(s => `${s.order.id}-${s.procurement.id}`)));
    }
  };

  const handleFindMatches = () => {
    setShowResults(true);
    setSelectedMatches(new Set());
  };

  const handleCreateLinks = async () => {
    if (selectedMatches.size === 0) {
      toast.error('Please select at least one match to link');
      return;
    }

    setProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const matchKey of selectedMatches) {
      const [orderId, procurementId] = matchKey.split('-');
      const match = suggestions.find(s => s.order.id === orderId && s.procurement.id === procurementId);
      
      if (match) {
        const success = await createLink(
          match.order.id,
          match.procurement.id,
          match.order.quantity,
          undefined,
          `Auto-matched: ${match.reasons.join(', ')}`
        );
        
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
      }
    }

    setProcessing(false);
    
    if (successCount > 0) {
      toast.success(`Successfully linked ${successCount} orders to procurements`);
      setSelectedMatches(new Set());
      setShowResults(false);
      onOpenChange(false);
      onMatchesCreated?.();
    }
    
    if (failCount > 0) {
      toast.error(`Failed to create ${failCount} links`);
    }
  };

  const loading = ordersLoading || procurementsLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Auto-Match Orders to Procurements
          </DialogTitle>
          <DialogDescription>
            Automatically find and link orders to inventory procurements based on product name similarity and date range.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
            {/* Date Range From */}
            <div className="space-y-2">
              <Label className="text-sm">From Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateRange.from, 'dd MMM yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateRange.from}
                    onSelect={(date) => date && setDateRange(prev => ({ ...prev, from: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Date Range To */}
            <div className="space-y-2">
              <Label className="text-sm">To Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateRange.to, 'dd MMM yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateRange.to}
                    onSelect={(date) => date && setDateRange(prev => ({ ...prev, to: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Similarity Threshold */}
            <div className="space-y-2">
              <Label className="text-sm">Min Similarity ({Math.round(minSimilarity * 100)}%)</Label>
              <Input
                type="range"
                min={0.3}
                max={1}
                step={0.1}
                value={minSimilarity}
                onChange={(e) => setMinSimilarity(parseFloat(e.target.value))}
                className="h-9"
              />
            </div>
          </div>

          {/* Find Matches Button */}
          {!showResults && (
            <div className="flex justify-center py-8">
              <Button onClick={handleFindMatches} disabled={loading} size="lg">
                {loading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-5 w-5" />
                )}
                Find Matching Pairs
              </Button>
            </div>
          )}

          {/* Results */}
          {showResults && (
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Results Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{suggestions.length} matches found</Badge>
                  {suggestions.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                      {selectedMatches.size === suggestions.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowResults(false)}>
                    <X className="h-4 w-4 mr-1" />
                    Reset
                  </Button>
                </div>
              </div>

              {/* Match List */}
              <ScrollArea className="flex-1 border rounded-lg">
                {suggestions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="font-medium text-lg">No Matches Found</h3>
                    <p className="text-muted-foreground text-sm mt-1 max-w-md">
                      Try adjusting the date range or lowering the similarity threshold to find more matches.
                    </p>
                  </div>
                ) : (
                  <div className="p-2 space-y-2">
                    {suggestions.map((match) => {
                      const matchKey = `${match.order.id}-${match.procurement.id}`;
                      const isSelected = selectedMatches.has(matchKey);
                      
                      return (
                        <Card 
                          key={matchKey}
                          className={cn(
                            "cursor-pointer transition-colors",
                            isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                          )}
                          onClick={() => handleToggleMatch(matchKey)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start gap-3">
                              {/* Checkbox */}
                              <div className="pt-1">
                                <Checkbox checked={isSelected} />
                              </div>

                              {/* Order Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <FileText className="h-4 w-4 text-muted-foreground" />
                                  <Badge variant="outline" className="font-mono text-xs">
                                    {match.order.order_number || 'No Order #'}
                                  </Badge>
                                  <span className="font-medium truncate">{match.order.product_name}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {match.order.customer_company} • Qty: {match.order.quantity} • 
                                  {format(parseISO(match.order.created_at), ' dd MMM yyyy')}
                                </p>
                              </div>

                              {/* Arrow */}
                              <div className="flex items-center px-2">
                                <ArrowRight className="h-5 w-5 text-muted-foreground" />
                              </div>

                              {/* Procurement Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Package className="h-4 w-4 text-muted-foreground" />
                                  <Badge variant="secondary" className="font-mono text-xs">
                                    {match.procurement.procurement_number || 'No Proc #'}
                                  </Badge>
                                  <span className="font-medium truncate">{match.procurement.product_name}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {match.procurement.supplier_name || 'No supplier'} • Qty: {match.procurement.quantity} • 
                                  {format(parseISO(match.procurement.procurement_date), ' dd MMM yyyy')}
                                </p>
                              </div>

                              {/* Score & Reasons */}
                              <div className="text-right">
                                <Badge 
                                  className={cn(
                                    "mb-1",
                                    match.score >= 70 ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                                    match.score >= 50 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" :
                                    "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
                                  )}
                                >
                                  {Math.round(match.score)}% match
                                </Badge>
                                <div className="flex flex-wrap gap-1 justify-end">
                                  {match.reasons.slice(0, 2).map((reason, i) => (
                                    <span key={i} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                      {reason}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {/* Actions */}
          {showResults && suggestions.length > 0 && (
            <div className="flex justify-between items-center pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                {selectedMatches.size} of {suggestions.length} selected
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateLinks} 
                  disabled={processing || selectedMatches.size === 0}
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    <>
                      <Link2 className="mr-2 h-4 w-4" />
                      Link Selected ({selectedMatches.size})
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
