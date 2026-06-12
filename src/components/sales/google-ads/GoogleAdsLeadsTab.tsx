import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInHours } from "date-fns";
import { ArrowRight, CheckCircle2, Flame, Phone, MessageSquare, MapPin, Briefcase, Mail, User, Zap, AlertTriangle, TrendingUp, ChevronRight, Layers } from "lucide-react";
import { Json } from "@/integrations/supabase/types";
import { ProspectButton, ACategoryButton } from "../ProspectButton";
import { AttentionButton } from "../AttentionButton";
import { EnquiryConvertButton } from "../EnquiryConvertButton";
import { LeadActionsCell } from "../LeadActionsCell";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { applyDispositionFilter } from "@/lib/dispositionFilter";
import { groupDuplicates } from "@/lib/leadDeduplication";
import { useProspects } from "@/hooks/useProspects";
import { useAttentionItems } from "@/hooks/useAttentionItems";
import { LeadContactDrawer, LeadContactData } from "../LeadContactDrawer";
import { CallButton } from "@/components/calls/CallButton";
import { useAuth } from "@/hooks/useAuth";

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
  disposition?: string | null;
  disposition_reason_code?: string | null;
  disposition_reason_note?: string | null;
  disposition_at?: string | null;
  disposition_by_name?: string | null;
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
  const { user, role } = useAuth();
  const canManage = role === 'admin' || role === 'sales_manager';
  const [leads, setLeads] = useState<GoogleAdsLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<GoogleAdsLead | null>(null);
  const [includeDispositioned, setIncludeDispositioned] = useState(false);
  const navigate = useNavigate();
  const { prospects } = useProspects();
  const { items: attentionItems } = useAttentionItems();

  const isProspect = (leadId: string) => prospects.some(p => p.source_id === leadId && p.source_type === 'google_ads');
  const isAttention = (leadId: string) => attentionItems.some(a => a.source_id === leadId && a.source_type === 'google_ads');

  const fetchLeads = async () => {
    setLoading(true);
    let query = supabase
      .from("google_ads_leads")
      .select("id, customer_name, customer_company, product_name, product_code, campaign_name, campaign_id, ad_group_id, lead_temperature, status, created_at, order_outcome, is_converted, conversion_value, notes, customer_state, raw_google_payload, sales_person_name, product_category, quantity, urgency, requested_timeline, email, phone, city, disposition, disposition_reason_code, disposition_reason_note, disposition_at, disposition_by_name")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!canManage && user?.id) {
      query = query.or(`assigned_to.eq.${user.id},sales_person_id.eq.${user.id}`);
    }
    const { data } = await query;

    if (data) setLeads(data as GoogleAdsLead[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchLeads();
  }, [canManage, user?.id]);

  // Sort: high-intent + recent first
  const sortedLeads = useMemo(() => {
    const filtered = applyDispositionFilter(leads, includeDispositioned);
    return [...filtered].sort((a, b) => {
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
  }, [leads, includeDispositioned]);

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
            <CardTitle className="text-lg">Google Ads Leads ({sortedLeads.length})</CardTitle>
            <div className="flex gap-2 text-xs">
              <div className="flex items-center gap-2 mr-2">
                <Switch
                  id="googleads-show-all-dispositions"
                  checked={includeDispositioned}
                  onCheckedChange={setIncludeDispositioned}
                />
                <Label htmlFor="googleads-show-all-dispositions" className="text-xs cursor-pointer">
                  Show all dispositions
                </Label>
              </div>
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
                    <TableHead className="w-[210px]">Actions</TableHead>
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
                    <TableHead className="text-center">Order</TableHead>
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
                          <div className="flex items-center gap-1">
                            <LeadActionsCell
                              sourceType="google_ads"
                              sourceId={lead.id}
                              customerName={lead.customer_name}
                              phone={phone}
                              email={email}
                              company={lead.customer_company !== "Unknown" ? lead.customer_company : undefined}
                              city={city}
                              productName={lead.product_name}
                              productCategory={lead.product_category}
                              quantity={lead.quantity}
                              urgency={lead.urgency}
                              requestedTimeline={lead.requested_timeline}
                              notes={lead.notes}
                              isAlreadyProspect={isProspect(lead.id)}
                              isAlreadyAttention={isAttention(lead.id)}
                              isAlreadyConverted={lead.is_converted}
                              sourceLabel="Google Ads"
                              currentDisposition={lead.disposition}
                              dispositionReasonCode={lead.disposition_reason_code}
                              dispositionReasonNote={lead.disposition_reason_note}
                              dispositionAt={lead.disposition_at}
                              dispositionByName={lead.disposition_by_name}
                              onDispositionChanged={() => fetchLeads()}
                            />
                            <ACategoryButton sourceType="google_ads" sourceId={lead.id} isACategory={false} />
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

      {/* Lead Contact Drawer */}
      <LeadContactDrawer
        open={!!selectedLead}
        onOpenChange={(open) => { if (!open) setSelectedLead(null); }}
        lead={selectedLead ? (() => {
          const subFields = extractSubmissionFields(selectedLead.raw_google_payload);
          const parsedNotes = parseNotesField(selectedLead.notes);
          const phone = subFields["PHONE_NUMBER"] || subFields["PHONE"] || selectedLead.phone || parsedNotes["Phone"] || null;
          const email = subFields["EMAIL"] || subFields["EMAIL_ADDRESS"] || selectedLead.email || parsedNotes["Email"] || null;
          const city = subFields["CITY"] || selectedLead.city || parsedNotes["City"] || selectedLead.customer_state || null;
          return {
            id: selectedLead.id,
            source_type: 'google_ads' as const,
            customer_name: selectedLead.customer_name !== "Unknown" ? selectedLead.customer_name : "Not provided",
            phone,
            email,
            company: selectedLead.customer_company !== "Unknown" ? selectedLead.customer_company : null,
            city,
            product_name: selectedLead.product_name,
            notes: selectedLead.notes,
            status: selectedLead.status,
            assigned_to_name: selectedLead.sales_person_name,
            created_at: selectedLead.created_at,
            extras: {
              campaign: selectedLead.campaign_name,
              product_category: selectedLead.product_category,
              urgency: selectedLead.urgency,
              temperature: selectedLead.lead_temperature,
              is_converted: selectedLead.is_converted ? 'Yes' : 'No',
              conversion_value: selectedLead.conversion_value || null,
            },
          } satisfies LeadContactData;
        })() : null}
      />
    </>
  );
}

