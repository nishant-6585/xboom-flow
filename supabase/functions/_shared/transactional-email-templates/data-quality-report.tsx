/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// Internal ops report — daily data-quality scan for the customer company
// field. Copy matches the legacy inline HTML in data-quality-report.

interface Finding {
  source_table?: string
  bad_value?: string
  reason?: string
  owner_name?: string | null
}
interface Props {
  report_date?: string
  total?: number
  new_count?: number
  by_reason?: Array<[string, number]>
  by_source?: Array<[string, number]>
  by_owner?: Array<[string, number]>
  sample?: Finding[]
  extra?: number
}

const Email = (p: Props = {}) => {
  const total = p.total ?? 0
  const newCount = p.new_count ?? 0
  const byReason = p.by_reason ?? []
  const bySource = p.by_source ?? []
  const byOwner = p.by_owner ?? []
  const sample = p.sample ?? []
  const extra = p.extra ?? 0
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`Data Quality Report — ${total} open company-name issues`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={hero}>
            <Heading as="h1" style={h1}>📋 Data Quality Report — Customer Company Field</Heading>
            <Text style={heroSub}>Generated {p.report_date || ''} IST</Text>
          </Section>
          <Section style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
              <tbody>
                <tr>
                  <td style={statOpen}>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: '#92400e' }}>{total}</div>
                    <div style={{ fontSize: '12px', color: '#78350f' }}>Open issues</div>
                  </td>
                  <td style={{ width: '12px' }}></td>
                  <td style={statNew}>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: '#1e40af' }}>{newCount}</div>
                    <div style={{ fontSize: '12px', color: '#1e3a8a' }}>Detected/refreshed today</div>
                  </td>
                </tr>
              </tbody>
            </table>

            <Heading as="h3" style={h3}>By Reason</Heading>
            <table style={tbl}>
              <tbody>
                {byReason.map(([k, v], i) => (
                  <tr key={i}>
                    <td style={td}>{k}</td>
                    <td style={{ ...td, textAlign: 'right' as const, fontWeight: 600 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Heading as="h3" style={h3}>By Source Table</Heading>
            <table style={tbl}>
              <tbody>
                {bySource.map(([k, v], i) => (
                  <tr key={i}>
                    <td style={{ ...td, fontFamily: 'monospace' }}>{k}</td>
                    <td style={{ ...td, textAlign: 'right' as const, fontWeight: 600 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Heading as="h3" style={h3}>By Owner (Salesperson)</Heading>
            <table style={tbl}>
              <tbody>
                {byOwner.slice(0, 15).map(([k, v], i) => (
                  <tr key={i}>
                    <td style={td}>{k}</td>
                    <td style={{ ...td, textAlign: 'right' as const, fontWeight: 600 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Heading as="h3" style={h3}>{`Sample Issues (first ${sample.length})`}</Heading>
            <table style={{ ...tbl, fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={th}>Source</th>
                  <th style={th}>Bad Value</th>
                  <th style={th}>Reason</th>
                  <th style={th}>Owner</th>
                </tr>
              </thead>
              <tbody>
                {sample.map((f, i) => (
                  <tr key={i}>
                    <td style={{ ...tdSm, fontFamily: 'monospace' }}>{f.source_table || ''}</td>
                    <td style={{ ...tdSm, color: '#dc2626' }}>{f.bad_value || ''}</td>
                    <td style={tdSm}>{f.reason || ''}</td>
                    <td style={tdSm}>{f.owner_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {extra > 0 ? (
              <Text style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>
                …and {extra} more. View the full list in the admin panel.
              </Text>
            ) : null}
            <Text style={foot}>This is an automated daily report from the XBoom Data Quality scanner.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif', color: '#1a1a1a' }
const container = { maxWidth: '820px', margin: '0 auto', padding: '20px' }
const hero = { background: '#6366f1', color: '#ffffff', padding: '28px 32px', borderRadius: '12px 12px 0 0' }
const h1 = { margin: 0, fontSize: '22px', color: '#ffffff' }
const heroSub = { margin: '8px 0 0', opacity: 0.9, fontSize: '13px', color: '#ffffff' }
const card = { background: '#ffffff', padding: '24px 32px', borderRadius: '0 0 12px 12px', border: '1px solid #e5e7eb', borderTop: 'none' }
const statOpen = { background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', padding: '16px', textAlign: 'center' as const, width: '50%' }
const statNew = { background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: '8px', padding: '16px', textAlign: 'center' as const, width: '50%' }
const h3 = { fontSize: '14px', color: '#374151', borderBottom: '2px solid #e5e7eb', paddingBottom: '6px', margin: '18px 0 8px' }
const tbl = { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px', marginBottom: '10px' }
const td = { padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }
const tdSm = { padding: '6px 8px', borderBottom: '1px solid #f3f4f6', fontSize: '12px' }
const th = { padding: '8px', textAlign: 'left' as const, borderBottom: '1px solid #e5e7eb' }
const foot = { fontSize: '12px', color: '#9ca3af', marginTop: '32px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `📋 Data Quality Report — ${d?.total ?? 0} open company-name issues`,
  displayName: 'Ops — Data Quality Report (Internal)',
  transactional: true,
  previewData: {
    report_date: '05/07/2026, 6:30:00 pm',
    total: 42,
    new_count: 7,
    by_reason: [['Missing company', 20], ['Invalid characters', 12], ['Duplicate variant', 10]],
    by_source: [['leads', 25], ['companies', 17]],
    by_owner: [['Nishant', 15], ['Vishal', 10], ['Unassigned', 17]],
    sample: [
      { source_table: 'leads', bad_value: 'test', reason: 'Placeholder value', owner_name: 'Nishant' },
    ],
    extra: 41,
  },
} satisfies TemplateEntry