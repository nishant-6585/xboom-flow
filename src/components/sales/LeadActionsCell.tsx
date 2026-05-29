import { Phone, MessageCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProspectButton } from "./ProspectButton";
import { AttentionButton } from "./AttentionButton";
import { EnquiryConvertButton } from "./EnquiryConvertButton";
import { LinkToCompanyButton } from "./LinkToCompanyButton";
import MarkTouchedButton from "./MarkTouchedButton";

/**
 * Canonical lead actions row used across every Lead Sources panel.
 *
 * Order is fixed so the toolbar reads the same in every list:
 *   Call · WhatsApp · Email · Prospect (P) · Attention (!) · Convert · Company
 *
 * The buttons render only when the underlying data is present (e.g. no email
 * → no Mail button), but the slot order never changes.
 */
export type LeadSourceType =
  | "interakt"
  | "myoperator"
  | "email"
  | "form_lead"
  | "google_ads"
  | "lead";

export interface LeadActionsCellProps {
  sourceType: LeadSourceType;
  sourceId: string;
  customerName: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  productName?: string | null;
  productCategory?: string | null;
  productCode?: string | null;
  quantity?: number | null;
  urgency?: string | null;
  requestedTimeline?: string | null;
  purposeOfPurchase?: string | null;
  notes?: string | null;
  isAlreadyProspect?: boolean;
  isAlreadyAttention?: boolean;
  isAlreadyConverted?: boolean;
  customerType?: string | null;
  /** Source label shown in the company-link drawer (e.g. "Call", "Email"). */
  sourceLabel?: string;
  /** Optional callback fired after Call / WhatsApp clicks. */
  onContacted?: () => void;
  /** Optional WhatsApp opener override (some panels prefer a curated message). */
  openWhatsApp?: (phone: string) => void;
  className?: string;
}

const defaultOpenWhatsApp = (phone: string) => {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return;
  window.open(`https://wa.me/${digits}`, "_blank", "noopener,noreferrer");
};

export function LeadActionsCell(props: LeadActionsCellProps) {
  const {
    sourceType,
    sourceId,
    customerName,
    phone,
    email,
    company,
    city,
    productName,
    productCategory,
    productCode,
    quantity,
    urgency,
    requestedTimeline,
    purposeOfPurchase,
    notes,
    isAlreadyProspect,
    isAlreadyAttention,
    isAlreadyConverted,
    customerType,
    sourceLabel,
    onContacted,
    openWhatsApp = defaultOpenWhatsApp,
    className,
  } = props;

  const safeName = customerName || "Unknown";

  return (
    <div
      className={`flex items-center gap-1 ${className ?? ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 1. Call */}
      {phone ? (
        <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0" title="Call">
          <a href={`tel:${phone}`} onClick={() => onContacted?.()}>
            <Phone className="h-3.5 w-3.5 text-blue-600" />
          </a>
        </Button>
      ) : (
        <span className="h-7 w-7 inline-block" aria-hidden />
      )}

      {/* 2. WhatsApp */}
      {phone ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          title="WhatsApp"
          onClick={() => {
            openWhatsApp(phone);
            onContacted?.();
          }}
        >
          <MessageCircle className="h-3.5 w-3.5 text-green-600" />
        </Button>
      ) : (
        <span className="h-7 w-7 inline-block" aria-hidden />
      )}

      {/* 3. Email */}
      {email ? (
        <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0" title="Email">
          <a href={`mailto:${email}`}>
            <Mail className="h-3.5 w-3.5 text-amber-600" />
          </a>
        </Button>
      ) : (
        <span className="h-7 w-7 inline-block" aria-hidden />
      )}

      {/* 4. Prospect */}
      <ProspectButton
        sourceType={sourceType}
        sourceId={sourceId}
        customerName={safeName}
        phoneNumber={phone}
        email={email}
        company={company}
        city={city}
        productName={productName ?? ""}
        notes={notes}
        isAlreadyProspect={isAlreadyProspect}
        customerType={customerType}
      />

      {/* 5. Attention */}
      <AttentionButton
        sourceType={sourceType}
        sourceId={sourceId}
        customerName={safeName}
        phoneNumber={phone}
        email={email}
        company={company}
        city={city}
        productName={productName ?? ""}
        notes={notes}
        isAlreadyAttention={isAlreadyAttention}
      />

      {/* 6. Convert to enquiry */}
      <EnquiryConvertButton
        sourceType={sourceType}
        sourceId={sourceId}
        customerName={safeName}
        phoneNumber={phone}
        email={email}
        company={company}
        city={city}
        productName={productName ?? ""}
        productCategory={productCategory}
        productCode={productCode}
        quantity={quantity}
        urgency={urgency}
        requestedTimeline={requestedTimeline}
        purposeOfPurchase={purposeOfPurchase}
        notes={notes}
        isAlreadyConverted={isAlreadyConverted}
      />

      {/* 7. Link to company */}
      <LinkToCompanyButton
        lead={{
          customer_name: safeName,
          company,
          phone,
          email,
          city,
          source_label: sourceLabel,
        }}
      />

      {/* 8. Mark as touched (manual override) */}
      <MarkTouchedButton sourceType={sourceType} sourceId={sourceId} className="h-7 w-7 p-0" />
    </div>
  );
}