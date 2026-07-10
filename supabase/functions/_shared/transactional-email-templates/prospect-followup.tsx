/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  greeting?: string
  paragraphs?: string[]
  productName?: string
  ctaText?: string
  signature?: string
  signatureRole?: string
}

const Email = (p: Props = {}) => {
  const greeting = p.greeting || 'Hi there,'
  const paragraphs = Array.isArray(p.paragraphs) && p.paragraphs.length
    ? p.paragraphs
    : ['Just checking in on your recent enquiry with us.']
  const cta = p.ctaText || 'Reply to this email and we will take it forward.'
  const sig = p.signature || 'XBoom Sales'
  const role = p.signatureRole || 'XBoom Technologies'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{p.productName ? `Following up on your enquiry — ${p.productName}` : 'Following up on your enquiry'}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={brand}>x<span style={{ color: '#d4af37' }}>boom</span></Text>
          </Section>
          <Section style={card}>
            <Heading as="h1" style={h1}>{greeting}</Heading>
            {paragraphs.map((para, i) => (
              <Text key={i} style={body1}>{para}</Text>
            ))}
            <Text style={{ ...body1, marginTop: '18px' }}>{cta}</Text>
            <Text style={sigStyle}>{sig}<br /><span style={{ color: '#64748b', fontSize: '12px' }}>{role}</span></Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif', color: '#0f172a' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '24px' }
const header = { background: '#0c1e3e', padding: '18px 24px', borderRadius: '12px 12px 0 0' }
const brand = { margin: 0, color: '#fff', fontSize: '20px', fontWeight: 700 as const }
const card = { background: '#ffffff', padding: '28px', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 12px 12px' }
const h1 = { margin: '0 0 14px', fontSize: '18px' }
const body1 = { margin: '0 0 12px', fontSize: '14px', color: '#334155', lineHeight: 1.6 }
const sigStyle = { margin: '24px 0 0', fontSize: '14px', color: '#0f172a', fontWeight: 600 as const }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => d?.subject || 'Following up on your enquiry',
  displayName: 'Prospect — Auto Follow-up',
  transactional: false,
  previewData: {
    greeting: 'Hi Nishant,',
    productName: 'DJI Mavic 3 Enterprise',
    paragraphs: [
      'I wanted to circle back on your enquiry for the DJI Mavic 3 Enterprise. Based on your timeline, I thought it would be a good moment to check in.',
      'We can arrange a quick 15-minute call to walk through pricing, delivery, and financing options if that helps.',
    ],
    ctaText: 'Reply to this email or book a 15-min call at your convenience.',
    signature: 'Amit',
    signatureRole: 'XBoom Sales',
  },
} satisfies TemplateEntry