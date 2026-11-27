/**
 * A spec or plan agent's question to User. What matters: the question opens an `agent-question` decision on its ticket that names the
 * document and a code-view anchor on the lines the agent named, at the version it read, with the headings above them; the agent's untrusted
 * JSON is checked field by field before the Board sees it; while the question is open nobody approves that document, the pipeline
 * included; and User's answer, an option with a note, goes to the document's agent as a message on the question's lines that names the
 * decision and holds no comment number, with the answer in parts, the option chosen apart from User's own words, which nobody withdraws,
 * after which the document is approved as before.
 */
import { describe, expect, test } from 'bun:test';

import type { DecisionOpened }             from '../../domain/tracker-model/@types/BoardChanges.ts';
import type { LoadedTicketDocumentRecord } from '../../domain/tracker-model/@types/TicketDocument.ts';
import { PipelineUtil }                    from '../../domain/tracker-model/utils/PipelineUtil.ts';
import type { ControlCommand }             from '../../shared/@types/ControlCommand.ts';
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
import { ticketDocumentMoveJudgesOf }                                                    from './TicketDocumentMoveJudges.ts';

const CHANGED_AT = '2026-11-25T09:00:00.000Z';

const SPEC_TEXT = '# Basket\n\n## Behaviour\n\nThe basket keeps its items.\nIt keeps them per viewer.\n\n## Acceptance\n\nA1. Alex Example sees the total.\n';

function questionBoard(reviewIsOn = true): BoardFixture {
  const record: LoadedTicketDocumentRecord = ticketDocumentRecordFixture('004', [{ kind: 'spec', texts: [SPEC_TEXT] }]);
  const fixture = boardFixture({
    tickets:               [ticketFixture({ id: '004', status: 'draft' })],
    ticketDocumentRecords: [record],
    ...(reviewIsOn ? {} : { pipeline: { ...PipelineUtil.minimalPipelineOf(), approvals: { spec: false, plan: false } } }),
  });
  fixture.progress.jobs = [documentAgentJobFixture('004', 'spec')];
  return fixture;
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

function apply(fixture: BoardFixture, command: ControlCommand): unknown {
  return ControlService.apply(command, changeOf(fixture), ECHOED_CONTROL_CONTEXT).result;
}

const QUESTION: ControlCommand = {
  kind:     'ticket-document-agent-ask',
  jobId:    'J9',
  version:  1,
  lines:    { from: 6, to: 6 },
  question: 'Where does the basket keep its items?',
  options:  [
    {
      label: 'Per viewer', touches: ['src/Basket.ts'], acceptanceEffect: 'A1 holds.', recommended: true
    },
    { label: 'Per forge', description: 'Shared by every viewer', acceptanceEffect: 'A1 changes.' },
  ],
};

function approveSpec(fixture: BoardFixture): unknown {
  return fixture.board.ticketDocuments().approve('004', 'spec', 1, SNAPSHOT_COMMIT_FIXTURE, ticketDocumentMoveJudgesOf('spec'), CHANGED_AT);
}

describe('a document agent\'s question', () => {
  test('opens an agent-question decision on its ticket that names the spec and anchors on the lines at the version read', () => {
    const fixture = questionBoard();
    const opened  = apply(fixture, QUESTION) as DecisionOpened;
    expect(opened.decision).toEqual({
      id:        'E1',
      kind:      'agent-question',
      ticketIds: ['004'],
      jobId:     'J9',
      askedBy:   'spec-agent',
      requestId: null,
      questions: [{
        question:    'Where does the basket keep its items?',
        header:      'spec',
        multiSelect: false,
        options:     [
          {
            label: 'Per viewer', description: '', isRecommended: true, touches: ['src/Basket.ts'], acceptanceEffect: 'A1 holds.'
          },
          {
            label: 'Per forge', description: 'Shared by every viewer', isRecommended: false, acceptanceEffect: 'A1 changes.'
          },
        ],
      }],
      context:  '',
      openedAt: CHANGED_AT,
      document: 'spec',
      anchor:   {
        view: 'code', versionNumber: 1, lines: { from: 6, to: 6 }, sectionPath: ['Basket', 'Behaviour'], surroundingLines: { from: 4, to: 8 }
      },
    });
    expect(fixture.board.jobById('J9')?.state).toBe('running');
  });

  test('carries the context the agent gives, trimmed, as the decision\'s context', () => {
    const fixture = questionBoard();
    const opened  = apply(fixture, { ...QUESTION, context: ' The repo stores no basket yet. ' } as ControlCommand) as DecisionOpened;
    expect(opened.decision?.context).toBe('The repo stores no basket yet.');
  });

  test.each([
    ['question', { question: ' ' }],
    ['options', { options: [{ label: 'Per viewer' }] }],
    ['options', { options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }, { label: 'E' }] }],
    ['options', { options: [{ label: 'Per viewer' }, { label: 'Per viewer' }] }],
    ['options', { options: [{ label: 'Per viewer', recommended: true }, { label: 'Per forge', recommended: true }] }],
    ['options[1].label', { options: [{ label: 'Per viewer' }, { label: '' }] }],
    ['options[0]', { options: [{ label: 'Per viewer', touches: [] }, { label: 'Per forge' }] }],
    ['context', { context: 4 }],
    ['lines', { lines: { from: 6, to: 5 } }],
    ['lines', { lines: { from: 6, to: 99 } }],
  ] as const)('a malformed %s is refused before the Board sees it', (field, overrides) => {
    const fixture = questionBoard();
    let thrown: unknown = null;
    try {
      apply(fixture, { ...QUESTION, ...overrides } as ControlCommand);
    } catch (error) {
      thrown = error;
    }
    expect(thrown instanceof OperationRefusal && thrown.detail).toEqual({ kind: 'malformed-setup-command', commandKind: 'ticket-document-agent-ask', field });
    expect(fixture.board.decisions()).toEqual([]);
  });

  test('a version the spec does not hold is refused naming its head', () => {
    const fixture = questionBoard();
    expect(refusalDetailOf(() => apply(fixture, { ...QUESTION, version: 2 } as ControlCommand))).toEqual({
      reason: 'document-version-moved', ticketId: '004', document: 'spec', version: 2, headNumber: 1
    });
  });
});

