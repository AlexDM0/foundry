/**
 * The moves on a ticket document's agent. What matters: a Hatch move is refused `document-agent-not-live` unless its job is the one
 * document agent on the board for its ticket's document, so a move from another job, another ticket's agent or a builder never reaches the
 * document; a proposal's untrusted payload is checked before the Board sees it, and lands as the document's open proposal with the spec
 * version the plan agent was given, its attempt; ready marks the head with the review on and approves it as the pipeline with the review
 * off; an effect reading needs a version the document holds and a live Hephaestus, and only the agent's own reading is marked as asked by
 * the agent; and a turn stop closes the input of a running agent only, keeping its job.
 */
import { describe, expect, test } from 'bun:test';

import type { Job }                        from '../../domain/tracker-model/@types/Job.ts';
import type { LoadedTicketDocumentRecord } from '../../domain/tracker-model/@types/TicketDocument.ts';
import { PipelineUtil }                    from '../../domain/tracker-model/utils/PipelineUtil.ts';
import { TicketDocumentVersionUtil }       from '../../domain/tracker-model/utils/TicketDocumentVersionUtil.ts';
import type { ControlCommand }             from '../../shared/@types/ControlCommand.ts';
import type { EffectReadingRequest }       from '../../shared/@types/EffectReading.ts';
import { OperationRefusal }                from '../../shared/OperationRefusal.ts';
import {
  boardFixture,
  refusalDetailOf,
  ticketFixture,
  type BoardFixture
} from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                                                        from '../../testing/EchoedControlContext.ts';
import { createFixtureRecordAllocation, NO_UNREADABLE_RECORDS }                          from '../../testing/FixtureRecordAllocation.ts';
import { documentAgentJobFixture, SNAPSHOT_COMMIT_FIXTURE, ticketDocumentRecordFixture } from '../../testing/TicketDocumentFixtures.ts';
import type { BoardTransaction }                                                         from '../tracker/BoardTransaction.ts';
import { workspacePathsFor }                                                             from '../tracker/Workspace.ts';
import { ControlService }                                                                from './ControlService.ts';

const CHANGED_AT = '2026-11-24T11:00:00.000Z';

const SPEC_TEXT = '# Basket\n\n## Acceptance\n\nA1. Alex Example sees the total.\n';

const PLAN_TEXT = '# Plan\n\nChange `src/Basket.ts`.\n';

function documentsBoard(jobs: Job[], records: LoadedTicketDocumentRecord[] = [specAndPlanRecord('004')], reviewIsOn = true): BoardFixture {
  const fixture = boardFixture({
    tickets:               [ticketFixture({ id: '004', status: 'draft' }), ticketFixture({ id: '005', status: 'draft' })],
    ticketDocumentRecords: records,
    ...(reviewIsOn ? {} : { pipeline: { ...PipelineUtil.minimalPipelineOf(), approvals: { spec: false, plan: false } } }),
  });
  fixture.progress.jobs = jobs;
  return fixture;
}

function specAndPlanRecord(ticketId: string): LoadedTicketDocumentRecord {
  return ticketDocumentRecordFixture(ticketId, [
    { kind: 'spec', texts: [SPEC_TEXT, `${SPEC_TEXT}2. Alex Example pays.\n`], approvals: [{ number: 2 }] },
    { kind: 'plan', texts: [PLAN_TEXT] },
  ]);
}

function changeOf(fixture: BoardFixture): BoardTransaction {
  return {
    board:                          fixture.board,
    workspace:                      workspacePathsFor('/example-agency/storefront'),
    at:                             CHANGED_AT,
    records:                        createFixtureRecordAllocation(fixture.board),
    unreadableRecords:              NO_UNREADABLE_RECORDS,
    unreadablePipeline:             null,
    storedLogEntryCount:            0,
    storedLogRecords:               [],
    deleteAllTicketFilesAfterwards: () => undefined,
  };
}

function readingsAsked(): { requests: EffectReadingRequest[]; context: typeof ECHOED_CONTROL_CONTEXT } {
  const requests: EffectReadingRequest[] = [];
  return {
    requests,
    context: {
      ...ECHOED_CONTROL_CONTEXT,
      effectReadings: { readingsOf: () => [], request: (request) => requests.push(request), onChanged: () => () => undefined },
    },
  };
}

function apply(fixture: BoardFixture, command: ControlCommand, context = ECHOED_CONTROL_CONTEXT): unknown {
  return ControlService.apply(command, changeOf(fixture), context).result;
}

function proposalsOf(fixture: BoardFixture, ticketId = '004'): readonly unknown[] {
  return fixture.board.ticketDocuments().documentOf(ticketId, 'plan')?.proposals ?? [];
}

