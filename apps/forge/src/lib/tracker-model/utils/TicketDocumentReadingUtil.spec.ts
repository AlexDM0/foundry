/**
 * Which version of each document a builder or reviewer reads: `always` the approved head, `if-person-approved` the newest a person approved
 * (none for a plan approved on an older spec), `never` nothing; and the plan as the Brief puts every line under one `## Brief`.
 */
import { describe, expect, test } from 'bun:test';

import { loadedRecordFixture }       from '../../../testing/TicketDocumentRecordFixtures.ts';
import type { Pipeline }             from '../@types/Pipeline.ts';
import { PipelineUtil }              from './PipelineUtil.ts';
import { TicketDocumentReadingUtil } from './TicketDocumentReadingUtil.ts';

const SPEC_V1 = '## Acceptance\n\nA1. The basket shows.\n';
const SPEC_V2 = '## Acceptance\n\nA1. The basket shows.\nA2. The total shows.\n';
const PLAN_V1 = '## Files\n\nWork belongs in: apps/web/src/Basket.ts\n';
const PLAN_V2 = '## Files\n\nWork belongs in: apps/web/src/Basket.ts apps/web/src/Total.ts\n';

const APPROVED_SPEC = { texts: [SPEC_V1], approvals: [{ number: 1, by: 'person' as const }] };

function versionsReadBy(role: 'builder' | 'reviewer', record: ReturnType<typeof loadedRecordFixture>, pipeline: Pipeline | null = null): string[] {
  return TicketDocumentReadingUtil.readingsForRoleOf(record, pipeline, role).map((reading) => `${reading.document} ${reading.versionNumber} ${reading.approvedBy}`);
}

describe('readingsForRoleOf', () => {
  test('always gives each approved head: the builder reads both', () => {
    const record = loadedRecordFixture('004', { spec: APPROVED_SPEC, plan: { texts: [PLAN_V1], approvals: [{ number: 1, by: 'pipeline', onSpecNumber: 1 }] } });
    expect(versionsReadBy('builder', record)).toEqual(['spec 1 person', 'plan 1 pipeline']);
  });

  test('if-person-approved gives no plan only the pipeline approved', () => {
    const record = loadedRecordFixture('004', { spec: APPROVED_SPEC, plan: { texts: [PLAN_V1], approvals: [{ number: 1, by: 'pipeline', onSpecNumber: 1 }] } });
    expect(versionsReadBy('reviewer', record)).toEqual(['spec 1 person']);
  });

  test('if-person-approved gives the version a person approved when the plan changed since', () => {
    const record = loadedRecordFixture('004', { spec: APPROVED_SPEC, plan: { texts: [PLAN_V1, PLAN_V2], approvals: [{ number: 1, by: 'person', onSpecNumber: 1 }] } });
    const [, plan] = TicketDocumentReadingUtil.readingsForRoleOf(record, null, 'reviewer');
    expect(plan).toMatchObject({ document: 'plan', versionNumber: 1, text: PLAN_V1 });
  });

  test('if-person-approved gives no plan approved on an older spec than the one given', () => {
    const record = loadedRecordFixture('004', {
      spec: { texts: [SPEC_V1, SPEC_V2], approvals: [{ number: 1, by: 'person' }, { number: 2, by: 'person' }] },
      plan: { texts: [PLAN_V1], approvals: [{ number: 1, by: 'person', onSpecNumber: 1 }] },
    });
    expect(versionsReadBy('reviewer', record)).toEqual(['spec 2 person']);
  });

  test('never gives nothing', () => {
    const record = loadedRecordFixture('004', { spec: APPROVED_SPEC, plan: { texts: [PLAN_V1], approvals: [{ number: 1, by: 'person', onSpecNumber: 1 }] } });
    const pipeline: Pipeline = { ...PipelineUtil.minimalPipelineOf(), agents: { builder: { documents: { plan: 'never' } } } };
    expect(versionsReadBy('builder', record, pipeline)).toEqual(['spec 1 person']);
  });
});

describe('the plan as the Brief', () => {
  test('gives the plan\'s approved head, and none before an approval stands there', () => {
    expect(TicketDocumentReadingUtil.briefTextOf(loadedRecordFixture('004', { spec: APPROVED_SPEC, plan: { texts: [PLAN_V1] } }))).toBeNull();
    const record = loadedRecordFixture('004', { spec: APPROVED_SPEC, plan: { texts: [PLAN_V1], approvals: [{ number: 1, by: 'person', onSpecNumber: 1 }] } });
    expect(TicketDocumentReadingUtil.briefTextOf(record)).toBe(PLAN_V1);
  });

  test('puts every plan line under one `## Brief`, its own headings read as plain lines', () => {
    expect(TicketDocumentReadingUtil.bodyWithPlanAsBriefOf(PLAN_V1)).toBe('## Brief\n\nFiles\n\nWork belongs in: apps/web/src/Basket.ts\n');
  });
});
