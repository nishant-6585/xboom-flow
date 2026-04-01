import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInHours } from "date-fns";
import { ArrowRight, CheckCircle2, Flame, Phone, MessageSquare, MapPin, Briefcase, Mail, User, Zap, AlertTriangle, TrendingUp, ChevronRight } from "lucide-react";
import { Json } from "@/integrations/supabase/types";
import { ProspectButton, ACategoryButton } from "../ProspectButton";
import { AttentionButton } from "../AttentionButton";
import { EnquiryConvertButton } from "../EnquiryConvertButton";
import { useProspects } from "@/hooks/useProspects";
import { useAttentionItems } from "@/hooks/useAttentionItems";

interface GoogleAdsLead {
  id: string;
  customer_name: string;
  customer_company: string;
  product_name: string;
  product_code: string;
  campaign_name: string | null;
  campaign_id: string | null;
  ad_group_id: string | null;
  lead_temperature: string | null;
  status: string;
  created_at: string;
  order_outcome: string | null;
  is_converted: boolean;
  conversion_value: number;
  notes: string | null;
  customer_state: string | null;
  raw_google_payload: Json | null;
  sales_person_name: string;
  product_category: string;
  quantity: number;
  urgency: string;
  requested_timeline: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
}

// Parse structured data from notes field
function parseNotesField(notes: string | null): Record<string, string> {
  if (!notes) return {};
  const parsed: Record<string, string> = {};
  notes.split("\n").forEach((line) => {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).trim();
      const val = line.substring(colonIdx + 1).trim();
      if (val && val !== "N/A") parsed[key] = val;
    }
  });
  return parsed;
}

// Extract submission fields from raw payload — handles "unknown" column names via heuristics
function extractSubmissionFields(payload: Json | null): Record<string, string> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const p = payload as Record<string, unknown>;
  const fields: Record<string, string> = {};

  const subData = p.submission_data as Array<{ column_name?: string; string_value?: string }> | undefined;
  if (!Array.isArray(subData)) return fields;

  const allUnknown = subData.every((f) => !f.column_name || f.column_name.toLowerCase() === "unknown");

  if (allUnknown) {
    // Heuristic: classify by value pattern
    let nameSet = false, emailSet = false, phoneSet = false, citySet = false;
    for (const f of subData) {
      const val = f.string_value?.trim();
      if (!val) continue;
      if (!emailSet && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        fields["EMAIL"] = val;
        emailSet = true;
      } else if (!phoneSet && /^[\+]?\d[\d\s\-\(\)]{6,}$/.test(val.replace(/\s/g, ""))) {
        fields["PHONE_NUMBER"] = val;
        phoneSet = true;
      } else if (!nameSet) {
        fields["FULL_NAME"] = val;
        nameSet = true;
      } else if (!citySet) {
        fields["CITY"] = val;
        citySet = true;
      }
    }
  } else {
    subData.forEach((f) => {
      if (f.column_name && f.string_value) {
        fields[f.column_name.toUpperCase()] = f.string_value;
      }
    });
  }
  return fields;
}

// Determine lead priority
function getLeadPriority(lead: GoogleAdsLead, fields: Record<string, string>): { label: string; icon: React.ReactNode; className: string } {
  const budget = fields["BUDGET"] || fields["BUDGET_RANGE"] || "";
  const timeline = fields["TIMELINE"] || fields["WHEN_DO_YOU_NEED"] || fields["URGENCY"] || "";
  const requirement = fields["REQUIREMENT"] || fields["WHAT_ARE_YOU_LOOKING_FOR"] || "";

  const isHighBudget = /lakh|lac|5.*lakh|above|premium|bulk/i.test(budget) || /bulk|fleet|multiple/i.test(requirement);
  const isUrgent = /immediate|asap|urgent|this week|today|within/i.test(timeline);

  if (isHighBudget && isUrgent) return { label: "High Value + Hot", icon: <TrendingUp className="w-3 h-3" />, className: "text-destructive bg-destructive/10 border-destructive/20" };
  if (isHighBudget) return { label: "High Value", icon: <TrendingUp className="w-3 h-3" />, className: "text-destructive bg-destructive/10 border-destructive/20" };
  if (isUrgent) return { label: "Hot", icon: <Zap className="w-3 h-3" />, className: "text-amber-700 bg-amber-500/10 border-amber-500/20" };

  // Default: check age
  const hours = differenceInHours(new Date(), new Date(lead.created_at));
  if (hours > 48) return { label: "Cold", icon: <AlertTriangle className="w-3 h-3" />, className: "text-blue-600 bg-blue-500/10 border-blue-500/20" };

  return { label: "Warm", icon: <Flame className="w-3 h-3" />, className: "text-amber-600 bg-amber-500/10 border-amber-500/20" };
}

