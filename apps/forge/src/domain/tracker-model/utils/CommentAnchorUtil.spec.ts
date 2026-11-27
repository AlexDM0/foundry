/**
 * The anchor forge makes on a document's lines. What matters: the section path holds the headings above the first line, a deeper heading
 * closed by a shallower one, a heading line in its own section and a `#` line in a fenced block no heading; the surrounding lines stay
 * inside the version; and a copy carries every field the anchor has and no other, sharing no list with it.
 */
import { describe, expect, test } from 'bun:test';

import type { CommentAnchor } from '../@types/TicketDocument.ts';
import { CommentAnchorUtil }  from './CommentAnchorUtil.ts';

const TEXT = '# Basket\n\n## Behaviour\n\n### Totals\n\nThe total shows.\n\n## Acceptance\n\n```sh\n# not a heading\n```\nA1. It holds.\n';

describe('CommentAnchorUtil.anchorOfLines', () => {
  test('names the headings above the line, outermost first, and two lines around it', () => {
    expect(CommentAnchorUtil.anchorOfLines(TEXT, 3, { from: 7, to: 7 })).toEqual({
      view: 'code', versionNumber: 3, lines: { from: 7, to: 7 }, sectionPath: ['Basket', 'Behaviour', 'Totals'], surroundingLines: { from: 5, to: 9 }
    });
  });

  test('a shallower heading closes the deeper ones, and a # line in a fenced block is no heading', () => {
    expect(CommentAnchorUtil.anchorOfLines(TEXT, 3, { from: 14, to: 14 }).sectionPath).toEqual(['Basket', 'Acceptance']);
  });

  test('a heading line is in its own section, and the surrounding lines stay inside the version', () => {
    const anchor = CommentAnchorUtil.anchorOfLines(TEXT, 3, { from: 1, to: 1 });
    expect([anchor.sectionPath, anchor.surroundingLines]).toEqual([['Basket'], { from: 1, to: 3 }]);
    expect(CommentAnchorUtil.anchorOfLines(TEXT, 3, { from: 14, to: 14 }).surroundingLines).toEqual({ from: 12, to: 14 });
  });
});

describe('CommentAnchorUtil.copyOf', () => {
  const FULL: CommentAnchor = {
    view:             'preview',
    versionNumber:    2,
    lines:            { from: 4, to: 5 },
    columns:          { from: 1, to: 6 },
    sectionPath:      ['Basket'],
    quote:            'total',
    surroundingLines: { from: 2, to: 7 },
    diagram:          {
      lines: { from: 4, to: 5 }, diagramKind: 'flowchart', nodeId: 'basket', nodeLabel: 'Basket'
    },
  };

  test('carries every field the anchor has, and shares no list with it', () => {
    const copy = CommentAnchorUtil.copyOf(FULL);
    expect(copy).toEqual(FULL);
    expect(copy.sectionPath).not.toBe(FULL.sectionPath);
  });

  test('an anchor without its optional fields stays without them', () => {
    const plain = CommentAnchorUtil.anchorOfLines(TEXT, 1, { from: 7, to: 7 });
    expect(Object.keys(CommentAnchorUtil.copyOf(plain))).toEqual(['view', 'versionNumber', 'lines', 'sectionPath', 'surroundingLines']);
  });
});
