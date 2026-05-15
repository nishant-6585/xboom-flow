import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmailLead } from '@/hooks/useEmailLeads';
import { format } from 'date-fns';
import { Mail, Phone, MapPin, Building2, Package, Brain, CheckCircle, XCircle, Clock, AlertTriangle, Eye, Loader2, Calendar, User, Tag } from 'lucide-react';
import { ProspectButton } from './ProspectButton';
import { EnquiryConvertButton } from './EnquiryConvertButton';
import { AttentionButton } from './AttentionButton';
import { CallButton } from '@/components/calls/CallButton';

interface Props {
  lead: EmailLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (lead: EmailLead) => void;
  approving: boolean;
  rejecting: boolean;
  canManage: boolean;
  isProspect: boolean;
  isAttention: boolean;
}

export function EmailLeadDetailDrawer({
  lead, open, onOpenChange, onApprove, onReject, onEdit,
  approving, rejecting, canManage, isProspect, isAttention,
}: Props) {
  if (!lead) return null;

  const confidencePct = lead.ai_confidence != null ? Math.round(lead.ai_confidence * 100) : null;

  const processingStatusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    pending: { color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30', icon: <Clock className="w-3.5 h-3.5" />, label: 'Pending' },
    processing: { color: 'bg-blue-500/10 text-blue-600 border-blue-500/30', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: 'Processing' },
    processed: { color: 'bg-green-500/10 text-green-600 border-green-500/30', icon: <CheckCircle className="w-3.5 h-3.5" />, label: 'Processed' },
    needs_review: { color: 'bg-orange-500/10 text-orange-600 border-orange-500/30', icon: <Eye className="w-3.5 h-3.5" />, label: 'Needs Review' },
    rejected: { color: 'bg-muted text-muted-foreground', icon: <XCircle className="w-3.5 h-3.5" />, label: 'Rejected' },
    failed: { color: 'bg-destructive/10 text-destructive border-destructive/30', icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'Failed' },
  };

  const pConfig = processingStatusConfig[lead.processing_status] || processingStatusConfig.pending;

  // Extract subject from notes if not stored separately
  const subject = (lead as any).subject || lead.notes?.split('\n')[0]?.replace(/^Subject:\s*/i, '') || 'No Subject';
  const bodyText = (lead as any).body_text || '';
  const bodyHtml = (lead as any).body_html || '';

  // Highlight patterns in body
  const phonePattern = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}|\b\d{10}\b/g;
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  const highlightedPhones = bodyText.match(phonePattern) || [];
  const highlightedEmails = bodyText.match(emailPattern) || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[600px] p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg font-semibold leading-tight line-clamp-2">
                {subject}
              </SheetTitle>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className={`gap-1 ${pConfig.color}`}>
                  {pConfig.icon}
                  {pConfig.label}
                </Badge>
                {lead.mail_source?.startsWith('gmail:') && (
                  <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30 text-[10px]">
                    📧 Gmail
                  </Badge>
                )}
                {confidencePct != null && (
                  <Badge variant="outline" className={`text-[10px] ${
                    confidencePct >= 70 ? 'bg-green-500/10 text-green-600 border-green-500/30' :
                    confidencePct >= 50 ? 'bg-orange-500/10 text-orange-600 border-orange-500/30' :
                    'bg-red-500/10 text-red-500 border-red-500/30'
                  }`}>
                    AI: {confidencePct}%
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-5">
            {/* Sender Info */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact Info</h4>
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{lead.customer_name}</span>
                </div>
                {lead.customer_company && (
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">{lead.customer_company}</span>
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <a href={`mailto:${lead.email}`} className="text-sm text-primary hover:underline">{lead.email}</a>
                  </div>
                )}
                {lead.phone_number && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm flex-1">{lead.phone_number}</span>
                    <CallButton
                      phoneNumber={lead.phone_number}
                      entityType="lead"
                      entityId={lead.id}
                      iconOnly
                      variant="ghost"
                      className="h-7 w-7"
                    />
                  </div>
                )}
                {lead.city && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">{lead.city}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground">{format(new Date(lead.created_at), 'dd MMM yyyy, hh:mm a')}</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Email Body */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Content</h4>
              {bodyHtml ? (
                <div
                  className="text-sm bg-muted/30 rounded-lg p-4 border max-h-[300px] overflow-y-auto prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(bodyHtml) }}
                />
              ) : bodyText ? (
                <div className="text-sm bg-muted/30 rounded-lg p-4 border max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words">
                  {bodyText}
                </div>
              ) : lead.notes ? (
                <div className="text-sm bg-muted/30 rounded-lg p-4 border max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words">
                  {lead.notes}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No email content available</p>
              )}
            </div>

            {/* Highlighted Data */}
            {(highlightedPhones.length > 0 || highlightedEmails.length > 0 || lead.product_name) && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Detected Info</h4>
                  <div className="flex flex-wrap gap-2">
                    {highlightedPhones.map((phone, i) => (
                      <Badge key={`p-${i}`} variant="outline" className="gap-1 text-xs">
                        <Phone className="w-3 h-3" /> {phone}
                      </Badge>
                    ))}
                    {highlightedEmails.map((email, i) => (
                      <Badge key={`e-${i}`} variant="outline" className="gap-1 text-xs">
                        <Mail className="w-3 h-3" /> {email}
                      </Badge>
                    ))}
                    {lead.product_name && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Package className="w-3 h-3" /> {lead.product_name}
                      </Badge>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Lead Details */}
            {(lead.product_category || lead.quantity || lead.urgency || lead.requested_timeline || lead.purpose_of_purchase) && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lead Details</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {lead.product_category && (
                      <div><span className="text-muted-foreground">Category:</span> {lead.product_category}</div>
                    )}
                    {lead.product_code && (
                      <div><span className="text-muted-foreground">Code:</span> {lead.product_code}</div>
                    )}
                    {lead.quantity && (
                      <div><span className="text-muted-foreground">Qty:</span> {lead.quantity}</div>
                    )}
                    {lead.urgency && (
                      <div><span className="text-muted-foreground">Urgency:</span> <Badge variant="outline" className="text-[10px]">{lead.urgency}</Badge></div>
                    )}
                    {lead.requested_timeline && (
                      <div><span className="text-muted-foreground">Timeline:</span> {lead.requested_timeline}</div>
                    )}
                    {lead.purpose_of_purchase && (
                      <div className="col-span-2"><span className="text-muted-foreground">Purpose:</span> {lead.purpose_of_purchase}</div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* AI Section */}
            <Separator />
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Brain className="w-4 h-4" /> AI Analysis
              </h4>
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="outline" className={`gap-1 ${pConfig.color}`}>
                    {pConfig.icon} {pConfig.label}
                  </Badge>
                </div>
                {confidencePct != null && (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">Confidence:</span>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden max-w-[200px]">
                        <div
                          className={`h-full rounded-full transition-all ${
                            confidencePct >= 70 ? 'bg-green-500' : confidencePct >= 50 ? 'bg-orange-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${confidencePct}%` }}
                        />
                      </div>
                      <span className={`text-sm font-semibold ${
                        confidencePct >= 70 ? 'text-green-600' : confidencePct >= 50 ? 'text-orange-600' : 'text-red-500'
                      }`}>{confidencePct}%</span>
                    </div>
                  </div>
                )}
                {lead.ai_extracted_json && (
                  <div>
                    <span className="text-xs text-muted-foreground">Extracted Data:</span>
                    <pre className="text-[11px] bg-muted/50 rounded p-3 mt-1 overflow-auto max-h-40 whitespace-pre-wrap font-mono">
                      {JSON.stringify(lead.ai_extracted_json, null, 2)}
                    </pre>
                  </div>
                )}
                {lead.error_message && (
                  <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                    <span className="text-xs text-destructive font-medium">Error:</span>
                    <p className="text-xs text-destructive/80 mt-0.5">{lead.error_message}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Assignment */}
            {(lead.sales_person_name || lead.created_by_name) && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assignment</h4>
                  <div className="space-y-1 text-sm">
                    {lead.sales_person_name && <p><span className="text-muted-foreground">Sales Person:</span> {lead.sales_person_name}</p>}
                    {lead.created_by_name && <p><span className="text-muted-foreground">Created by:</span> {lead.created_by_name}</p>}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* Actions Footer */}
        <div className="border-t px-6 py-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <ProspectButton
              sourceType="email" sourceId={lead.id} customerName={lead.customer_name}
              phoneNumber={lead.phone_number} email={lead.email} company={lead.customer_company}
              city={lead.city} productName={lead.product_name} notes={lead.notes}
              isAlreadyProspect={isProspect}
            />
            <EnquiryConvertButton
              sourceType="email" sourceId={lead.id} customerName={lead.customer_name}
              phoneNumber={lead.phone_number} email={lead.email} company={lead.customer_company}
              city={lead.city} productName={lead.product_name} productCategory={lead.product_category}
              productCode={lead.product_code} quantity={lead.quantity} urgency={lead.urgency}
              requestedTimeline={lead.requested_timeline} purposeOfPurchase={lead.purpose_of_purchase}
              notes={lead.notes}
            />
            <AttentionButton
              sourceType="email" sourceId={lead.id} customerName={lead.customer_name}
              phoneNumber={lead.phone_number} email={lead.email} company={lead.customer_company}
              city={lead.city} productName={lead.product_name} notes={lead.notes}
              isAlreadyAttention={isAttention}
            />
            <Button variant="outline" size="sm" onClick={() => onEdit(lead)}>
              Edit
            </Button>
          </div>
          {lead.processing_status === 'needs_review' && canManage && (
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                size="sm"
                onClick={() => onApprove(lead.id)}
                disabled={approving}
              >
                {approving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                Approve & Create Enquiry
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onReject(lead.id)}
                disabled={rejecting}
              >
                <XCircle className="w-4 h-4 mr-1" />
                Reject
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
