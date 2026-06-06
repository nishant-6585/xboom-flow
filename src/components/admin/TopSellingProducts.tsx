import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, TrendingUp, Loader2, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DateRangeFilter } from '@/components/DateRangeFilter';

interface TopProduct {
  product_name: string;
  brand: string | null;
  product_category: string | null;
  website_price: number | null;
  total_quantity: number;
  total_revenue: number;
}

interface TopSellingProductsProps {
  className?: string;
  startDate?: Date;
  endDate?: Date;
  onStartDateChange?: (date: Date | undefined) => void;
  onEndDateChange?: (date: Date | undefined) => void;
  onClear?: () => void;
}

export function TopSellingProducts({ className }: TopSellingProductsProps) {
  const [products, setProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTopProducts = async () => {
      try {
        setLoading(true);
        const since = new Date();
        since.setDate(since.getDate() - 180);

        // Fetch order_items aggregated by product_name
        const { data: orderData, error: orderError } = await supabase
          .from('order_items')
          .select('product_name, quantity, unit_price')
          .gte('created_at', since.toISOString())
          .not('product_name', 'is', null);

        if (orderError) throw orderError;

        // Aggregate by product name
        const productMap = new Map<string, { total_quantity: number; total_revenue: number }>();
        for (const row of (orderData ?? []) as Array<{ product_name: string | null; quantity: number | null; unit_price: number | null }>) {
          if (!row.product_name) continue;
          const existing = productMap.get(row.product_name) || { total_quantity: 0, total_revenue: 0 };
          const qty = Number(row.quantity) || 1;
          const price = Number(row.unit_price) || 0;
          productMap.set(row.product_name, {
            total_quantity: existing.total_quantity + qty,
            total_revenue: existing.total_revenue + qty * price,
          });
        }

        // Get pricelist details for these products
        const productNames = Array.from(productMap.keys());
        if (productNames.length === 0) {
          setProducts([]);
          setLoading(false);
          return;
        }

        const { data: priceData, error: priceError } = await supabase
          .from('pricelist')
          .select('product_name, brand, product_category, website_price')
          .in('product_name', productNames);

        if (priceError) throw priceError;

        const priceMap = new Map(
          (priceData ?? []).map((p: any) => [p.product_name, p])
        );

        const ranked: TopProduct[] = Array.from(productMap.entries())
          .map(([name, stats]) => {
            const priceInfo = priceMap.get(name);
            return {
              product_name: name,
              brand: priceInfo?.brand ?? null,
              product_category: priceInfo?.product_category ?? null,
              website_price: priceInfo?.website_price ?? null,
              total_quantity: stats.total_quantity,
              total_revenue: stats.total_revenue,
            };
          })
          .sort((a, b) => b.total_quantity - a.total_quantity)
          .slice(0, 6);

        setProducts(ranked);
      } catch (e) {
        console.error('TopSellingProducts fetch error:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchTopProducts();
  }, []);

  if (loading) {
    return (
      <Card className={cn("glass", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-5 h-5 text-primary" />
            Top Selling Products
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (products.length === 0) {
    return (
      <Card className={cn("glass", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-5 h-5 text-primary" />
            Top Selling Products
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-sm text-muted-foreground">
            No sales data available for the last 180 days.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("glass", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="w-5 h-5 text-primary" />
          Top Selling Products
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {products.map((product, index) => (
          <div
            key={product.product_name}
            className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
          >
            {/* Rank badge */}
            <div className={cn(
              "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0",
              index === 0 ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400" :
              index === 1 ? "bg-gray-300/30 text-gray-600 dark:text-gray-300" :
              index === 2 ? "bg-orange-500/20 text-orange-600 dark:text-orange-400" :
              "bg-muted text-muted-foreground"
            )}>
              {index + 1}
            </div>

            {/* Product image placeholder */}
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-primary/70" />
            </div>

            {/* Product info */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{product.product_name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {product.brand && <span>{product.brand}</span>}
                {product.brand && product.product_category && <span>•</span>}
                {product.product_category && <span>{product.product_category}</span>}
              </div>
            </div>

            {/* Stats */}
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold">{product.total_quantity.toLocaleString()} sold</p>
              <p className="text-xs text-muted-foreground">
                ₹{(product.total_revenue / 100000).toFixed(1)}L revenue
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
