/**
 * The line a document agent reads for each message. What matters: an orphaned comment keeps its quote and names no lines; a message with no
 * anchor names only its document, version and text; User's answer to the agent's question names the decision it answers and no comment;
 * a board message says it is the board's; a diagram comment names its node; and the
 * head follows the payload, numbered by line, only when the agent has not seen it.
 */
import { describe, expect, test } from 'bun:test';

import type { CommentAnchor }     from '../../lib/tracker-model/@types/TicketDocument.ts';
import { documentMessageFixture } from '../../testing/TicketDocumentFixtures.ts';
import { DocumentAgentWording }   from './DocumentAgentWording.ts';

const ANCHOR: CommentAnchor = {
  view: 'code', versionNumber: 3, lines: { from: 17, to: 23 }, sectionPath: ['3 Behaviour'], surroundingLines: { from: 15, to: 25 }, quote: 'Saved choice'
};

describe('the payload', () => {
  test('an orphaned comment keeps its quote and names no lines', () => {
    const message = documentMessageFixture('M4', { commentNumber: 4, anchor: { ...ANCHOR }, orphaned: true });
    expect(DocumentAgentWording.messagePayloadOf(message, 'spec', 5)).toEqual({
      comment: 'C4', view: 'code', document: 'spec', version: 5, sentOnVersion: 3, section: ['3 Behaviour'], quote: 'Saved choice', orphaned: true, text: 'Example comment M4'
    });
  });

  test('a message with no anchor names its document, the version the agent sees and its text', () => {
    expect(DocumentAgentWording.messagePayloadOf(documentMessageFixture('M1'), 'plan', 2)).toEqual({ document: 'plan', version: 2, text: 'Example comment M1' });
  });

  test('User\'s answer to the agent\'s question names the decision it answers, on the question\'s lines, and no comment', () => {
    const anchor: CommentAnchor = {
      view: 'code', versionNumber: 3, lines: { from: 17, to: 17 }, sectionPath: ['3 Behaviour'], surroundingLines: { from: 15, to: 19 }
    };
    const message = documentMessageFixture('M7', { decisionId: 'E4', anchor, placement: { from: 18, to: 18 } });
    expect(DocumentAgentWording.messagePayloadOf(message, 'spec', 4)).toEqual({
      answers: 'E4', view: 'code', document: 'spec', version: 4, sentOnVersion: 3, lines: [18, 18], section: ['3 Behaviour'], around: [16, 20], text: 'Example comment M7'
    });
  });

  test('a board message says it is the board\'s', () => {
    expect(DocumentAgentWording.messagePayloadOf(documentMessageFixture('M6', { from: 'board' }), 'plan', 2)).toEqual({
      from: 'board', document: 'plan', version: 2, text: 'Example comment M6'
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
    const payload = JSON.stringify({ document: 'spec', version: 2, text: 'Example comment M1' }, null, 2);
    expect(DocumentAgentWording.messageLineOf(message, 'spec', { versionNumber: 2, changedText: null })).toBe(payload);
    expect(DocumentAgentWording.messageLineOf(message, 'spec', { versionNumber: 2, changedText: '# Basket\n\nShow it.\n' }))
      .toEndWith('The spec at version 2:\n\n1| # Basket\n2| \n3| Show it.');
  });

  test('line numbers are padded to the widest', () => {
    const text = Array.from({ length: 10 }, (_unused, index) => `line ${index + 1}`).join('\n');
    expect(DocumentAgentWording.numberedTextOf(text).split('\n')[0]).toBe(' 1| line 1');
  });
});
