/**
 * The line a document agent reads for each message: every message names its own id, the one an edit that answers it names in `answers`, so
 * `document propose` takes it; the head follows, numbered by line, only when the agent has not seen it.
 */
import { describe, expect, test } from 'bun:test';

import type { CommentAnchor, DocumentProposal }                 from '../../lib/tracker-model/@types/TicketDocument.ts';
import type { ControlCommand }                                  from '../../shared/@types/ControlCommand.ts';
import { boardFixture, ticketFixture }                          from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                               from '../../testing/EchoedControlContext.ts';
import { createFixtureRecordAllocation, NO_UNREADABLE_RECORDS } from '../../testing/FixtureRecordAllocation.ts';
import {
  documentAgentJobFixture,
  documentMessageFixture,
  SNAPSHOT_COMMIT_FIXTURE,
  ticketDocumentRecordFixture
} from '../../testing/TicketDocumentFixtures.ts';
import { ControlService }       from '../control/ControlService.ts';
import { workspacePathsFor }    from '../tracker/Workspace.ts';
import { DocumentAgentWording } from './DocumentAgentWording.ts';

const ANCHOR: CommentAnchor = {
  view: 'code', versionNumber: 3, lines: { from: 17, to: 23 }, sectionPath: ['3 Behaviour'], surroundingLines: { from: 15, to: 25 }, quote: 'Saved choice'
};

describe('the payload', () => {
  test('an orphaned comment keeps its quote and names no lines', () => {
    const message = documentMessageFixture('M4', { commentNumber: 4, anchor: { ...ANCHOR }, orphaned: true });
    expect(DocumentAgentWording.messagePayloadOf(message, 'spec', 5)).toEqual({
      messageId:     'M4',
      comment:       'C4',
      view:          'code',
      document:      'spec',
      version:       5,
      sentOnVersion: 3,
      section:       ['3 Behaviour'],
      quote:         'Saved choice',
      orphaned:      true,
      text:          'Example comment M4',
    });
  });

  test('a message with no anchor names its document, the version the agent sees and its text', () => {
    expect(DocumentAgentWording.messagePayloadOf(documentMessageFixture('M1'), 'plan', 2)).toEqual({
      messageId: 'M1', document: 'plan', version: 2, text: 'Example comment M1'
    });
  });

  test('User\'s answer to the agent\'s question names that question, on the question\'s lines, and no comment', () => {
    const anchor: CommentAnchor = {
      view: 'code', versionNumber: 3, lines: { from: 17, to: 17 }, sectionPath: ['3 Behaviour'], surroundingLines: { from: 15, to: 19 }
    };
    const message = documentMessageFixture('M7', { decisionId: 'E4', anchor, placement: { from: 18, to: 18 } });
    expect(DocumentAgentWording.messagePayloadOf(message, 'spec', 4)).toEqual({
      messageId:     'M7',
      question:      'E4',
      view:          'code',
      document:      'spec',
      version:       4,
      sentOnVersion: 3,
      lines:         [18, 18],
      section:       ['3 Behaviour'],
      around:        [16, 20],
      text:          'Example comment M7',
    });
  });

  test('a board message says it is the board\'s', () => {
    expect(DocumentAgentWording.messagePayloadOf(documentMessageFixture('M6', { from: 'board' }), 'plan', 2)).toEqual({
      messageId: 'M6', from: 'board', document: 'plan', version: 2, text: 'Example comment M6'
    });
  });

  test('a diagram comment names its block, kind, node and label, and its lines moved with the head', () => {
    const message = documentMessageFixture('M5', {
      commentNumber: 5,
      anchor:        {
        ...ANCHOR,
        lines:   { from: 20, to: 20 },
        diagram: {
          lines: { from: 17, to: 23 }, diagramKind: 'flowchart', nodeId: 'Stored', nodeLabel: 'Saved choice'
        }
      },
      placement: { from: 22, to: 22 },
    });
    expect(DocumentAgentWording.messagePayloadOf(message, 'spec', 6)).toMatchObject({
      lines:   [22, 22],
      around:  [17, 27],
      diagram: {
        lines: [17, 23], kind: 'flowchart', node: 'Stored', label: 'Saved choice'
      }
    });
  });
});

describe('the line', () => {
  test('the head follows the payload, numbered by line, only when the agent has not seen it', () => {
    const message = documentMessageFixture('M1');
    const payload = JSON.stringify({
      messageId: 'M1', document: 'spec', version: 2, text: 'Example comment M1'
    }, null, 2);
    expect(DocumentAgentWording.messageLineOf(message, 'spec', { versionNumber: 2, changedText: null })).toBe(payload);
    expect(DocumentAgentWording.messageLineOf(message, 'spec', { versionNumber: 2, changedText: '# Basket\n\nShow it.\n' }))
      .toEndWith('The spec at version 2:\n\n1| # Basket\n2| \n3| Show it.');
  });

  test('line numbers are padded to the widest', () => {
    const text = Array.from({ length: 10 }, (_unused, index) => `line ${index + 1}`).join('\n');
    expect(DocumentAgentWording.numberedTextOf(text).split('\n')[0]).toBe(' 1| line 1');
  });
});

describe('the answer to the agent\'s question', () => {
  const ANSWERED_AT = '2026-11-25T09:00:00.000Z';

  function apply(fixture: ReturnType<typeof boardFixture>, command: ControlCommand): unknown {
    return ControlService.apply(command, {
      board:                          fixture.board,
      workspace:                      workspacePathsFor('/example-agency/storefront'),
      at:                             ANSWERED_AT,
      records:                        createFixtureRecordAllocation(fixture.board),
      unreadableRecords:              NO_UNREADABLE_RECORDS,
      unreadablePipeline:             null,
      storedLogEntryCount:            0,
      storedLogRecords:               [],
      deleteAllTicketFilesAfterwards: () => undefined,
    }, ECHOED_CONTROL_CONTEXT).result;
  }

  test('hands the agent the id that its edit names in `answers`, and `document propose` takes it', () => {
    const fixture = boardFixture({
      tickets:               [ticketFixture({ id: '004', status: 'draft' })],
      ticketDocumentRecords: [ticketDocumentRecordFixture('004', [{ kind: 'spec', texts: ['# Basket\n\nThe basket keeps its items.\n'] }])],
    });
    fixture.progress.jobs = [documentAgentJobFixture('004', 'spec')];
    apply(fixture, {
      kind:     'ticket-document-agent-ask',
      jobId:    'J9',
      version:  1,
      lines:    { from: 3, to: 3 },
      question: 'Where does the basket keep its items?',
      options:  [{ label: 'Per viewer' }, { label: 'Per forge' }],
    });
    fixture.board.answerDecisionInForm('E1', { form: 'letters', choices: ['a'] }, ANSWERED_AT);
    const answer = fixture.board.ticketDocuments().documentOf('004', 'spec')?.messages[0];
    if (answer === undefined) throw new Error('The answer reached no message.');
    const { messageId } = DocumentAgentWording.messagePayloadOf(answer, 'spec', 1);

    const { proposal } = apply(fixture, {
      kind:               'ticket-document-agent-propose',
      jobId:              'J9',
      constitutionCommit: SNAPSHOT_COMMIT_FIXTURE,
      baseVersion:        1,
      edits:              [{
        fromLine: 3, toLine: 3, originalLines: ['The basket keeps its items.'], replacementLines: ['The basket keeps its items per viewer.']
      }],
      summary: 'Keep the basket per viewer',
      answers: messageId as string,
    }) as { proposal: Readonly<DocumentProposal> };
    expect(proposal.answersMessageId).toBe('M1');
  });
});