const PROPOSAL: ControlCommand = {
  kind:               'ticket-document-agent-propose',
  jobId:              'J9',
  constitutionCommit: SNAPSHOT_COMMIT_FIXTURE,
  baseVersion:        1,
  edits:              [{
    fromLine: 3, toLine: 3, originalLines: ['Change `src/Basket.ts`.'], replacementLines: ['Change `src/basket/Basket.ts`.']
  }],
  summary: 'Name the basket folder',
  answers: 'M2',
};

describe('the live agent check', () => {
  test.each([
    ['an unknown job', [], 'J9'],
    ['a builder of the ticket', [documentAgentJobFixture('004', 'plan', { kind: 'build', role: 'builder' })], 'J9'],
    ['an effect reader of the ticket', [documentAgentJobFixture('004', 'plan', { kind: 'effect-reading', role: 'effect-reader' })], 'J9'],
  ] as const)('a proposal from %s is refused and reaches nothing', (_caseName, jobs, jobId) => {
    const fixture = documentsBoard([...jobs]);
    const detail  = refusalDetailOf(() => apply(fixture, { ...PROPOSAL, jobId }));
    expect(detail.reason).toBe('document-agent-not-live');
    expect(proposalsOf(fixture)).toEqual([]);
  });

  test('another ticket\'s agent is refused for a ticket whose live agent is another job', () => {
    const fixture = documentsBoard(
      [documentAgentJobFixture('004', 'plan', { id: 'J9' }), documentAgentJobFixture('005', 'plan', { id: 'J10' })],
      [specAndPlanRecord('004')],
    );
    expect(refusalDetailOf(() => apply(fixture, { ...PROPOSAL, jobId: 'J10' }))).toEqual({
      reason: 'document-agent-not-live', ticketId: '005', document: 'plan', jobId: 'J10'
    });
  });

  test('a move without the stamped snapshot commit is refused', () => {
    const fixture = documentsBoard([documentAgentJobFixture('004', 'plan')]);
    expect(refusalDetailOf(() => apply(fixture, { kind: 'ticket-document-agent-ready', jobId: 'J9' })).reason).toBe('document-agent-not-live');
  });
});

describe('a proposal', () => {
  test('lands as the document\'s open proposal with its edits, the message it answers and the spec version its plan agent was given', () => {
    const fixture = documentsBoard([documentAgentJobFixture('004', 'plan', { attempt: 2 })]);

    const result = apply(fixture, PROPOSAL) as { proposal: unknown; logged: readonly { kind: string }[] };

    const proposal = {
      proposalId: 'P1',
      jobId:      'J9',
      baseNumber: 1,
      edits:      [{
        fromLine: 3, toLine: 3, originalLines: ['Change `src/Basket.ts`.'], replacementLines: ['Change `src/basket/Basket.ts`.']
      }],
      summary:          'Name the basket folder',
      answersMessageId: 'M2',
      forSpecNumber:    2,
      state:            'proposed',
      at:               CHANGED_AT,
    };
    expect(proposalsOf(fixture)).toEqual([proposal]);
    expect(result.proposal).toEqual(proposal);
    expect(result.logged.map((record) => record.kind)).toEqual(['ticket-document-proposed']);
    expect(fixture.board.ticketDocuments().documentOf('004', 'plan')?.versions).toHaveLength(1);
  });

  test.each([
    ['baseVersion', { baseVersion: 0 }],
    ['edits', {
      edits: [{
        fromLine: 0, toLine: 0, originalLines: [], replacementLines: []
      }]
    }],
    ['edits', {
      edits: [{
        fromLine: 4, toLine: 2, originalLines: [], replacementLines: []
      }]
    }],
    ['edits', { edits: 'replace line 3' }],
    ['summary', { summary: ' ' }],
    ['answers', { answers: 'C2' }],
  ] as const)('a malformed %s is refused before the Board sees it', (field, overrides) => {
    const fixture = documentsBoard([documentAgentJobFixture('004', 'plan')]);
    let thrown: unknown = null;
    try {
      apply(fixture, { ...PROPOSAL, ...overrides } as ControlCommand);
    } catch (error) {
      thrown = error;
    }
    expect(thrown instanceof OperationRefusal && thrown.detail).toEqual({ kind: 'malformed-setup-command', commandKind: 'ticket-document-agent-propose', field });
    expect(proposalsOf(fixture)).toEqual([]);
  });
});

