import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ExternalLink, Phone, Mail, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";

interface WebsiteLead {
  id: number;
  created_at: string;
  form_type: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  message: string | null;
  page_url: string | null;
  status: string;
}

interface Props {
  /** Substring to match against page_url (e.g. "sell-your-used-drones" or "rent-a-drone") */
  urlPattern: string;
  title: string;
  description?: string;
}

/**
 * Displays website form enquiries from the `leads` table filtered by a page URL pattern.
 * Used by Buyback (sell-your-used-drones) and Rent (rent-a-drone) modules.
 */
export function WebsiteEnquiriesTable({ urlPattern, title, description }: Props) {
  const [rows, setRows] = useState<WebsiteLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("leads" as any)
      .select("id, created_at, form_type, name, email, phone, company, message, page_url, status")
      .ilike("page_url", `%${urlPattern}%`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      toast({ title: "Failed to load enquiries", description: error.message, variant: "destructive" });
    } else {
      setRows((data as any) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`leads-${urlPattern}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads" }, (payload: any) => {
        const url: string | null = payload?.new?.page_url ?? null;
        if (url && url.includes(urlPattern)) load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlPattern]);

  const term = search.trim().toLowerCase();
  const filtered = term
    ? rows.filter((r) =>
        [r.name, r.email, r.phone, r.company, r.message]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      )
    : rows;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{filtered.length} enquiries</Badge>
          <Input
            placeholder="Search name, phone, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64"
          />
          <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No enquiries yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {format(new Date(r.created_at), "dd MMM, HH:mm")}
                  </TableCell>
                  <TableCell className="font-medium">
                    {r.name || "—"}
                    {r.company && (
                      <div className="text-xs text-muted-foreground">{r.company}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-xs">
                      {r.phone && (
                        <a href={`tel:${r.phone}`} className="flex items-center gap-1 hover:text-primary">
                          <Phone className="h-3 w-3" /> {r.phone}
                        </a>
                      )}
                      {r.email && (
                        <a href={`mailto:${r.email}`} className="flex items-center gap-1 hover:text-primary">
                          <Mail className="h-3 w-3" /> {r.email}
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <span className="text-sm">{r.message || "—"}</span>
                  </TableCell>
                  <TableCell>
                    {r.form_type && <Badge variant="outline" className="text-xs">{r.form_type}</Badge>}
                  </TableCell>
                  <TableCell>
                    {r.page_url && (
                      <a
                        href={r.page_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
