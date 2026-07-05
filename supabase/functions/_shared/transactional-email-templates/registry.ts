/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

import { template as orderNotification } from './order-notification.tsx'
import { template as websiteOrder } from './website-order.tsx'
import { template as kycOnboarding } from './kyc-onboarding.tsx'
import { template as kycReminder } from './kyc-reminder.tsx'
import { template as kycStatus } from './kyc-status.tsx'
import { template as kycSalespersonNotify } from './kyc-salesperson-notify.tsx'
import { template as dlqAlert } from './dlq-alert.tsx'
import { template as ticketAssigned } from './ticket-assigned.tsx'
import { template as ticketStatusUpdate } from './ticket-status-update.tsx'
import { template as portalOrderState } from './portal-order-state.tsx'
import { template as portalRfqSubmitted } from './portal-rfq-submitted.tsx'
import { template as portalRfqAssigned } from './portal-rfq-assigned.tsx'
import { template as portalTicketCreated } from './portal-ticket-created.tsx'
import { template as portalTicketReplyToStaff } from './portal-ticket-reply-to-staff.tsx'
import { template as portalTicketReplyToCustomer } from './portal-ticket-reply-to-customer.tsx'
import { template as customerConfirmationRequest } from './customer-confirmation-request.tsx'
import { template as portalInvite } from './portal-invite.tsx'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient override. When set, caller-provided recipientEmail is ignored. */
  to?: string
  /**
   * Marks the template as strictly transactional. Transactional templates
   * BYPASS the suppression list and the unsubscribe token — a customer
   * who unsubscribed from marketing must still receive KYC, order
   * confirmation, ticket-reply, and password-reset emails. Transactional
   * sends also omit the unsubscribe footer on the rendered email.
   *
   * Default (undefined/false): normal marketing/notification behavior —
   * suppression is enforced and the footer includes unsubscribe.
   */
  transactional?: boolean
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'order-notification': orderNotification,
  'website-order': websiteOrder,
  'kyc-onboarding': kycOnboarding,
  'kyc-reminder': kycReminder,
  'kyc-status': kycStatus,
  'kyc-salesperson-notify': kycSalespersonNotify,
  'dlq-alert': dlqAlert,
  'ticket-assigned': ticketAssigned,
  'ticket-status-update': ticketStatusUpdate,
  'portal-order-state': portalOrderState,
  'portal-rfq-submitted': portalRfqSubmitted,
  'portal-rfq-assigned': portalRfqAssigned,
  'portal-ticket-created': portalTicketCreated,
  'portal-ticket-reply-to-staff': portalTicketReplyToStaff,
  'portal-ticket-reply-to-customer': portalTicketReplyToCustomer,
  'customer-confirmation-request': customerConfirmationRequest,
  'portal-invite': portalInvite,
}