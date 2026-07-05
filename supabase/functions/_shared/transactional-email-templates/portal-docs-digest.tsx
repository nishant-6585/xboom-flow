/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// Daily portal docs digest — informational customer email listing docs
// uploaded in the last 24h. NOT transactional: suppression + unsubscribe
// footer apply (customers can opt out via /unsubscribe or the per-contact
// email_new_docs preference the sender already checks).

interface Item { title?: string; doc_type?: string; order_number?: string }
interface Props {
  items?: Item[]
  documents_url?: string
}

const Email = (p: Props = {}) => {
  const items = Array.isArray(p.items) ? p.items : []
  const count = items.length
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${count} new document${count === 1 ? '' : 's'} on your portal`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading as="h2" style={h2}>New documents available</Heading>
            <Text style={p1}>The following documents were uploaded in the last 24 hours:</Text>
            <Section>
              {items.map((it, idx) => (
                <Text key={idx} style={li}>
                  • <strong>{it.title || it.doc_type || 'Document'}</strong>
                  {' — '}{it.doc_type || '—'}
                  {it.order_number ? <em style={emStyle}> ({it.order_number})</em> : null}
                </Text>
              ))}
            </Section>
            <Section style={{ margin: '18px 0 4px' }}>
              <Button href={p.documents_url || 'https://xboomflow.com/portal/documents'} style={btn}>Open documents</Button>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial,Helvetica,sans-serif', color: '#111827' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '24px' }
const card = { background: '#ffffff', padding: '8px' }
const h2 = { margin: '0 0 12px', color: '#0c2340', fontSize: '20px' }
const p1 = { margin: '0 0 12px', fontSize: '14px', color: '#374151' }
const li = { margin: '0 0 6px', fontSize: '14px', color: '#111827' }
const emStyle = { color: '#6b7280', fontStyle: 'italic' as const }
const btn = { background: '#0c2340', color: '#ffffff', textDecoration: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 600 as const, display: 'inline-block' }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => {
    const n = Array.isArray(d?.items) ? d.items.length : 0
    return `${n} new document${n === 1 ? '' : 's'} on your portal`
  },
  displayName: 'Portal — Docs Digest (Periodic)',
  // NOT transactional — periodic informational email, respects suppression
  // and includes the unsubscribe footer.
  transactional: false,
  previewData: {
    items: [
      { title: 'Invoice #INV-2025-001', doc_type: 'invoice', order_number: 'ORD-1234' },
      { title: 'Delivery Note', doc_type: 'delivery_note', order_number: 'ORD-1234' },
    ],
    documents_url: 'https://xboomflow.com/portal/documents',
  },
} satisfies TemplateEntry