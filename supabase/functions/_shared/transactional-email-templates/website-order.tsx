/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// Customer-facing website order emails. One template, event-driven body.
// Copy, subjects, and CTA text are byte-for-byte reproductions of the
// prior Resend HTML for the six events the DB trigger sends.

type EventName =
  | 'order_received'
  | 'tracking_update'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'status_update'

interface Props {
  event?: EventName | string
  customer_name?: string
  order_number?: string | null
  external_id?: string | null
  product_name?: string | null
  total?: number | null
  status?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
  courier_name?: string | null
  estimated_delivery?: string | null
}

function fmtTotal(total?: number | null) {
  if (total == null) return ''
  return `₹${Math.round(Number(total)).toLocaleString('en-IN')}`
}

function fmtETA(iso?: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const Sig = () => (
  <>
    <Hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '24px 0' }} />
    <Text style={{ fontSize: '13px', color: '#64748b' }}>
      Need help? Email us at{' '}
      <Link href="mailto:support@xboom.in" style={{ color: '#0ea5e9' }}>support@xboom.in</Link>.
      <br />— Team Xboom
    </Text>
  </>
)

const Brand = () => (
  <Section style={{ textAlign: 'center', marginBottom: '20px' }}>
    <Heading as="h2" style={{ margin: 0, color: '#0ea5e9' }}>Xboom</Heading>
  </Section>
)

const Email = (props: Props) => {
  const p = props || {}
  const name = p.customer_name || 'Customer'
  const orderNo = p.order_number || p.external_id || ''
  const product = p.product_name || 'your order'
  const total = fmtTotal(p.total)
  const status = String(p.status || '').replace(/_/g, ' ')
  const trackNum = p.tracking_number || ''
  const trackUrl = p.tracking_url || ''
  const courier = p.courier_name || ''
  const eta = fmtETA(p.estimated_delivery)
  const event = (p.event as EventName) || 'status_update'

  let preview = ''
  let body: React.ReactNode = null

  switch (event) {
    case 'order_received':
      preview = `Order #${orderNo} received — Xboom`
      body = (
        <>
          <Heading as="h3">Hi {name}, thanks for your order!</Heading>
          <Text>
            We've received your order <b>#{orderNo}</b> for <b>{product}</b>
            {total ? ` (${total})` : ''} and our team will start processing it shortly.
          </Text>
          <Text>You'll receive another email as soon as it ships.</Text>
        </>
      )
      break
    case 'tracking_update':
      preview = `Tracking details for order #${orderNo}`
      body = (
        <>
          <Heading as="h3" style={{ margin: '0 0 8px' }}>Hi {name}, your order is on the way 🚚</Heading>
          <Text style={{ margin: '0 0 16px', color: '#475569' }}>
            Great news! Your order <b>#{orderNo}</b> (<b>{product}</b>) has been shipped
            {courier ? <> via <b>{courier}</b></> : null}.
          </Text>
          <Section style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 20px', margin: '16px 0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {courier ? (
                  <tr>
                    <td style={cellLabel}>Courier</td>
                    <td style={cellValue}>{courier}</td>
                  </tr>
                ) : null}
                {trackNum ? (
                  <tr>
                    <td style={cellLabel}>Tracking number</td>
                    <td style={cellValue}>{trackNum}</td>
                  </tr>
                ) : null}
                {eta ? (
                  <tr>
                    <td style={cellLabel}>Estimated delivery</td>
                    <td style={cellValue}>{eta}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Section>
          {trackUrl ? (
            <>
              <Section style={{ textAlign: 'center', margin: '20px 0' }}>
                <Button
                  href={trackUrl}
                  style={{ background: '#0ea5e9', color: '#fff', padding: '12px 28px', borderRadius: '8px', textDecoration: 'none', display: 'inline-block', fontWeight: 600 }}
                >
                  Open {courier || 'courier'} tracking page
                </Button>
              </Section>
              <Text style={{ fontSize: '13px', color: '#475569', margin: '0 0 8px', textAlign: 'center' }}>
                On the page that opens, please enter your tracking number <b>{trackNum}</b> to view the latest status.
              </Text>
            </>
          ) : null}
          <Text style={{ fontSize: '13px', color: '#64748b', marginTop: '20px' }}>
            Tracking information may take a few hours to reflect on the courier's website after dispatch.
          </Text>
        </>
      )
      break
    case 'delivered':
      preview = `Order #${orderNo} delivered — Xboom`
      body = (
        <>
          <Heading as="h3">Hi {name}, your order has been delivered ✅</Heading>
          <Text>
            Order <b>#{orderNo}</b> (<b>{product}</b>) was marked delivered. We hope you love it!
          </Text>
        </>
      )
      break
    case 'cancelled':
      preview = `Order #${orderNo} cancelled`
      body = (
        <>
          <Heading as="h3">Hi {name},</Heading>
          <Text>
            Your order <b>#{orderNo}</b> has been cancelled. If this wasn't expected please reach out and we'll help you sort it.
          </Text>
        </>
      )
      break
    case 'refunded':
      preview = `Refund processed for order #${orderNo}`
      body = (
        <>
          <Heading as="h3">Hi {name},</Heading>
          <Text>
            Your refund for order <b>#{orderNo}</b> has been processed and should reflect in your account within 5-7 business days.
          </Text>
        </>
      )
      break
    case 'status_update':
    default:
      preview = `Update on your order #${orderNo}`
      body = (
        <>
          <Heading as="h3">Hi {name},</Heading>
          <Text>
            Your order <b>#{orderNo}</b> status was updated to <b>{status}</b>.
          </Text>
        </>
      )
  }

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Brand />
          {body}
          <Sig />
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: '#0f172a' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '24px' }
const cellLabel = { padding: '6px 0', color: '#64748b', fontSize: '13px', width: '130px' }
const cellValue = { padding: '6px 0', color: '#0f172a', fontSize: '14px', fontWeight: 600 as const }

function subjectFor(d: Record<string, any>): string {
  const orderNo = d?.order_number || d?.external_id || ''
  switch (d?.event) {
    case 'order_received': return `Order #${orderNo} received — Xboom`
    case 'tracking_update': return `Tracking details for order #${orderNo}`
    case 'delivered': return `Order #${orderNo} delivered — Xboom`
    case 'cancelled': return `Order #${orderNo} cancelled`
    case 'refunded': return `Refund processed for order #${orderNo}`
    case 'status_update':
    default: return `Update on your order #${orderNo}`
  }
}

export const template = {
  component: Email,
  subject: subjectFor,
  displayName: 'Customer — Website Order Update',
  transactional: true,
  previewData: {
    event: 'order_received',
    customer_name: 'Jane Doe',
    order_number: '1001',
    product_name: 'XBOOM Reactor',
    total: 4999,
  },
} satisfies TemplateEntry