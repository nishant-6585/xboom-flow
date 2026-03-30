import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ArrowRight, CheckCircle2 } from "lucide-react";

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
  is_converted: boolean;
  conversion_value: number;
}

export function GoogleAdsLeadsTab() {
  const [leads, setLeads] = useState<GoogleAdsLead[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchLeads() {
      const { data } = await supabase
        .from("enquiries")
        .select("id, customer_name, customer_company, product_name, campaign_name, campaign_id, lead_temperature, status, created_at, order_outcome, is_converted, conversion_value")
        .eq("lead_source", "google_ads")
        .order("created_at", { ascending: false })
        .limit(200);

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

  const handleConvertToOrder = (lead: GoogleAdsLead) => {
    navigate(`/orders?tab=new&preSelectEnquiry=${lead.id}`);
  };

  const convertedCount = leads.filter(l => l.is_converted).length;
  const unconvertedCount = leads.length - convertedCount;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Google Ads Leads ({leads.length})</CardTitle>
          <div className="flex gap-2 text-xs">
            <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200">
              <CheckCircle2 className="w-3 h-3 mr-1" /> {convertedCount} Converted
            </Badge>
            <Badge variant="outline" className="text-muted-foreground">
              {unconvertedCount} Pending
            </Badge>
          </div>
        </div>
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
                  <TableHead>Conversion</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id} className={lead.is_converted ? "bg-emerald-500/5" : ""}>
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
                      {lead.is_converted ? (
                        <Badge variant="outline" className="text-xs text-emerald-600 bg-emerald-50 border-emerald-200">
                          ✓ Converted
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Not Converted
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {lead.conversion_value > 0 ? `₹${lead.conversion_value.toLocaleString("en-IN")}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(lead.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-center">
                      {!lead.is_converted ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1 h-7"
                          onClick={() => handleConvertToOrder(lead)}
                        >
                          Convert to Order
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      ) : (
                        <span className="text-xs text-emerald-600">✓ Done</span>
                      )}
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
