/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  customerName?: string
  companyName?: string
  orderNumber?: string
  aadhaarLast4?: string
  reviewLink?: string
  uploadedAt?: string
}

const Email = (p: Props = {}) => {
  const uploaded = p.uploadedAt || new Date().toLocaleString('en-IN')
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>KYC awaiting your review</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={brand}>x<span style={{ color: '#d4af37' }}>boom</span><span style={tag}>KYC REVIEW</span></Text>
          </Section>
          <Section style={card}>
            <Heading as="h1" style={h1}>KYC submitted — review needed</Heading>
            <Text style={{ margin: '0 0 8px', fontSize: '14px', color: '#334155' }}>
              A customer just uploaded their Aadhaar card for KYC.
            </Text>
            <table style={{ margin: '14px 0 20px', borderCollapse: 'collapse', fontSize: '14px', color: '#0f172a' }}>
              <tbody>
                <tr><td style={l}>Customer</td><td style={{ padding: '4px 0', fontWeight: 600 }}>{p.customerName || ''}</td></tr>
                <tr><td style={l}>Company</td><td style={{ padding: '4px 0' }}>{p.companyName || ''}</td></tr>
                {p.orderNumber ? (
                  <tr><td style={l}>Order</td><td style={{ padding: '4px 0', fontWeight: 600 }}>{p.orderNumber}</td></tr>
                ) : null}
                <tr><td style={l}>Uploaded</td><td style={{ padding: '4px 0' }}>{uploaded}</td></tr>
                <tr><td style={l}>Aadhaar</td><td style={{ padding: '4px 0' }}>XXXX XXXX {p.aadhaarLast4 || ''}</td></tr>
                <tr><td style={l}>Status</td><td style={{ padding: '4px 0', color: '#b45309', fontWeight: 600 }}>Pending Verification</td></tr>
              </tbody>
            </table>
            <Section><Button href={p.reviewLink || '#'} style={btn}>Review KYC</Button></Section>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif', color: '#0f172a' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '24px' }
const header = { background: '#0c1e3e', padding: '22px 28px', borderRadius: '12px 12px 0 0' }
const brand = { margin: 0, color: '#fff', fontSize: '20px', fontWeight: 700 as const }
const tag = { fontSize: '11px', letterSpacing: '1.5px', color: 'rgba(255,255,255,.7)', marginLeft: '8px' }
const card = { background: '#ffffff', padding: '28px', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 12px 12px' }
const h1 = { margin: '0 0 12px', fontSize: '20px' }
const l = { padding: '4px 12px 4px 0', color: '#64748b' }
const btn = { background: '#0c1e3e', color: '#fff', textDecoration: 'none', padding: '12px 22px', borderRadius: '8px', fontWeight: 600 as const, fontSize: '15px', display: 'inline-block' }

export const template = {
  component: Email,
  subject: 'KYC awaiting your review',
  displayName: 'KYC — Salesperson Notify',
  transactional: true,
  previewData: {
    customerName: 'Jane Doe',
    companyName: 'Acme Pvt Ltd',
    orderNumber: 'ORD-1001',
    aadhaarLast4: '1234',
    reviewLink: 'https://xboomflow.com/kyc?account=demo',
  },
} satisfies TemplateEntry