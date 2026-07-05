/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// Internal ops alert — one or more lead sources have stopped syncing.
// Copy matches the legacy inline HTML in sync-health-check/index.ts.

interface Row {
  label?: string
  last_record_at?: string | null
  hours_since?: number | null
  threshold_hours?: number
}
interface Props {
  stale?: Row[]
  healthy?: Row[]
  generated_at?: string
}

const fmtDate = (v?: string | null) => (v ? new Date(v).toUTCString() : 'Never')
const fmtIdle = (h?: number | null) => (h == null ? '—' : `${h.toFixed(1)} h`)

const RowCells = ({ r, color }: { r: Row; color: string }) => (
  <tr>
    <td style={{ padding: '8px 12px', borderBottom: '1px solid #eee', fontWeight: 600, color }}>{r.label || '—'}</td>
    <td style={{ padding: '8px 12px', borderBottom: '1px solid #eee' }}>{fmtDate(r.last_record_at ?? null)}</td>
    <td style={{ padding: '8px 12px', borderBottom: '1px solid #eee' }}>{fmtIdle(r.hours_since ?? null)}</td>
    <td style={{ padding: '8px 12px', borderBottom: '1px solid #eee' }}>{(r.threshold_hours ?? 0)} h</td>
  </tr>
)

const Email = (p: Props = {}) => {
  const stale = Array.isArray(p.stale) ? p.stale : []
  const healthy = Array.isArray(p.healthy) ? p.healthy : []
  const staleCount = stale.length
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${staleCount} lead source${staleCount === 1 ? '' : 's'} not syncing`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading as="h2" style={h2}>⚠️ Lead Sync Alert</Heading>
            <Text style={p1}>
              {staleCount} lead source{staleCount === 1 ? ' has' : 's have'} stopped syncing. Please investigate immediately.
            </Text>
            <Heading as="h3" style={h3Red}>Stale Sources</Heading>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#fef2f2' }}>
                  <th align="left" style={th}>Source</th>
                  <th align="left" style={th}>Last Record</th>
                  <th align="left" style={th}>Idle</th>
                  <th align="left" style={th}>Threshold</th>
                </tr>
              </thead>
              <tbody>
                {stale.map((r, i) => <RowCells key={i} r={r} color="#dc2626" />)}
              </tbody>
            </table>
            {healthy.length > 0 ? (
              <>
                <Heading as="h3" style={h3Green}>Healthy Sources</Heading>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#f0fdf4' }}>
                      <th align="left" style={th}>Source</th>
                      <th align="left" style={th}>Last Record</th>
                      <th align="left" style={th}>Idle</th>
                      <th align="left" style={th}>Threshold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {healthy.map((r, i) => <RowCells key={i} r={r} color="#16a34a" />)}
                  </tbody>
                </table>
              </>
            ) : null}
            <Text style={foot}>Generated at {p.generated_at || new Date().toUTCString()} by Xboom Sync Monitor.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial,Helvetica,sans-serif', color: '#111827' }
const container = { maxWidth: '720px', margin: '0 auto', padding: '24px' }
const card = { background: '#ffffff', borderRadius: '8px', padding: '24px', border: '1px solid #e5e7eb' }
const h2 = { margin: '0 0 8px', color: '#dc2626', fontSize: '20px' }
const p1 = { margin: '0 0 16px', color: '#374151', fontSize: '14px' }
const h3Red = { color: '#dc2626', margin: '20px 0 8px', fontSize: '15px' }
const h3Green = { color: '#16a34a', margin: '24px 0 8px', fontSize: '15px' }
const th = { padding: '8px 12px' as const }
const foot = { color: '#6b7280', fontSize: '12px', marginTop: '24px' }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => {
    const n = Array.isArray(d?.stale) ? d.stale.length : 0
    return `🚨 [Xboom] ${n} lead source${n === 1 ? '' : 's'} not syncing`
  },
  displayName: 'Ops — Sync Health Alert (Internal)',
  transactional: true,
  previewData: {
    stale: [
      { label: 'Interakt', last_record_at: '2026-07-01T10:00:00Z', hours_since: 96.4, threshold_hours: 24 },
    ],
    healthy: [
      { label: 'WooCommerce (Xboom Website)', last_record_at: '2026-07-05T12:00:00Z', hours_since: 1.2, threshold_hours: 12 },
    ],
    generated_at: 'Sun, 05 Jul 2026 13:00:00 GMT',
  },
} satisfies TemplateEntry