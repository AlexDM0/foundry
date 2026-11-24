/**
 * When the Playbook starts a ticket document's agent. What matters: the spec agent starts once the record opens with no spec, as the
 * Board's open move leaves it; the plan
 * agent once the spec is approved, and again for a newer approved spec while no edit for it is open, once per spec version; a queued
 * message starts the agent, or resumes the one waiting for it; nothing starts while an agent works the document, once an agent picked the
 * ticket up, or by itself after an agent failed; and a document agent's turn is first in line for a slot, before any build.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import {
  documentAgentJobFixture,
  documentMessageFixture,
  ticketDocumentRecordFixture,
  type DocumentFixture
} from '../../testing/TicketDocumentFixtures.ts';
import type { Job }          from './@types/Job.ts';
import type { LogRecord }    from './@types/LogRecord.ts';
import type { PlaybookStep } from './@types/PlaybookStep.ts';
import type { TicketStatus } from './@types/Ticket.ts';
import { Playbook }          from './Playbook.ts';
import {
  factsWith,
  FIXTURE_AT,
  FIXTURE_LIMITS,
  jobFixture,
  LIVE_ASSISTANT,
  ticketOf
} from './testing/LifecycleFixtures.ts';

const SPEC_TEXT = '# Basket\n\n## Acceptance\n\n1. Alex Example sees the total.\n';

const NEWER_SPEC_TEXT = `${SPEC_TEXT}2. Alex Example pays.\n`;

const PLAN_TEXT = '# Plan\n\nChange `src/Basket.ts`.\n';

interface DocumentsCase {
  documents: readonly DocumentFixture[];
  status?:   TicketStatus;
  jobs?:     readonly Job[];
  log?:      readonly LogRecord[];
}

function stepsOf(documentsCase: DocumentsCase): PlaybookStep[] {
  return Playbook.nextStepsOf(factsWith({
    tickets:         [ticketOf('004', documentsCase.status ?? 'draft')],
    jobs:            [LIVE_ASSISTANT, ...documentsCase.jobs ?? []],
    logRecords:      documentsCase.log ?? [],
    ticketDocuments: Playbook.ticketDocumentFactsOf([ticketDocumentRecordFixture('004', documentsCase.documents)]),
  }), FIXTURE_LIMITS);
}

function documentLaunchesOf(steps: readonly PlaybookStep[]): PlaybookStep[] {
  return steps.filter((step) => step.kind === 'launch-document-agent');
}

function agentLaunched(jobId: string, role: 'spec-agent' | 'plan-agent', attempt: number, outcome: 'closed' | 'failed' | null = 'closed'): LogRecord[] {
  return [
    {
      kind:   'job-launched',
      jobId,
      fields: {
        kind: 'document-agent', role, ticketIds: ['004'], attempt, target: null, parentJobId: null
      },
      at: FIXTURE_AT
    },
    ...outcome === null ? [] : [{
      kind: 'job-ended', jobId, fields: { outcome, deniedPermissions: [] }, at: FIXTURE_AT
    } as const],
  ];
}

const APPROVED_SPEC: DocumentFixture = { kind: 'spec', texts: [SPEC_TEXT], approvals: [{ number: 1 }] };

describe('the spec agent', () => {
  test('starts once the record opens with no spec', () => {
    expect(documentLaunchesOf(stepsOf({ documents: [] }))).toEqual([{ kind: 'launch-document-agent', ticketId: '004', document: 'spec' }]);
  });

  test('starts once the Board\'s open move made the record, its spec and plan both unwritten', () => {
    const { board } = boardFixture({ tickets: [ticketFixture({ id: '004', status: 'draft' })] });
    board.ticketDocuments().open('004', FIXTURE_AT);
    const openedRecord = board.ticketDocumentRecordOf('004');
    if (openedRecord === null) throw new Error('the open move made no record');
    const ticketDocuments = Playbook.ticketDocumentFactsOf([openedRecord]);
    const steps = Playbook.nextStepsOf(factsWith({ tickets: [ticketOf('004', 'draft')], jobs: [LIVE_ASSISTANT], ticketDocuments }), FIXTURE_LIMITS);
    expect(documentLaunchesOf(steps)).toEqual([{ kind: 'launch-document-agent', ticketId: '004', document: 'spec' }]);
  });

  test('starts by itself only once: a spec agent launched before starts again only for a message', () => {
    expect(documentLaunchesOf(stepsOf({ documents: [], log: agentLaunched('J5', 'spec-agent', 1) }))).toEqual([]);
    const withMessage = stepsOf({ documents: [{ kind: 'spec', messages: [documentMessageFixture('M1')] }], log: agentLaunched('J5', 'spec-agent', 1) });
    expect(documentLaunchesOf(withMessage)).toEqual([{ kind: 'launch-document-agent', ticketId: '004', document: 'spec' }]);
  });

  test('a spec with a version and no message starts nothing', () => {
    expect(documentLaunchesOf(stepsOf({ documents: [{ kind: 'spec', texts: [SPEC_TEXT] }] }))).toEqual([]);
  });
});

describe('the plan agent', () => {
  test('starts once the spec is approved at its head, carrying no plan yet', () => {
    expect(documentLaunchesOf(stepsOf({ documents: [APPROVED_SPEC] }))).toEqual([{ kind: 'launch-document-agent', ticketId: '004', document: 'plan' }]);
  });

  test('waits while the spec is unapproved', () => {
    expect(documentLaunchesOf(stepsOf({ documents: [{ kind: 'spec', texts: [SPEC_TEXT] }] }))).toEqual([]);
  });

  test('starts again once a newer spec is approved and the plan is out of date', () => {
    const documents: DocumentFixture[] = [
      { kind: 'spec', texts: [SPEC_TEXT, NEWER_SPEC_TEXT], approvals: [{ number: 1 }, { number: 2 }] },
      { kind: 'plan', texts: [PLAN_TEXT], approvals: [{ number: 1, onSpecText: SPEC_TEXT }] },
    ];
    expect(documentLaunchesOf(stepsOf({ documents, log: agentLaunched('J5', 'plan-agent', 1) })))
      .toEqual([{ kind: 'launch-document-agent', ticketId: '004', document: 'plan' }]);
  });

  test('starts once per approved spec version, and not while its edit for that spec is open', () => {
    const outOfDate: DocumentFixture[] = [
      { kind: 'spec', texts: [SPEC_TEXT, NEWER_SPEC_TEXT], approvals: [{ number: 1 }, { number: 2 }] },
      { kind: 'plan', texts: [PLAN_TEXT], approvals: [{ number: 1, onSpecText: SPEC_TEXT }] },
    ];
    expect(documentLaunchesOf(stepsOf({ documents: outOfDate, log: [...agentLaunched('J5', 'plan-agent', 1), ...agentLaunched('J6', 'plan-agent', 2)] }))).toEqual([]);
    const withOpenEdit: DocumentFixture[] = [outOfDate[0] as DocumentFixture, {
      ...outOfDate[1] as DocumentFixture,
      proposals: [{
        proposalId: 'P1', jobId: 'J5', baseNumber: 1, edits: [], summary: 'For spec 2', forSpecNumber: 2, state: 'proposed', at: FIXTURE_AT
      }],
    }];
    expect(documentLaunchesOf(stepsOf({ documents: withOpenEdit, log: agentLaunched('J5', 'plan-agent', 1) }))).toEqual([]);
  });
});

describe('a queued message', () => {
  test('starts the agent of its document', () => {
    const documents: DocumentFixture[] = [APPROVED_SPEC, { kind: 'plan', texts: [PLAN_TEXT], messages: [documentMessageFixture('M1')] }];
    expect(documentLaunchesOf(stepsOf({ documents, log: agentLaunched('J5', 'plan-agent', 1) })))
      .toEqual([{ kind: 'launch-document-agent', ticketId: '004', document: 'plan' }]);
  });

  test('resumes the agent waiting for it, and starts nothing while the agent works', () => {
    const documents: DocumentFixture[] = [{ kind: 'spec', texts: [SPEC_TEXT], messages: [documentMessageFixture('M1')] }];
    expect(documentLaunchesOf(stepsOf({ documents, jobs: [documentAgentJobFixture('004', 'spec', { state: 'awaiting-answer' })] })))
      .toEqual([{ kind: 'launch-document-agent', ticketId: '004', document: 'spec' }]);
    for (const state of ['launching', 'running', 'stopping', 'interrupted'] as const) {
      expect(documentLaunchesOf(stepsOf({ documents, jobs: [documentAgentJobFixture('004', 'spec', { state })] })), state).toEqual([]);
    }
  });

  test('starts the agent after a failed one, which nothing else starts again', () => {
    expect(documentLaunchesOf(stepsOf({ documents: [], log: agentLaunched('J5', 'spec-agent', 1, 'failed') }))).toEqual([]);
    const documents: DocumentFixture[] = [{ kind: 'spec', messages: [documentMessageFixture('M1')] }];
    expect(documentLaunchesOf(stepsOf({ documents, log: agentLaunched('J5', 'spec-agent', 1, 'failed') }))).toHaveLength(1);
  });
});

describe('the ticket and the slots', () => {
  test.each(['in-progress', 'in-review', 'delivered'] as const)('a ticket %s starts no document agent', (status) => {
    expect(documentLaunchesOf(stepsOf({ documents: [{ kind: 'spec', messages: [documentMessageFixture('M1')] }], status }))).toEqual([]);
  });

  test('a document agent is first in line: it takes the free slot before a ready build, and waits when none is free', () => {
    const documents = [ticketDocumentRecordFixture('004', [])];
    const facts = factsWith({
      tickets:          [ticketOf('001', 'committed'), ticketOf('004', 'draft')],
      concurrencyLimit: 1,
      ticketDocuments:  Playbook.ticketDocumentFactsOf(documents),
    });
    const steps = Playbook.nextStepsOf(facts, FIXTURE_LIMITS).filter((step) => step.kind === 'launch-build' || step.kind === 'launch-document-agent');
    expect(steps).toEqual([{ kind: 'launch-document-agent', ticketId: '004', document: 'spec' }]);
    const busy = factsWith({ ...facts, jobs: [LIVE_ASSISTANT, jobFixture({ id: 'J2', ticketIds: ['002'] })] });
    expect(documentLaunchesOf(Playbook.nextStepsOf(busy, FIXTURE_LIMITS))).toEqual([]);
  });
});
