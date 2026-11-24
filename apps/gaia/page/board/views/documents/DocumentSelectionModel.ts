/**
 * Where a comment points, pure: a selection in Preview, lines in Code or a node of a diagram, each read as the same anchor of source lines,
 * so the agent always gets lines. Preview adds the columns of a one-line selection and the quote; every anchor carries the section path
 * of the headings above it, with the label of the list item it sits in, and the lines around it; a diagram node adds its mermaid id, and its
 * line is the first line of the diagram's source that names it.
 */
import type { MarkdownBlock, SourcePosition }                      from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import type { BoardCommentView }                                   from '../../../@types/board/BoardVocabulary.ts';
import type { BoardCommentAnchorDocument, BoardLineRangeDocument } from '../../../@types/board/TicketDocumentsDocument.ts';

/** The lines before and after a comment's own that the agent gets with it. */
export const SURROUNDING_LINE_COUNT = 2;

/** A Preview selection as source positions, its end the position just after its last character. */
export interface PreviewSelection {
  readonly start: SourcePosition;
  readonly end:   SourcePosition;
  readonly quote: string;
}

type DiagramBlock = Extract<MarkdownBlock, { readonly kind: 'diagram' }>;

const NODE_DEFINITION_OPENERS = '[({>';

function lineIsIn(line: number, lines: BoardLineRangeDocument): boolean {
  return lines.from <= line && line <= lines.to;
}

/** The innermost block at a line, and the label of each list item on the way to it. */
function placeAtLine(blocks: readonly MarkdownBlock[], line: number): { readonly block: MarkdownBlock; readonly itemLabels: readonly string[] } | null {
  const block = blocks.find((candidate) => lineIsIn(line, candidate.lines));
  if (block === undefined) return null;
  if (block.kind === 'list') {
    const item = block.items.find((candidate) => lineIsIn(line, candidate.lines));
    if (item === undefined) return { block, itemLabels: [] };
    const inner = placeAtLine(item.blocks, line);
    const labels = item.label === null ? [] : [item.label];
    return inner === null ? { block, itemLabels: labels } : { block: inner.block, itemLabels: [...labels, ...inner.itemLabels] };
  }
  if (block.kind === 'quote') return placeAtLine(block.blocks, line) ?? { block, itemLabels: [] };
  return { block, itemLabels: [] };
}

/** The headings above a line, and the label of the list item it sits in: `["4 Acceptance", "A3"]`. A heading line is in its own section. */
function sectionPathAt(blocks: readonly MarkdownBlock[], line: number): string[] {
  const place = placeAtLine(blocks, line);
  if (place === null) {
    const before = blocks.filter((block) => block.lines.to < line).at(-1);
    return before === undefined ? [] : [...before.sectionPath];
  }
  return [...place.block.sectionPath, ...place.itemLabels];
}

function diagramAtLine(blocks: readonly MarkdownBlock[], line: number): DiagramBlock | null {
  const place = placeAtLine(blocks, line);
  return place?.block.kind === 'diagram' ? place.block : null;
}

function surroundingLinesOf(lines: BoardLineRangeDocument, lineCount: number): BoardLineRangeDocument {
  return { from: Math.max(1, lines.from - SURROUNDING_LINE_COUNT), to: Math.min(Math.max(lineCount, 1), lines.to + SURROUNDING_LINE_COUNT) };
}

function anchorOf(
  blocks: readonly MarkdownBlock[],
  lineCount: number,
  view: BoardCommentView,
  versionNumber: number,
  lines: BoardLineRangeDocument,
): BoardCommentAnchorDocument {
  return {
    view,
    versionNumber,
    lines,
    columns:          null,
    sectionPath:      sectionPathAt(blocks, lines.from),
    quote:            null,
    surroundingLines: surroundingLinesOf(lines, lineCount),
    diagram:          null,
  };
}

/** A selection in Preview: its lines, its columns when it stays on one line (both ends included), its quote and its section. */
function anchorOfPreviewSelection(blocks: readonly MarkdownBlock[], lineCount: number, versionNumber: number, selection: PreviewSelection): BoardCommentAnchorDocument {
  const lines = { from: selection.start.line, to: Math.max(selection.start.line, selection.end.line) };
  const columns = selection.start.line === selection.end.line ? { from: selection.start.column, to: Math.max(selection.start.column, selection.end.column - 1) } : null;
  const quote = selection.quote.trim();
  return { ...anchorOf(blocks, lineCount, 'preview', versionNumber, lines), columns, quote: quote === '' ? null : quote };
}

/** Lines selected in Code: the lines and their section; Code carries no quote. */
function anchorOfLines(blocks: readonly MarkdownBlock[], lineCount: number, versionNumber: number, lines: BoardLineRangeDocument): BoardCommentAnchorDocument {
  return anchorOf(blocks, lineCount, 'code', versionNumber, lines);
}

function isNameCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\w-]/u.test(character);
}

/** Whether the line names the node as a whole word, and whether it defines it there, with a shape and a label. */
function nodeMentionOf(line: string, nodeId: string): 'defines' | 'names' | null {
  let found = line.indexOf(nodeId);
  let named = false;
  while (found !== -1) {
    const before = line[found - 1];
    const after = line[found + nodeId.length];
    if (!isNameCharacter(before) && !isNameCharacter(after)) {
      if (after !== undefined && NODE_DEFINITION_OPENERS.includes(after)) return 'defines';
      named = true;
    }
    found = line.indexOf(nodeId, found + 1);
  }
  return named ? 'names' : null;
}

/** The source line of a diagram node: the first line that defines it with a shape, else the first that names it, else the diagram's first. */
function nodeSourceLineOf(diagram: DiagramBlock, nodeId: string): number {
  const sourceLines = diagram.source.split('\n');
  const mentions = sourceLines.map((line) => nodeMentionOf(line, nodeId));
  const definedAt = mentions.indexOf('defines');
  const namedAt = definedAt === -1 ? mentions.indexOf('names') : definedAt;
  return diagram.sourceLines.from + Math.max(namedAt, 0);
}

/** A node of a diagram in Preview: the node's own line, the diagram's lines and kind, and the node's id and label. */
function anchorOfNode(
  blocks: readonly MarkdownBlock[],
  lineCount: number,
  versionNumber: number,
  diagram: DiagramBlock,
  node: { readonly nodeId: string; readonly label: string },
): BoardCommentAnchorDocument {
  const line = nodeSourceLineOf(diagram, node.nodeId);
  return {
    ...anchorOf(blocks, lineCount, 'preview', versionNumber, { from: line, to: line }),
    diagram: {
      lines: diagram.lines, diagramKind: diagram.diagramKind, nodeId: node.nodeId, nodeLabel: node.label
    },
  };
}

/** The source position of a character of a drawn span: its start moved on by the offset into its text, past any line break in it. */
function positionInSpan(start: SourcePosition, text: string, offset: number): SourcePosition {
  const before = text.slice(0, Math.max(0, offset));
  const lineBreaks = before.split('\n').length - 1;
  if (lineBreaks === 0) return { line: start.line, column: start.column + before.length };
  return { line: start.line + lineBreaks, column: before.length - before.lastIndexOf('\n') };
}

export const DocumentSelectionModel = Object.freeze({
  sectionPathAt,
  diagramAtLine,
  surroundingLinesOf,
  anchorOfPreviewSelection,
  anchorOfLines,
  anchorOfNode,
  nodeSourceLineOf,
  positionInSpan,
});
