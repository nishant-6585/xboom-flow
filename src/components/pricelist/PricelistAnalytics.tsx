import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PricelistItem } from "@/hooks/usePricelist";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Package, DollarSign, AlertCircle, CheckCircle, Scale } from "lucide-react";

export type PriceFilterType = "all" | "with_price" | "missing_price" | "website" | "dealer" | "cost" | "missing_weight";

interface PricelistAnalyticsProps {
  items: PricelistItem[];
  onFilterClick?: (filter: PriceFilterType, category?: string) => void;
  canManage?: boolean;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7300",
  "#00C49F",
];

export function PricelistAnalytics({ items, onFilterClick, canManage }: PricelistAnalyticsProps) {
  const stats = useMemo(() => {
    const total = items.length;
    const withWebsitePrice = items.filter((i) => i.website_price && i.website_price > 0).length;
    const withDealerPrice = items.filter((i) => i.dealer_price && i.dealer_price > 0).length;
    const withCostPrice = items.filter((i) => i.cost_price && i.cost_price > 0).length;
    const withAnyPrice = items.filter(
      (i) => (i.website_price && i.website_price > 0) || (i.dealer_price && i.dealer_price > 0)
    ).length;
    const missingAllPrices = total - withAnyPrice;

    return {
      total,
      withWebsitePrice,
      withDealerPrice,
      withCostPrice,
      withAnyPrice,
      missingAllPrices,
      websitePricePercent: total > 0 ? ((withWebsitePrice / total) * 100).toFixed(1) : "0",
      dealerPricePercent: total > 0 ? ((withDealerPrice / total) * 100).toFixed(1) : "0",
      costPricePercent: total > 0 ? ((withCostPrice / total) * 100).toFixed(1) : "0",
    };
  }, [items]);

  const pricingData = useMemo(() => {
    return [
      { name: "With Price", value: stats.withAnyPrice, fill: "hsl(142.1, 76.2%, 36.3%)", filter: "with_price" as PriceFilterType },
      { name: "Missing Price", value: stats.missingAllPrices, fill: "hsl(0, 84.2%, 60.2%)", filter: "missing_price" as PriceFilterType },
    ];
  }, [stats]);

  const categoryData = useMemo(() => {
    const categoryMap: Record<string, { total: number; withPrice: number; missingPrice: number }> = {};
    
    items.forEach((item) => {
      const cat = item.product_category || "Uncategorized";
      if (!categoryMap[cat]) {
        categoryMap[cat] = { total: 0, withPrice: 0, missingPrice: 0 };
      }
      categoryMap[cat].total++;
      if ((item.website_price && item.website_price > 0) || (item.dealer_price && item.dealer_price > 0)) {
        categoryMap[cat].withPrice++;
      } else {
        categoryMap[cat].missingPrice++;
      }
    });

    return Object.entries(categoryMap)
      .map(([name, data]) => ({
        name: name.length > 15 ? name.substring(0, 15) + "..." : name,
        fullName: name,
        total: data.total,
        withPrice: data.withPrice,
        missingPrice: data.missingPrice,
      }))
      .sort((a, b) => b.total - a.total);
  }, [items]);

  const priceBreakdownData = useMemo(() => {
    return [
      { name: "Website Price", count: stats.withWebsitePrice, percent: parseFloat(stats.websitePricePercent), filter: "website" as PriceFilterType },
      { name: "Dealer Price", count: stats.withDealerPrice, percent: parseFloat(stats.dealerPricePercent), filter: "dealer" as PriceFilterType },
      { name: "Cost Price", count: stats.withCostPrice, percent: parseFloat(stats.costPricePercent), filter: "cost" as PriceFilterType },
    ];
  }, [stats]);

  const handleCardClick = (filter: PriceFilterType) => {
    onFilterClick?.(filter);
  };

  const handlePieClick = (data: any) => {
    if (data && data.filter) {
      onFilterClick?.(data.filter);
    }
  };

  const handleBarClick = (data: any) => {
    if (data && data.filter) {
      onFilterClick?.(data.filter);
    }
  };

  const handleCategoryClick = (data: any) => {
    if (data && data.fullName) {
      onFilterClick?.("all", data.fullName);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card 
          className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
          onClick={() => handleCardClick("all")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Products in pricelist</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer transition-all hover:shadow-md hover:border-green-500/50"
          onClick={() => handleCardClick("with_price")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products with Price</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.withAnyPrice}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0 ? ((stats.withAnyPrice / stats.total) * 100).toFixed(1) : 0}% coverage
            </p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer transition-all hover:shadow-md hover:border-red-500/50"
          onClick={() => handleCardClick("missing_price")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Missing Price</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.missingAllPrices}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0 ? ((stats.missingAllPrices / stats.total) * 100).toFixed(1) : 0}% missing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categoryData.length}</div>
            <p className="text-xs text-muted-foreground">Product categories</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Pricing Coverage Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Pricing Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pricingData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    onClick={handlePieClick}
                    style={{ cursor: "pointer" }}
                  >
                    {pricingData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Price Type Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Price Type Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priceBreakdownData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={100} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `${value} products (${priceBreakdownData.find((d) => d.count === value)?.percent || 0}%)`,
                      name,
                    ]}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="hsl(var(--primary))" 
                    radius={[0, 4, 4, 0]}
                    onClick={handleBarClick}
                    style={{ cursor: "pointer" }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Products by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} fontSize={12} />
                <YAxis />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg p-3 shadow-lg">
                          <p className="font-medium">{data.fullName}</p>
                          <p className="text-sm text-green-600">With Price: {data.withPrice}</p>
                          <p className="text-sm text-red-600">Missing Price: {data.missingPrice}</p>
                          <p className="text-sm text-muted-foreground">Total: {data.total}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Bar 
                  dataKey="withPrice" 
                  stackId="a" 
                  fill="hsl(142.1, 76.2%, 36.3%)" 
                  name="With Price"
                  onClick={handleCategoryClick}
                  style={{ cursor: "pointer" }}
                />
                <Bar 
                  dataKey="missingPrice" 
                  stackId="a" 
                  fill="hsl(0, 84.2%, 60.2%)" 
                  name="Missing Price"
                  onClick={handleCategoryClick}
                  style={{ cursor: "pointer" }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Category Table */}
      <Card>
        <CardHeader>
          <CardTitle>Category Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium">Category</th>
                  <th className="p-3 text-right font-medium">Total Products</th>
                  <th className="p-3 text-right font-medium">With Price</th>
                  <th className="p-3 text-right font-medium">Missing Price</th>
                  <th className="p-3 text-right font-medium">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {categoryData.map((cat, index) => (
                  <tr 
                    key={index} 
                    className="border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => onFilterClick?.("all", cat.fullName)}
                  >
                    <td className="p-3">{cat.fullName}</td>
                    <td className="p-3 text-right font-medium">{cat.total}</td>
                    <td className="p-3 text-right text-green-600">{cat.withPrice}</td>
                    <td className="p-3 text-right text-red-600">{cat.missingPrice}</td>
                    <td className="p-3 text-right">
                      <span
                        className={`font-medium ${
                          cat.total > 0 && (cat.withPrice / cat.total) * 100 >= 80
                            ? "text-green-600"
                            : cat.total > 0 && (cat.withPrice / cat.total) * 100 >= 50
                            ? "text-yellow-600"
                            : "text-red-600"
                        }`}
                      >
                        {cat.total > 0 ? ((cat.withPrice / cat.total) * 100).toFixed(1) : 0}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