export function GoogleAdsLeadsTab() {
  const [leads, setLeads] = useState<GoogleAdsLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<GoogleAdsLead | null>(null);
  const navigate = useNavigate();
  const { prospects } = useProspects();
  const { items: attentionItems } = useAttentionItems();

  const isProspect = (leadId: string) => prospects.some(p => p.source_id === leadId && p.source_type === 'google_ads');
  const isAttention = (leadId: string) => attentionItems.some(a => a.source_id === leadId && a.source_type === 'google_ads');

  useEffect(() => {
    async function fetchLeads() {
      const { data } = await supabase
        .from("google_ads_leads")
        .select("id, customer_name, customer_company, product_name, product_code, campaign_name, campaign_id, ad_group_id, lead_temperature, status, created_at, order_outcome, is_converted, conversion_value, notes, customer_state, raw_google_payload, sales_person_name, product_category, quantity, urgency, requested_timeline, email, phone, city")
        .order("created_at", { ascending: false })
        .limit(200);

      if (data) setLeads(data as GoogleAdsLead[]);
      setLoading(false);
    }
    fetchLeads();
  }, []);

  // Sort: high-intent + recent first
  const sortedLeads = useMemo(() => {
    return [...leads].sort((a, b) => {
      // Unconverted first
      if (a.is_converted !== b.is_converted) return a.is_converted ? 1 : -1;
      // Then by temperature: hot > warm > cold
      const tempOrder: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
      const aTemp = tempOrder[a.lead_temperature || "warm"] ?? 1;
      const bTemp = tempOrder[b.lead_temperature || "warm"] ?? 1;
      if (aTemp !== bTemp) return aTemp - bTemp;
      // Then recent first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [leads]);

  const convertedCount = leads.filter((l) => l.is_converted).length;
  const unconvertedCount = leads.length - convertedCount;
  const agingCount = leads.filter((l) => !l.is_converted && differenceInHours(new Date(), new Date(l.created_at)) > 24).length;

  const isAging = (lead: GoogleAdsLead) => !lead.is_converted && differenceInHours(new Date(), new Date(lead.created_at)) > 24;

  const handleConvertToOrder = (lead: GoogleAdsLead) => {
    navigate(`/orders?tab=new&preSelectEnquiry=${lead.id}`);
  };

  const getPhone = (lead: GoogleAdsLead): string | null => {
    if (lead.phone) return lead.phone;
    if (lead.product_code && lead.product_code !== "N/A") return lead.product_code;
    const parsed = parseNotesField(lead.notes);
    if (parsed["Phone"]) return parsed["Phone"];
    const fields = extractSubmissionFields(lead.raw_google_payload);
    return fields["PHONE_NUMBER"] || fields["PHONE"] || null;
  };

  const getEmail = (lead: GoogleAdsLead): string | null => {
    if (lead.email) return lead.email;
    const parsed = parseNotesField(lead.notes);
    if (parsed["Email"]) return parsed["Email"];
    const fields = extractSubmissionFields(lead.raw_google_payload);
    return fields["EMAIL"] || fields["EMAIL_ADDRESS"] || null;
  };

  const getCity = (lead: GoogleAdsLead): string | null => {
    if (lead.city) return lead.city;
    const parsed = parseNotesField(lead.notes);
    if (parsed["City"]) return parsed["City"];
    if (lead.customer_state) return lead.customer_state;
    const fields = extractSubmissionFields(lead.raw_google_payload);
    return fields["CITY"] || fields["LOCATION"] || null;
  };

  const tempColor: Record<string, string> = {
    hot: "text-destructive border-destructive/20 bg-destructive/5",
    warm: "text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-500/10",
    cold: "text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-500/10",
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Google Ads Leads ({leads.length})</CardTitle>
            <div className="flex gap-2 text-xs">
              <Badge variant="outline" className="text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200">
                <CheckCircle2 className="w-3 h-3 mr-1" /> {convertedCount} Converted
              </Badge>
              {agingCount > 0 && (
                <Badge variant="outline" className="text-amber-600 bg-amber-50 dark:bg-amber-500/10 border-amber-200">
                  <Flame className="w-3 h-3 mr-1" /> {agingCount} Aging
                </Badge>
              )}
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
                    <TableHead className="w-[130px]">P / E / A / ⚠</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Conversion</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedLeads.map((lead) => {
                    const phone = getPhone(lead);
                    const email = getEmail(lead);
                    const city = getCity(lead);
                    const subFields = extractSubmissionFields(lead.raw_google_payload);
                    const priority = getLeadPriority(lead, subFields);

                    return (
                      <TableRow
                        key={lead.id}
                        className={`cursor-pointer transition-colors ${lead.is_converted ? "bg-emerald-500/5" : isAging(lead) ? "bg-amber-500/5" : ""}`}
                        onClick={() => setSelectedLead(lead)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <ProspectButton sourceType="google_ads" sourceId={lead.id} customerName={lead.customer_name} phoneNumber={phone} email={email} company={lead.customer_company !== "Unknown" ? lead.customer_company : undefined} city={city} productName={lead.product_name} notes={lead.notes} isAlreadyProspect={isProspect(lead.id)} />
                            <ACategoryButton sourceType="google_ads" sourceId={lead.id} isACategory={false} />
                            <AttentionButton sourceType="google_ads" sourceId={lead.id} customerName={lead.customer_name} phoneNumber={phone} email={email} company={lead.customer_company !== "Unknown" ? lead.customer_company : undefined} city={city} productName={lead.product_name} notes={lead.notes} isAlreadyAttention={isAttention(lead.id)} />
                            <EnquiryConvertButton sourceType="google_ads" sourceId={lead.id} customerName={lead.customer_name} phoneNumber={phone} email={email} company={lead.customer_company !== "Unknown" ? lead.customer_company : undefined} city={city} productName={lead.product_name} productCategory={lead.product_category} quantity={lead.quantity} urgency={lead.urgency} requestedTimeline={lead.requested_timeline} notes={lead.notes} isAlreadyConverted={lead.is_converted} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="font-medium flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              {lead.customer_name !== "Unknown" ? lead.customer_name : "Not provided"}
                            </div>
                            {lead.customer_company !== "Unknown" && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Briefcase className="w-3 h-3 shrink-0" />
                                {lead.customer_company}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            {phone && (
                              <div className="text-xs flex items-center gap-1 text-muted-foreground">
                                <Phone className="w-3 h-3 shrink-0" />
                                {phone}
                              </div>
                            )}
                            {email && (
                              <div className="text-xs flex items-center gap-1 text-muted-foreground truncate max-w-[140px]">
                                <Mail className="w-3 h-3 shrink-0" />
                                {email}
                              </div>
                            )}
                            {!phone && !email && <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {city ? (
                            <div className="text-xs flex items-center gap-1 text-muted-foreground">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {city}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{lead.product_name}</TableCell>
                        <TableCell>
                          <div className="text-xs space-y-0.5">
                            <div className="truncate max-w-[120px]">{lead.campaign_name || "—"}</div>
                            {lead.ad_group_id && (
                              <div className="text-muted-foreground truncate max-w-[120px]">AG: {lead.ad_group_id}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {lead.sales_person_name || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs gap-1 ${priority.className}`}>
                            {priority.icon}
                            {priority.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {lead.is_converted ? (
                            <Badge variant="outline" className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200">
                              ✓ Converted
                            </Badge>
                          ) : isAging(lead) ? (
                            <Badge variant="outline" className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-500/10 border-amber-200">
                              <Flame className="w-3 h-3 mr-0.5" /> Getting Cold
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
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(lead.created_at), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {phone && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                <a href={`tel:${phone}`} title="Call">
                                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                                </a>
                              </Button>
                            )}
                            {phone && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                <a href={`https://wa.me/${phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" title="WhatsApp">
                                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                                </a>
                              </Button>
                            )}
                            {!lead.is_converted && (
                              <Button variant="outline" size="sm" className="text-xs gap-1 h-7" onClick={() => handleConvertToOrder(lead)}>
                                Convert <ArrowRight className="w-3 h-3" />
                              </Button>
                            )}
                            {lead.is_converted && <span className="text-xs text-emerald-600">✓</span>}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedLead(lead)}>
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lead Detail Drawer */}
      <Sheet open={!!selectedLead} onOpenChange={(o) => !o && setSelectedLead(null)}>
        <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
          {selectedLead && <LeadDetailPanel lead={selectedLead} onConvert={handleConvertToOrder} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function LeadDetailPanel({ lead, onConvert }: { lead: GoogleAdsLead; onConvert: (l: GoogleAdsLead) => void }) {
  const phone = lead.product_code !== "N/A" ? lead.product_code : null;
  const parsedNotes = parseNotesField(lead.notes);
  const subFields = extractSubmissionFields(lead.raw_google_payload);
  const email = parsedNotes["Email"] || subFields["EMAIL"] || subFields["EMAIL_ADDRESS"] || null;
  const city = parsedNotes["City"] || lead.customer_state || subFields["CITY"] || null;
  const jobTitle = subFields["JOB_TITLE"] || subFields["DESIGNATION"] || null;
  const priority = getLeadPriority(lead, subFields);
  const hoursAgo = differenceInHours(new Date(), new Date(lead.created_at));

  // Collect all custom question responses
  const customResponses = Object.entries(subFields).filter(
    ([key]) => !["FULL_NAME", "FIRST_NAME", "LAST_NAME", "PHONE_NUMBER", "PHONE", "EMAIL", "EMAIL_ADDRESS", "COMPANY_NAME", "COMPANY", "CITY", "LOCATION", "JOB_TITLE", "DESIGNATION"].includes(key)
  );

  return (
    <div className="space-y-6">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <User className="w-5 h-5" />
          {lead.customer_name !== "Unknown" ? lead.customer_name : "Not provided"}
        </SheetTitle>
      </SheetHeader>

      {/* Priority & Status */}
      <div className="flex gap-2 flex-wrap">
        <Badge variant="outline" className={`gap-1 ${priority.className}`}>
          {priority.icon} {priority.label}
        </Badge>
        {lead.is_converted ? (
          <Badge variant="outline" className="text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200">✓ Converted</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">{lead.status}</Badge>
        )}
        <Badge variant="outline" className="text-xs text-muted-foreground">
          {hoursAgo < 1 ? "Just now" : hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.floor(hoursAgo / 24)}d ago`}
        </Badge>
      </div>

      <Separator />

      {/* Contact Info */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Contact Information</h4>
        <div className="grid grid-cols-1 gap-2">
          <InfoRow icon={<User className="w-4 h-4" />} label="Name" value={lead.customer_name !== "Unknown" ? lead.customer_name : "Not provided"} />
          <InfoRow icon={<Briefcase className="w-4 h-4" />} label="Company" value={lead.customer_company !== "Unknown" ? lead.customer_company : "Not provided"} />
          {jobTitle && <InfoRow icon={<Briefcase className="w-4 h-4" />} label="Job Title" value={jobTitle} />}
          <InfoRow icon={<Phone className="w-4 h-4" />} label="Phone" value={phone || "Not provided"} />
          <InfoRow icon={<Mail className="w-4 h-4" />} label="Email" value={email || "Not provided"} />
          <InfoRow icon={<MapPin className="w-4 h-4" />} label="Location" value={city || "Not provided"} />
        </div>
      </div>

      {/* Quick Actions */}
      {phone && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 gap-1.5" asChild>
            <a href={`tel:${phone}`}>
              <Phone className="w-4 h-4" /> Call
            </a>
          </Button>
          <Button variant="outline" size="sm" className="flex-1 gap-1.5" asChild>
            <a href={`https://wa.me/${phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer">
              <MessageSquare className="w-4 h-4" /> WhatsApp
            </a>
          </Button>
        </div>
      )}

      <Separator />

      {/* Attribution */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Attribution</h4>
        <div className="grid grid-cols-1 gap-2">
          <InfoRow label="Campaign" value={lead.campaign_name || "Not available"} />
          {lead.campaign_id && <InfoRow label="Campaign ID" value={lead.campaign_id} />}
          {lead.ad_group_id && <InfoRow label="Ad Group" value={lead.ad_group_id} />}
          <InfoRow label="Source" value="Google Ads" />
          <InfoRow label="Assigned To" value={lead.sales_person_name} />
        </div>
      </div>

      <Separator />

      {/* Product Interest */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Product Interest</h4>
        <InfoRow label="Product" value={lead.product_name} />
      </div>

      {/* Custom Responses / Lead Intent */}
      {customResponses.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Lead Intent & Responses</h4>
            <div className="space-y-2">
              {customResponses.map(([key, val]) => (
                <InfoRow key={key} label={key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} value={val} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Conversion Info */}
      {lead.is_converted && lead.conversion_value > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Conversion</h4>
            <InfoRow label="Value" value={`₹${lead.conversion_value.toLocaleString("en-IN")}`} />
          </div>
        </>
      )}

      {/* Convert CTA */}
      {!lead.is_converted && (
        <>
          <Separator />
          <Button className="w-full gap-2" onClick={() => onConvert(lead)}>
            Convert to Order <ArrowRight className="w-4 h-4" />
          </Button>
        </>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {icon && <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>}
      <span className="text-muted-foreground shrink-0 min-w-[80px]">{label}:</span>
      <span className="text-foreground break-all">{value}</span>
    </div>
  );
}
