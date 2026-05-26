import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Supplier } from '@/hooks/useSuppliers';
import { Building2, Tag, MapPin, Package, Factory } from 'lucide-react';

interface SupplierAnalyticsProps {
  suppliers: Supplier[];
  onFilterByCategory?: (category: string) => void;
  onFilterByBrand?: (brand: string) => void;
  onFilterByCity?: (city: string) => void;
  onFilterByProduct?: (product: string) => void;
  activeFilter?: { type: string; value: string } | null;
}

export function SupplierAnalytics({
  suppliers,
  onFilterByCategory,
  onFilterByBrand,
  onFilterByCity,
  onFilterByProduct,
  activeFilter,
}: SupplierAnalyticsProps) {
  const analytics = useMemo(() => {
    const categoryCount: Record<string, number> = {};
    const brandCount: Record<string, number> = {};
    const cityCount: Record<string, number> = {};
    const productCount: Record<string, number> = {};

    suppliers.forEach((supplier) => {
      // Category count
      const cat = supplier.product_category || 'Uncategorized';
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;

      // Brand count
      const brand = supplier.brand_name || 'No Brand';
      brandCount[brand] = (brandCount[brand] || 0) + 1;

      // City count
      const city = supplier.city || 'Unknown';
      cityCount[city] = (cityCount[city] || 0) + 1;

      // Product count (from products array) — normalize defensively
      let productsList: string[] = [];
      const rawProducts: any = supplier.products;
      if (Array.isArray(rawProducts)) {
        productsList = rawProducts;
      } else if (typeof rawProducts === 'string' && rawProducts.trim()) {
        try {
          const parsed = JSON.parse(rawProducts);
          productsList = Array.isArray(parsed)
            ? parsed
            : rawProducts.split(',').map((p) => p.trim()).filter(Boolean);
        } catch {
          productsList = rawProducts.split(',').map((p) => p.trim()).filter(Boolean);
        }
      }
      productsList.forEach((product) => {
        if (!product) return;
        productCount[product] = (productCount[product] || 0) + 1;
      });
    });

    const sortByCount = (obj: Record<string, number>) =>
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    return {
      categories: sortByCount(categoryCount),
      brands: sortByCount(brandCount),
      cities: sortByCount(cityCount),
      products: sortByCount(productCount),
      totalSuppliers: suppliers.length,
      activeSuppliers: suppliers.filter((s) => s.is_active).length,
      highPriority: suppliers.filter((s) => s.preference === 'high').length,
    };
  }, [suppliers]);

  const isActive = (type: string, value: string) =>
    activeFilter?.type === type && activeFilter?.value === value;

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{analytics.totalSuppliers}</p>
                <p className="text-xs text-muted-foreground">Total Suppliers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Building2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{analytics.activeSuppliers}</p>
                <p className="text-xs text-muted-foreground">Active Suppliers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Factory className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{analytics.brands.length}</p>
                <p className="text-xs text-muted-foreground">Unique Brands</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <MapPin className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{analytics.cities.length}</p>
                <p className="text-xs text-muted-foreground">Cities Covered</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribution Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Category Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Tag className="h-4 w-4" />
              By Category
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <ScrollArea className="h-[180px]">
              <div className="space-y-1">
                {analytics.categories.map(([category, count]) => (
                  <button
                    key={category}
                    onClick={() => onFilterByCategory?.(category)}
                    className={`w-full flex items-center justify-between p-2 rounded-md text-sm transition-colors hover:bg-muted ${
                      isActive('category', category) ? 'bg-primary/10 border border-primary' : ''
                    }`}
                  >
                    <span className="truncate text-left flex-1">{category}</span>
                    <Badge variant="secondary" className="ml-2 shrink-0">
                      {count}
                    </Badge>
                  </button>
                ))}
                {analytics.categories.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No data</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Brand Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Factory className="h-4 w-4" />
              By Brand
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <ScrollArea className="h-[180px]">
              <div className="space-y-1">
                {analytics.brands.map(([brand, count]) => (
                  <button
                    key={brand}
                    onClick={() => onFilterByBrand?.(brand)}
                    className={`w-full flex items-center justify-between p-2 rounded-md text-sm transition-colors hover:bg-muted ${
                      isActive('brand', brand) ? 'bg-primary/10 border border-primary' : ''
                    }`}
                  >
                    <span className="truncate text-left flex-1">{brand}</span>
                    <Badge variant="secondary" className="ml-2 shrink-0">
                      {count}
                    </Badge>
                  </button>
                ))}
                {analytics.brands.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No data</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* City Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              By City
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <ScrollArea className="h-[180px]">
              <div className="space-y-1">
                {analytics.cities.map(([city, count]) => (
                  <button
                    key={city}
                    onClick={() => onFilterByCity?.(city)}
                    className={`w-full flex items-center justify-between p-2 rounded-md text-sm transition-colors hover:bg-muted ${
                      isActive('city', city) ? 'bg-primary/10 border border-primary' : ''
                    }`}
                  >
                    <span className="truncate text-left flex-1">{city}</span>
                    <Badge variant="secondary" className="ml-2 shrink-0">
                      {count}
                    </Badge>
                  </button>
                ))}
                {analytics.cities.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No data</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Product Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4" />
              By Product
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <ScrollArea className="h-[180px]">
              <div className="space-y-1">
                {analytics.products.map(([product, count]) => (
                  <button
                    key={product}
                    onClick={() => onFilterByProduct?.(product)}
                    className={`w-full flex items-center justify-between p-2 rounded-md text-sm transition-colors hover:bg-muted ${
                      isActive('product', product) ? 'bg-primary/10 border border-primary' : ''
                    }`}
                  >
                    <span className="truncate text-left flex-1">{product}</span>
                    <Badge variant="secondary" className="ml-2 shrink-0">
                      {count}
                    </Badge>
                  </button>
                ))}
                {analytics.products.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No products listed</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
