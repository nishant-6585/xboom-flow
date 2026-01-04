import { ProductQuery, QueryStatus } from "@/types/query";
import { QueryCard } from "./QueryCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, Inbox } from "lucide-react";
import { useState } from "react";

interface QueryListProps {
  queries: ProductQuery[];
  onQueryClick?: (query: ProductQuery) => void;
}

export function QueryList({ queries, onQueryClick }: QueryListProps) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | QueryStatus>("all");

  const filteredQueries = queries.filter((query) => {
    const matchesSearch =
      query.productName.toLowerCase().includes(search.toLowerCase()) ||
      query.productCode.toLowerCase().includes(search.toLowerCase()) ||
      query.customerName.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = activeTab === "all" || query.status === activeTab;

    return matchesSearch && matchesStatus;
  });

  const getStatusCount = (status: QueryStatus | "all") => {
    if (status === "all") return queries.length;
    return queries.filter((q) => q.status === status).length;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by product, code, or customer..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="all" className="text-xs">
            All ({getStatusCount("all")})
          </TabsTrigger>
          <TabsTrigger value="pending" className="text-xs">
            Pending ({getStatusCount("pending")})
          </TabsTrigger>
          <TabsTrigger value="in_review" className="text-xs">
            Review ({getStatusCount("in_review")})
          </TabsTrigger>
          <TabsTrigger value="confirmed" className="text-xs">
            Confirmed ({getStatusCount("confirmed")})
          </TabsTrigger>
          <TabsTrigger value="rejected" className="text-xs">
            Rejected ({getStatusCount("rejected")})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {filteredQueries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Inbox className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No queries found</p>
              <p className="text-sm">Submit a new enquiry to get started</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredQueries.map((query) => (
                <QueryCard
                  key={query.id}
                  query={query}
                  onClick={() => onQueryClick?.(query)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