describe('ready', () => {
  const READY: ControlCommand = { kind: 'ticket-document-agent-ready', jobId: 'J9', constitutionCommit: SNAPSHOT_COMMIT_FIXTURE };

  function specOnlyRecord(specText: string): LoadedTicketDocumentRecord {
    return ticketDocumentRecordFixture('004', [{ kind: 'spec', texts: [specText] }]);
  }

  test('with the review on, marks the head ready for User and approves nothing', () => {
    const fixture = documentsBoard([documentAgentJobFixture('004', 'spec')], [specOnlyRecord(SPEC_TEXT)]);
    expect(apply(fixture, READY)).toEqual({ jobId: 'J9', logged: [] });
    const spec = fixture.board.ticketDocuments().documentOf('004', 'spec');
    expect(spec?.readyAtNumber).toBe(1);
    expect(spec?.approvals).toEqual([]);
  });

  test('with the review off, the pipeline approves the head on the stamped snapshot commit', () => {
    const fixture = documentsBoard([documentAgentJobFixture('004', 'spec')], [specOnlyRecord(SPEC_TEXT)], false);
    apply(fixture, READY);
    expect(fixture.board.ticketDocuments().documentOf('004', 'spec')?.approvals).toEqual([{
      number: 1, contentHash: TicketDocumentVersionUtil.contentHashOf(SPEC_TEXT), by: 'pipeline', at: CHANGED_AT, constitutionCommit: SNAPSHOT_COMMIT_FIXTURE
    }]);
  });

  test('a spec whose Acceptance is not numbered as A1. is refused and stays unready', () => {
    const fixture = documentsBoard([documentAgentJobFixture('004', 'spec')], [specOnlyRecord('# Basket\n\n## Acceptance\n\n1. Alex Example sees the total.\n')]);
    expect(refusalDetailOf(() => apply(fixture, READY))).toEqual({ reason: 'spec-acceptance-unnumbered', ticketId: '004' });
    expect(fixture.board.ticketDocuments().documentOf('004', 'spec')?.readyAtNumber).toBeUndefined();
  });
});

describe('an effect reading', () => {
  test('the agent asks for a version its document holds, marked as asked by the agent', () => {
    const { requests, context } = readingsAsked();
    apply(documentsBoard([documentAgentJobFixture('004', 'spec')]), { kind: 'ticket-document-agent-effect-read', jobId: 'J9', version: 2 }, context);
    expect(requests).toEqual([{
      ticketId: '004', document: 'spec', versionNumber: 2, requestedByAgent: true
    }]);
  });

  test('User asks for a version of a ticket\'s document, which no agent asked', () => {
    const { requests, context } = readingsAsked();
    apply(documentsBoard([]), {
      kind: 'ticket-document-effect-read', ticketReference: '#4', document: 'plan', version: 1
    }, context);
    expect(requests).toEqual([{
      ticketId: '004', document: 'plan', versionNumber: 1, requestedByAgent: false
    }]);
  });

  test('a version the document does not hold is refused naming its head, and a ticket with no record is refused', () => {
    const { requests, context } = readingsAsked();
    const fixture = documentsBoard([]);
    expect(refusalDetailOf(() => apply(fixture, {
      kind: 'ticket-document-effect-read', ticketReference: '4', document: 'spec', version: 3
    }, context))).toEqual({
      reason: 'document-version-moved', ticketId: '004', document: 'spec', version: 3, headNumber: 2
    });
    expect(refusalDetailOf(() => apply(fixture, {
      kind: 'ticket-document-effect-read', ticketReference: '5', document: 'spec', version: 1
    }, context))).toEqual({ reason: 'ticket-has-no-documents', ticketId: '005' });
    expect(requests).toEqual([]);
  });

  test('outside a live Hephaestus the reading is refused, since only it runs readings', () => {
    let thrown: unknown = null;
    try {
      apply(documentsBoard([]), {
        kind: 'ticket-document-effect-read', ticketReference: '4', document: 'spec', version: 1
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown instanceof OperationRefusal && thrown.detail).toEqual({ kind: 'hephaestus-control-is-runtime-only', commandKind: 'ticket-document-effect-read' });
  });
});

describe('a turn stop', () => {
  test('closes the input of the running agent and keeps its job', () => {
    const fixture = documentsBoard([documentAgentJobFixture('004', 'spec')]);
    expect(apply(fixture, { kind: 'ticket-document-turn-stop', ticketReference: '4', document: 'spec' })).toEqual({ changed: true, jobId: 'J9' });
    expect(fixture.board.jobById('J9')?.state).toBe('stopping');
  });

  test('an agent that waits, or no agent, has no turn to stop', () => {
    const fixture = documentsBoard([documentAgentJobFixture('004', 'spec', { state: 'awaiting-answer' })]);
    expect(apply(fixture, { kind: 'ticket-document-turn-stop', ticketReference: '4', document: 'spec' })).toEqual({ changed: false, jobId: 'J9' });
    expect(apply(fixture, { kind: 'ticket-document-turn-stop', ticketReference: '4', document: 'plan' })).toEqual({ changed: false, jobId: null });
    expect(fixture.board.jobById('J9')?.state).toBe('awaiting-answer');
  });
});