describe('the approval while the question is open', () => {
  test('User\'s approval of that document is refused, naming the open decision', () => {
    const fixture = questionBoard();
    apply(fixture, QUESTION);
    expect(refusalDetailOf(() => approveSpec(fixture))).toEqual({
      reason: 'document-has-open-questions', ticketId: '004', document: 'spec', decisionIds: ['E1']
    });
    expect(fixture.board.ticketDocuments().documentOf('004', 'spec')?.approvals).toEqual([]);
  });

  test('with the review off, the agent\'s ready approves nothing for the pipeline either', () => {
    const fixture = questionBoard(false);
    apply(fixture, QUESTION);
    expect(refusalDetailOf(() => apply(fixture, { kind: 'ticket-document-agent-ready', jobId: 'J9', constitutionCommit: SNAPSHOT_COMMIT_FIXTURE })).reason)
      .toBe('document-has-open-questions');
  });
});

describe('User\'s answer', () => {
  test('goes to the spec\'s agent as a message on the question\'s lines that names the decision, with the option and the note', () => {
    const fixture = questionBoard();
    apply(fixture, QUESTION);
    fixture.board.answerDecisionInForm('E1', { form: 'letters', choices: ['b'], note: 'Keep the old basket too.' }, CHANGED_AT);
    expect(fixture.board.ticketDocuments().documentOf('004', 'spec')?.messages).toEqual([{
      messageId:  'M1',
      decisionId: 'E1',
      answer:     { question: 'Where does the basket keep its items?', choice: 'Per forge', note: 'Keep the old basket too.' },
      anchor:     {
        view: 'code', versionNumber: 1, lines: { from: 6, to: 6 }, sectionPath: ['Basket', 'Behaviour'], surroundingLines: { from: 4, to: 8 }
      },
      placement: { from: 6, to: 6 },
      text:      'Where does the basket keep its items?\nPer forge\n\nKeep the old basket too.',
      from:      'person',
      state:     'queued',
      queuedAt:  CHANGED_AT,
    }]);
    expect(fixture.board.decisions()).toEqual([]);
  });

  test('a free note alone is the answer, with no option chosen, its blank lines kept in the note', () => {
    const fixture = questionBoard();
    apply(fixture, QUESTION);
    fixture.board.answerDecisionInForm('E1', { form: 'text', text: 'Neither.\n\nAsk the owner first.' }, CHANGED_AT);
    const [answer] = fixture.board.ticketDocuments().documentOf('004', 'spec')?.messages ?? [];
    expect(answer?.text).toBe('Where does the basket keep its items?\nNeither.\n\nAsk the owner first.');
    expect(answer?.answer).toEqual({ question: 'Where does the basket keep its items?', choice: null, note: 'Neither.\n\nAsk the owner first.' });
  });

  test('is never withdrawn, since its question closed when User answered it, and stays queued for the agent', () => {
    const fixture = questionBoard();
    apply(fixture, QUESTION);
    fixture.board.answerDecisionInForm('E1', { form: 'letters', choices: ['a'] }, CHANGED_AT);
    expect(refusalDetailOf(() => apply(fixture, {
      kind: 'ticket-document-comment-withdraw', ticketReference: '004', document: 'spec', messageId: 'M1'
    } as ControlCommand))).toEqual({
      reason: 'document-answer-not-withdrawn', ticketId: '004', document: 'spec', messageId: 'M1', decisionId: 'E1'
    });
    expect(fixture.board.ticketDocuments().documentOf('004', 'spec')?.messages[0]?.state).toBe('queued');
  });

  test('once answered, the spec is approved as before', () => {
    const fixture = questionBoard();
    apply(fixture, QUESTION);
    fixture.board.answerDecisionInForm('E1', { form: 'letters', choices: ['a'] }, CHANGED_AT);
    approveSpec(fixture);
    expect(fixture.board.ticketDocuments().documentOf('004', 'spec')?.approvals.map((approval) => approval.number)).toEqual([1]);
  });
});
