/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// Internal "new order created" notification. Reproduces the previous
// Resend HTML byte-for-byte in intent: same field labels, same section order,
// same currency formatting, same footer text. Rendered by React so all
// dynamic values are escaped automatically — no dangerouslySetInnerHTML.

interface Props {
  orderNumber?: string
  customerName?: string
  customerCompany?: string
  customerEmail?: string
  productName?: string
  productCode?: string
  quantity?: number
  sellingPrice?: number
  totalAmount?: number
  salesPersonName?: string
  estimatedDelivery?: string
  shippingAddress?: string
  paymentTerms?: string
  notes?: string
  createdAt?: string
}

const formatCurrency = (amount?: number) => {
  if (!amount) return 'N/A'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

const Row = ({ label, value, highlight = false }: { label: string; value: React.ReactNode; highlight?: boolean }) => (
  <tr>
    <td style={{ padding: '8px 0', fontWeight: 'bold', width: '140px', verticalAlign: 'top' }}>{label}:</td>
    <td style={{ padding: '8px 0', ...(highlight ? { fontSize: '18px', color: '#667eea', fontWeight: 'bold' } : {}) }}>{value}</td>
  </tr>
)

const Email = (props: Props) => {
  const p = props || {}
  const createdAt = p.createdAt || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  const sectionTitle = { color: '#333', marginTop: '25px', borderBottom: '2px solid #667eea', paddingBottom: '10px' }
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>New Order Created: {p.orderNumber || ''}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={hero}>
            <Heading as="h1" style={{ color: 'white', margin: 0, fontSize: '24px' }}>
              🎉 New Order Created!
            </Heading>
            <Text style={{ color: 'rgba(255,255,255,0.9)', margin: '10px 0 0 0' }}>
              Order #{p.orderNumber || ''}
            </Text>
          </Section>

          <Section style={panel}>
            <Heading as="h2" style={{ ...sectionTitle, marginTop: 0 } as any}>Customer Details</Heading>
            <table style={tableStyle}>
              <tbody>
                <Row label="Customer Name" value={p.customerName || ''} />
                <Row label="Company" value={p.customerCompany || ''} />
                {p.customerEmail ? <Row label="Email" value={p.customerEmail} /> : null}
                {p.shippingAddress ? <Row label="Shipping Address" value={p.shippingAddress} /> : null}
              </tbody>
            </table>

            <Heading as="h2" style={sectionTitle as any}>Order Details</Heading>
            <table style={tableStyle}>
              <tbody>
                <Row label="Product" value={p.productName || ''} />
                <Row label="Product Code" value={p.productCode || ''} />
                <Row label="Quantity" value={p.quantity ?? 0} />
                {p.sellingPrice ? <Row label="Unit Price" value={formatCurrency(p.sellingPrice)} /> : null}
                {p.totalAmount ? <Row label="Total Amount" value={formatCurrency(p.totalAmount)} highlight /> : null}
              </tbody>
            </table>

            <Heading as="h2" style={sectionTitle as any}>Additional Information</Heading>
            <table style={tableStyle}>
              <tbody>
                <Row label="Sales Person" value={p.salesPersonName || ''} />
                {p.estimatedDelivery ? <Row label="Est. Delivery" value={p.estimatedDelivery} /> : null}
                {p.paymentTerms ? <Row label="Payment Terms" value={p.paymentTerms} /> : null}
                {p.notes ? <Row label="Notes" value={p.notes} /> : null}
              </tbody>
            </table>
          </Section>

          <Section style={footer}>
            <Text style={{ margin: 0, fontSize: '14px', color: '#ffffff' }}>
              This is an automated notification from XBOOM Flow
            </Text>
            <Text style={{ margin: '5px 0 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
              Created at {createdAt}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Arial, sans-serif',
  lineHeight: '1.6',
  color: '#333',
}
const container = { maxWidth: '600px', margin: '0 auto', padding: '20px' }
const hero = {
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  padding: '30px',
  borderRadius: '10px 10px 0 0',
}
const panel = {
  background: '#f9f9f9',
  padding: '30px',
  border: '1px solid #e0e0e0',
  borderTop: 'none',
}
const footer = {
  background: '#333',
  color: '#ffffff',
  padding: '20px',
  borderRadius: '0 0 10px 10px',
  textAlign: 'center' as const,
}
const tableStyle = { width: '100%', borderCollapse: 'collapse' as const }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `New Order Created: ${d?.orderNumber ?? ''} - ${d?.customerName ?? ''}`,
  displayName: 'Internal — New Order Created',
  to: 'nishant.k@xboom.in',
  transactional: true,
  previewData: {
    orderNumber: 'ORD-1001',
    customerName: 'Jane Doe',
    customerCompany: 'Acme Pvt Ltd',
    productName: 'XBOOM Reactor',
    productCode: 'XBR-01',
    quantity: 2,
    sellingPrice: 25000,
    totalAmount: 50000,
    salesPersonName: 'Nishant',
  },
} satisfies TemplateEntry