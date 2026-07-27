/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  order_number?: string
  contact_name?: string
  feedback_url?: string
  google_review_url?: string
  google_review_qr_url?: string
}

const Email = (p: Props = {}) => {
  const subject = `How was your experience with order ${p.order_number || ''}?`
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading as="h2" style={h2}>Your order has been delivered 🎉</Heading>
            <Text style={t}>Hi {p.contact_name || 'there'},</Text>
            <Text style={t}>
              Your order <b>{p.order_number || ''}</b> has been delivered. We hope everything
              arrived in perfect shape!
            </Text>
            <Text style={t}>
              We'd love to hear how we did. It takes less than a minute and helps us serve you better.
            </Text>
            {p.feedback_url ? (
              <Section style={{ margin: '18px 0 8px' }}>
                <Button href={p.feedback_url} style={btn}>Share your feedback</Button>
              </Section>
            ) : null}
            {p.google_review_url ? (
              <>
                <Text style={t}>
                  Enjoyed working with us? A quick Google review goes a long way. ⭐⭐⭐⭐⭐
                </Text>
                <Section style={{ margin: '8px 0 4px' }}>
                  <Button href={p.google_review_url} style={btnOutline}>Review us on Google</Button>
                </Section>
                {p.google_review_qr_url ? (
                  <Section style={{ margin: '10px 0 0' }}>
                    <Img
                      src={p.google_review_qr_url}
                      alt="QR code — scan to review xboom on Google"
                      width="132"
                      height="132"
                    />
                    <Text style={qrCaption}>…or scan with your phone camera</Text>
                  </Section>
                ) : null}
              </>
            ) : null}
            <Hr style={hr} />
            <Text style={foot}>Thank you for choosing xboom — XBOOM Flow Customer Portal</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: '#1a1a2e' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '24px' }
const card = { border: '1px solid #e5e7eb', borderRadius: '12px', padding: '28px' }
const h2 = { margin: '0 0 12px', fontSize: '20px', color: '#0c2340' }
const t = { margin: '0 0 10px', fontSize: '14px' }
const btn = { background: '#0c2340', color: '#fff', padding: '10px 18px', borderRadius: '8px', textDecoration: 'none', display: 'inline-block' as const }
const btnOutline = { background: '#ffffff', color: '#0c2340', border: '1px solid #0c2340', padding: '10px 18px', borderRadius: '8px', textDecoration: 'none', display: 'inline-block' as const }
const hr = { border: 'none', borderTop: '1px solid #e5e7eb', margin: '24px 0' }
const foot = { fontSize: '12px', color: '#6b7280', margin: 0 }
const qrCaption = { fontSize: '12px', color: '#6b7280', margin: '6px 0 0' }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `How was your experience with order ${d?.order_number || ''}?`,
  displayName: 'Portal — Order Delivered: Feedback & Google Review (customer)',
  // Review solicitation, not transactional — respect suppression/unsubscribe.
  transactional: false,
  previewData: {
    order_number: 'PO-1001',
    contact_name: 'Priya',
    feedback_url: 'https://xboomflow.com/portal/feedback?order=demo',
    google_review_url: 'https://g.page/r/CfJDbEcul78fEBM/review',
    google_review_qr_url: 'https://xboomflow.com/google-review-qr.png',
  },
} satisfies TemplateEntry
