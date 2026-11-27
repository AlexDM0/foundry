/**
 * Where a comment points: Preview selections, Code lines and diagram nodes all read as source lines; a one-line selection's columns and
 * quote; the section path with a list item's label; surrounding lines kept inside the document; a node's defining line; and a position in
 * a drawn span moving past a line break.
 */
import { describe, expect, test } from 'bun:test';

import { MarkdownBlocks }         from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import { SPEC_MARKDOWN, lineOf }  from '../../testing/TicketDocumentsFixture.ts';
import { DocumentSelectionModel } from './DocumentSelectionModel.ts';

const BLOCKS = MarkdownBlocks.blocksOf(SPEC_MARKDOWN);

const LINE_COUNT = SPEC_MARKDOWN.split('\n').length;

const A3_LINE = lineOf(SPEC_MARKDOWN, '**A3**');

describe('a selection in Preview', () => {
  test('reads as artboard 6\'s C2: its line, its columns, its section with the item\'s label, its quote and the lines around it', () => {
    const quote = 'Every account page passes 4.5:1 contrast in both themes.';
    const selection = { start: { line: A3_LINE, column: 14 }, end: { line: A3_LINE, column: 14 + quote.length }, quote: `${quote} ` };
    const anchor = DocumentSelectionModel.anchorOfPreviewSelection(BLOCKS, LINE_COUNT, 4, selection);
    expect(anchor).toEqual({
      view:             'preview',
      versionNumber:    4,
      lines:            { from: A3_LINE, to: A3_LINE },
      columns:          { from: 14, to: 13 + quote.length },
      sectionPath:      ['4 Acceptance', 'A3'],
      quote,
      surroundingLines: { from: A3_LINE - 2, to: A3_LINE + 2 },
      diagram:          null,
    });
  });

  test('over two lines carries no columns', () => {
    const selection = { start: { line: A3_LINE - 1, column: 14 }, end: { line: A3_LINE, column: 20 }, quote: 'two lines' };
    const anchor = DocumentSelectionModel.anchorOfPreviewSelection(BLOCKS, LINE_COUNT, 4, selection);
    expect([anchor.lines, anchor.columns]).toEqual([{ from: A3_LINE - 1, to: A3_LINE }, null]);
  });
});

describe('lines in Code', () => {
  test('read as artboard 3\'s C3: the lines and their section, no quote', () => {
    const anchor = DocumentSelectionModel.anchorOfLines(BLOCKS, LINE_COUNT, 4, { from: 17, to: 23 });
    expect([anchor.view, anchor.lines, anchor.sectionPath, anchor.quote, anchor.columns]).toEqual(['code', { from: 17, to: 23 }, ['3 Behaviour'], null, null]);
  });

  test('keep the lines around them inside the document', () => {
    expect(DocumentSelectionModel.surroundingLinesOf({ from: 1, to: 1 }, LINE_COUNT)).toEqual({ from: 1, to: 3 });
    expect(DocumentSelectionModel.surroundingLinesOf({ from: LINE_COUNT, to: LINE_COUNT }, LINE_COUNT)).toEqual({ from: LINE_COUNT - 2, to: LINE_COUNT });
  });
});

describe('a diagram node', () => {
  const diagram = DocumentSelectionModel.diagramAtLine(BLOCKS, 18);

  test('stands on the line that defines it, and the anchor names the diagram, its kind and the node, as artboard 6\'s C5', () => {
    if (diagram === null) throw new Error('no diagram');
    expect(DocumentSelectionModel.nodeSourceLineOf(diagram, 'Stored')).toBe(20);
    expect(DocumentSelectionModel.nodeSourceLineOf(diagram, 'Account')).toBe(22);
    const anchor = DocumentSelectionModel.anchorOfNode(BLOCKS, LINE_COUNT, 6, diagram, { nodeId: 'Stored', label: 'Saved choice' });
    expect([anchor.lines, anchor.sectionPath, anchor.diagram]).toEqual([
      { from: 20, to: 20 },
      ['3 Behaviour'],
      {
        lines: { from: 17, to: 23 }, diagramKind: 'flowchart', nodeId: 'Stored', nodeLabel: 'Saved choice'
      },
    ]);
  });

  test('a node named only in an edge stands on that edge\'s line, and one named nowhere on the diagram\'s first', () => {
    if (diagram === null) throw new Error('no diagram');
    expect(DocumentSelectionModel.nodeSourceLineOf(diagram, 'Resolver')).toBe(19);
    expect(DocumentSelectionModel.nodeSourceLineOf(diagram, 'Nowhere')).toBe(18);
  });
});

describe('a position in a drawn span', () => {
  test('moves on by the offset, past a line break onto the next line', () => {
    expect(DocumentSelectionModel.positionInSpan({ line: 7, column: 5 }, 'abc def', 4)).toEqual({ line: 7, column: 9 });
    expect(DocumentSelectionModel.positionInSpan({ line: 7, column: 5 }, 'abc\ndef', 6)).toEqual({ line: 8, column: 3 });
  });
});

describe('the text an open comment marks', () => {
  test('is a one-line anchor\'s columns, a longer one\'s whole lines, and nothing for a diagram node', () => {
    const quote = 'Every account page passes 4.5:1 contrast in both themes.';
    const selection = { start: { line: A3_LINE, column: 14 }, end: { line: A3_LINE, column: 14 + quote.length }, quote };
    const oneLine = DocumentSelectionModel.anchorOfPreviewSelection(BLOCKS, LINE_COUNT, 4, selection);
    expect(DocumentSelectionModel.markedRangeOf(oneLine)).toEqual({ start: { line: A3_LINE, column: 14 }, end: { line: A3_LINE, column: 14 + quote.length } });
    const twoLines = DocumentSelectionModel.anchorOfLines(BLOCKS, LINE_COUNT, 4, { from: 17, to: 23 });
    expect(DocumentSelectionModel.markedRangeOf(twoLines)).toEqual({ start: { line: 17, column: 1 }, end: { line: 24, column: 1 } });
    const diagram = DocumentSelectionModel.diagramAtLine(BLOCKS, 17);
    if (diagram === null) throw new Error('no diagram');
    expect(DocumentSelectionModel.markedRangeOf(DocumentSelectionModel.anchorOfNode(BLOCKS, LINE_COUNT, 4, diagram, { nodeId: 'Stored', label: 'Saved choice' }))).toBeNull();
  });

  test('cuts a drawn span at the range\'s ends, across a line break, and leaves a span outside it whole', () => {
    const range = { start: { line: 7, column: 9 }, end: { line: 8, column: 3 } };
    expect(DocumentSelectionModel.markedOffsetsInSpan({ line: 7, column: 5 }, 'abc def', range)).toEqual({ from: 4, to: 7 });
    expect(DocumentSelectionModel.markedOffsetsInSpan({ line: 7, column: 5 }, 'abc defg\nhijk', range)).toEqual({ from: 4, to: 11 });
    expect(DocumentSelectionModel.markedOffsetsInSpan({ line: 9, column: 1 }, 'after', range)).toBeNull();
    expect(DocumentSelectionModel.markedOffsetsInSpan({ line: 6, column: 1 }, 'before', range)).toBeNull();
  });
});
