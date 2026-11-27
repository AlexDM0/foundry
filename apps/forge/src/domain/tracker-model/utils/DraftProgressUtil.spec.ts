/**
 * Where a ticket being written stands. What matters: a spec-then-plan draft is at its spec until the spec is approved, then at its plan,
 * and in review while that document's head waits for User's approval; an open question of the stage's document waits on User before an
 * edit that waits for Apply, which waits before the approval, each since its own stamp; the agent is the stage's live document agent; a
 * ticket in `ready-for-review` waits for its review on either route, since its move; and a draft of the one-ticket route and a ticket past
 * review have no progress.
 */
import { describe, expect, test } from 'bun:test';

import { DOCUMENT_FIXTURE_AT, documentAgentJobFixture, ticketDocumentRecordFixture } from '../../../testing/TicketDocumentFixtures.ts';
import type { Decision }                                                             from '../@types/Decision.ts';
import type { DocumentProposal }                                                     from '../@types/TicketDocument.ts';
import { DraftProgressUtil, type DraftFacts }                                        from './DraftProgressUtil.ts';

const UPDATED = '2026-11-25T08:00:00.000Z';

const QUESTION_AT = '2026-11-25T09:00:00.000Z';

const SPEC = '# Basket\n\n## Acceptance\n\nA1. Alex Example sees the total.\n';

function factsWith(overrides: Partial<DraftFacts>): DraftFacts {
  return {
    ticketId: '004', status: 'draft', updated: UPDATED, route: 'spec-then-plan', documents: null, decisions: [], jobs: [], ...overrides
  };
}

const SPEC_QUESTION: Decision = {
  id:        'E3',
  kind:      'agent-question',
  ticketIds: ['004'],
  jobId:     'J9',
  askedBy:   'spec-agent',
  requestId: null,
  questions: [],
  context:   '',
  openedAt:  QUESTION_AT,
  document:  'spec',
  anchor:    {
    view: 'code', versionNumber: 1, lines: { from: 1, to: 1 }, sectionPath: [], surroundingLines: { from: 1, to: 3 }
  },
};

const OPEN_PROPOSAL: DocumentProposal = {
  proposalId: 'P1', jobId: 'J9', baseNumber: 1, edits: [], summary: 'Name the total', state: 'proposed', at: QUESTION_AT
};

describe('DraftProgressUtil.progressOf', () => {
  test('a draft with no documents yet is at its spec, with nothing waiting and no agent', () => {
    expect(DraftProgressUtil.progressOf(factsWith({}))).toEqual({
      stage: 'spec', waitsOnUser: null, agentJobId: null, waitingSince: null
    });
  });

  test('a spec its agent writes names the agent', () => {
    const documents = ticketDocumentRecordFixture('004', [{ kind: 'spec', texts: [SPEC] }]).record;
    expect(DraftProgressUtil.progressOf(factsWith({ documents, jobs: [documentAgentJobFixture('004', 'spec')] }))?.agentJobId).toBe('J9');
  });

  test('a spec ready for review waits for the approval since its head was written', () => {
    const documents = ticketDocumentRecordFixture('004', [{ kind: 'spec', texts: [SPEC], readyAtNumber: 1 }]).record;
    expect(DraftProgressUtil.progressOf(factsWith({ documents }))).toEqual({
      stage: 'spec-review', waitsOnUser: 'approval', agentJobId: null, waitingSince: DOCUMENT_FIXTURE_AT
    });
  });

  test('an open question waits on User before an edit that waits for Apply, which waits before the approval', () => {
    const documents = ticketDocumentRecordFixture('004', [{
      kind: 'spec', texts: [SPEC], readyAtNumber: 1, proposals: [OPEN_PROPOSAL]
    }]).record;
    expect(DraftProgressUtil.progressOf(factsWith({ documents, decisions: [SPEC_QUESTION] }))?.waitsOnUser).toBe('answer');
    expect(DraftProgressUtil.progressOf(factsWith({ documents }))?.waitsOnUser).toBe('proposal');
  });

  test('the wait named is dated by its own stamp, even when an edit that waits behind it is older', () => {
    const olderProposal: DocumentProposal = { ...OPEN_PROPOSAL, at: UPDATED };
    const documents = ticketDocumentRecordFixture('004', [{ kind: 'spec', texts: [SPEC], proposals: [olderProposal] }]).record;
    expect(DraftProgressUtil.progressOf(factsWith({ documents, decisions: [SPEC_QUESTION] }))).toMatchObject({ waitsOnUser: 'answer', waitingSince: QUESTION_AT });
  });

  test('a question on another ticket waits on nothing here', () => {
    const decisions = [{ ...SPEC_QUESTION, ticketIds: ['005'] }];
    expect(DraftProgressUtil.progressOf(factsWith({ decisions }))?.waitsOnUser).toBeNull();
  });

  test('with the spec approved the draft is at its plan, in review once the plan is ready', () => {
    const writing = ticketDocumentRecordFixture('004', [{ kind: 'spec', texts: [SPEC], approvals: [{ number: 1 }] }, { kind: 'plan' }]).record;
    expect(DraftProgressUtil.progressOf(factsWith({ documents: writing, jobs: [documentAgentJobFixture('004', 'plan', { id: 'J10' })] })))
      .toEqual({
        stage: 'plan', waitsOnUser: null, agentJobId: 'J10', waitingSince: null
      });
    const ready = ticketDocumentRecordFixture('004', [
      { kind: 'spec', texts: [SPEC], approvals: [{ number: 1 }] }, { kind: 'plan', texts: ['# Plan\n'], readyAtNumber: 1 },
    ]).record;
    expect(DraftProgressUtil.progressOf(factsWith({ documents: ready }))?.stage).toBe('plan-review');
  });

  test('a ticket ready for review waits for its review on either route, since its move', () => {
    const expected = {
      stage: 'ticket-review', waitsOnUser: 'approval', agentJobId: null, waitingSince: UPDATED
    } as const;
    expect(DraftProgressUtil.progressOf(factsWith({ status: 'ready-for-review', route: 'one-ticket' }))).toEqual(expected);
    expect(DraftProgressUtil.progressOf(factsWith({ status: 'ready-for-review' }))).toEqual(expected);
  });

  test('a draft of the one-ticket route and a committed ticket have no progress', () => {
    expect(DraftProgressUtil.progressOf(factsWith({ route: 'one-ticket' }))).toBeNull();
    expect(DraftProgressUtil.progressOf(factsWith({ status: 'committed' }))).toBeNull();
  });
});

describe('DraftProgressUtil.stageDocumentOf', () => {
  test('is the spec until the spec is approved, then the plan', () => {
    expect(DraftProgressUtil.stageDocumentOf(null)).toBe('spec');
    const approved = ticketDocumentRecordFixture('004', [{ kind: 'spec', texts: [SPEC], approvals: [{ number: 1 }] }]).record;
    expect(DraftProgressUtil.stageDocumentOf(approved)).toBe('plan');
  });
});
