import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface GoogleAdsLead {
  id: string;
  customer_name: string;
  customer_company: string;
  product_name: string;
  campaign_name: string | null;
  campaign_id: string | null;
  lead_temperature: string | null;
  status: string;
  created_at: string;
  order_outcome: string | null;
}

export function GoogleAdsLeadsTab() {
  const [leads, setLeads] = useState<GoogleAdsLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeads() {
      const { data } = await supabase
        .from("enquiries")
        .select("id, customer_name, customer_company, product_name, campaign_name, campaign_id, lead_temperature, status, created_at, order_outcome")
        .eq("lead_source", "google_ads")
        .order("created_at", { ascending: false })
        .limit(100);

      if (data) setLeads(data as GoogleAdsLead[]);
      setLoading(false);
    }
    fetchLeads();
  }, []);

  const tempColor: Record<string, string> = {
    hot: "text-destructive border-destructive/20 bg-destructive/5",
    warm: "text-amber-600 border-amber-200 bg-amber-50",
    cold: "text-blue-600 border-blue-200 bg-blue-50",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Google Ads Leads ({leads.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading leads...</p>
        ) : leads.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No Google Ads leads found.</p>
        ) : (
          <div className="border rounded-lg overflow-auto max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Temperature</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.customer_name}</TableCell>
                    <TableCell className="text-muted-foreground">{lead.customer_company}</TableCell>
                    <TableCell>{lead.product_name}</TableCell>
                    <TableCell className="text-xs">{lead.campaign_name || lead.campaign_id || "—"}</TableCell>
                    <TableCell>
                      {lead.lead_temperature && (
                        <Badge variant="outline" className={`text-xs ${tempColor[lead.lead_temperature] || ""}`}>
                          {lead.lead_temperature}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{lead.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {lead.order_outcome ? (
                        <Badge variant="outline" className={`text-xs ${lead.order_outcome === "won" ? "text-emerald-600 bg-emerald-50" : lead.order_outcome === "lost" ? "text-destructive bg-destructive/5" : ""}`}>
                          {lead.order_outcome}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(lead.created_at), "dd MMM yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
