/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  rfq_number?: string
  company_name?: string
  use_case?: string
  admin_url?: string
}

const Email = (p: Props = {}) => {
  const subject = `New RFQ ${p.rfq_number || ''} from ${p.company_name || 'customer'}`
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading as="h2" style={h2}>{subject}</Heading>
            <Text style={t}><b>{p.company_name || '—'}</b> just submitted an RFQ.</Text>
            <Section style={noteBox}><Text style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{p.use_case || ''}</Text></Section>
            <Text style={t}>
              <Link href={p.admin_url || 'https://xboomflow.com/admin/portal-rfqs'} style={link}>Open queue</Link>
            </Text>
            <Hr style={hr} />
            <Text style={foot}>XBOOM Flow Customer Portal</Text>
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
const noteBox = { background: '#f3f4f6', padding: '12px', borderRadius: '8px', margin: '10px 0' }
const link = { color: '#0c2340' }
const hr = { border: 'none', borderTop: '1px solid #e5e7eb', margin: '24px 0' }
const foot = { fontSize: '12px', color: '#6b7280', margin: 0 }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `New RFQ ${d?.rfq_number || ''} from ${d?.company_name || 'customer'}`,
  displayName: 'Portal — RFQ Submitted (internal)',
  transactional: true,
  previewData: {
    rfq_number: 'RFQ-2001',
    company_name: 'Acme Robotics',
    use_case: 'Need 12 units for spraying trials in Sep.',
  },
} satisfies TemplateEntry