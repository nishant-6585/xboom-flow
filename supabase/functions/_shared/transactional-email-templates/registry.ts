/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

import { template as orderNotification } from './order-notification.tsx'
import { template as websiteOrder } from './website-order.tsx'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient override. When set, caller-provided recipientEmail is ignored. */
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'order-notification': orderNotification,
  'website-order': websiteOrder,
}