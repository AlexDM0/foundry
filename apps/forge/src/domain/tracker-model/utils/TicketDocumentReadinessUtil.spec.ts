/**
 * The readiness of a ticket by its documents. What matters: a ticket without a record is judged by its body alone; with one, the spec's
 * head is read for a numbered Acceptance while the Brief is not judged, a spec without a version lacks its Acceptance, and each document
 * not approved at its head is a gap, a plan approved on an older spec `plan-out-of-date`; the hold judges the plan only when asked.
 */
import { describe, expect, test } from 'bun:test';

import { ticketFixture }               from '../../../testing/BoardFixtures.ts';
import { loadedRecordFixture }         from '../../../testing/TicketDocumentRecordFixtures.ts';
import type { ReadinessGap }           from '../@types/Ticket.ts';
import { TicketDocumentReadinessUtil } from './TicketDocumentReadinessUtil.ts';

const SPEC_V1 = '## Acceptance\n\nA1. The basket shows.\n';
const SPEC_V2 = '## Acceptance\n\nA1. The basket shows.\nA2. The total shows.\n';
const PLAN    = '## Files\n\nWork belongs in: apps/web/src/Basket.ts\n';

function bodyGapsOf(body: string): ReadinessGap[] {
  return [...(/^A\d+\./mu.test(body) ? [] : ['acceptance-unnumbered' as const]), ...(body.includes('## Brief') ? [] : ['brief-missing' as const])];
}

const ticket = ticketFixture({ id: '004', status: 'draft' });

describe('readinessGapsOf', () => {
  test('judges a ticket without a record by its body', () => {
    expect(TicketDocumentReadinessUtil.readinessGapsOf(ticket, undefined, bodyGapsOf)).toEqual(['acceptance-unnumbered', 'brief-missing']);
  });

  test('reads a spec without a version as lacking its Acceptance, and both documents as unapproved', () => {
    const record = loadedRecordFixture('004', { spec: { texts: [] }, plan: { texts: [] } });
    expect(TicketDocumentReadinessUtil.readinessGapsOf(ticket, record, bodyGapsOf)).toEqual(['acceptance-unnumbered', 'spec-unapproved', 'plan-unapproved']);
  });

  test('finds no gap once both are approved at their heads, the plan on the spec\'s, and never judges the Brief', () => {
    const record = loadedRecordFixture('004', {
      spec: { texts: [SPEC_V1], approvals: [{ number: 1, by: 'person' }] },
      plan: { texts: [PLAN], approvals: [{ number: 1, by: 'person', onSpecNumber: 1 }] },
    });
    expect(TicketDocumentReadinessUtil.readinessGapsOf(ticket, record, bodyGapsOf)).toEqual([]);
  });

  test('reads a plan approved on an older spec as out of date', () => {
    const record = loadedRecordFixture('004', {
      spec: { texts: [SPEC_V1, SPEC_V2], approvals: [{ number: 1, by: 'person' }, { number: 2, by: 'person' }] },
      plan: { texts: [PLAN], approvals: [{ number: 1, by: 'person', onSpecNumber: 1 }] },
    });
    expect(TicketDocumentReadinessUtil.readinessGapsOf(ticket, record, bodyGapsOf)).toEqual(['plan-out-of-date']);
  });
});

describe('documentGapsOf', () => {
  test('judges the plan only when asked, as the hold of a builder that never reads it', () => {
    const record = loadedRecordFixture('004', { spec: { texts: [SPEC_V1], approvals: [{ number: 1, by: 'person' }] }, plan: { texts: [PLAN] } });
    expect(TicketDocumentReadinessUtil.documentGapsOf(record, true)).toEqual(['plan-unapproved']);
    expect(TicketDocumentReadinessUtil.documentGapsOf(record, false)).toEqual([]);
  });
});
