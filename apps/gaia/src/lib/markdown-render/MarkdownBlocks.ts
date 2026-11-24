/**
 * Reads Markdown into blocks a page draws itself, never into HTML: headings, paragraphs, lists with their checkboxes, code, diagrams (a
 * `mermaid` fence), quotes, tables and rules, each with the source lines it spans and the section path of the headings above it, and
 * inline spans that carry the source line and column where their text starts. Raw HTML stays text, an image stays its alternative text, and
 * a link keeps its target only when `hrefIsAllowed` allows it. Lines and columns count from 1, after `\r\n` became `\n`.
 */
import { Lexer, type Token, type Tokens } from 'marked';

import { hrefIsAllowed } from './MarkdownRenderer.ts';

export interface SourcePosition {
  readonly line:   number;
  readonly column: number;
}

/** Both ends included. */
export interface SourceLines {
  readonly from: number;
  readonly to:   number;
}

export type MarkdownSpan =
  | { readonly kind: 'text'; readonly text: string; readonly start: SourcePosition }
  | { readonly kind: 'code'; readonly text: string; readonly start: SourcePosition }
  | { readonly kind: 'strong'; readonly spans: readonly MarkdownSpan[] }
  | { readonly kind: 'emphasis'; readonly spans: readonly MarkdownSpan[] }
  | { readonly kind: 'deleted'; readonly spans: readonly MarkdownSpan[] }
  /** `href` is `null` when its scheme is not allowed: the link stays text. */
  | { readonly kind: 'link'; readonly href: string | null; readonly spans: readonly MarkdownSpan[] }
  | { readonly kind: 'line-break' };

export type ListItemCheckbox = 'checked' | 'unchecked' | null;

export interface MarkdownListItem {
  readonly lines:    SourceLines;
  readonly checkbox: ListItemCheckbox;
  /** The text of a strong span that opens the item, such as `A3` of `**A3** Every page…`; it names the item in a section path. */
  readonly label:    string | null;
  readonly blocks:   readonly MarkdownBlock[];
}

interface BlockPlace {
  readonly lines:       SourceLines;
  /** The texts of the headings above the block, outermost first; a document's one leading `#` title is left out. */
  readonly sectionPath: readonly string[];
}

export type MarkdownBlock = BlockPlace & (
  | { readonly kind: 'heading'; readonly depth: number; readonly spans: readonly MarkdownSpan[] }
  | { readonly kind: 'paragraph'; readonly spans: readonly MarkdownSpan[] }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly start: number; readonly items: readonly MarkdownListItem[] }
  | { readonly kind: 'code'; readonly language: string | null; readonly text: string }
  /** `title` from the fence's words after `mermaid`, else a `title:` or `accTitle:` line of the diagram; `diagramKind` its first word. */
  | { readonly kind: 'diagram'; readonly diagramKind: string; readonly title: string | null; readonly source: string; readonly sourceLines: SourceLines }
  | { readonly kind: 'quote'; readonly blocks: readonly MarkdownBlock[] }
  | { readonly kind: 'table'; readonly header: readonly (readonly MarkdownSpan[])[]; readonly rows: readonly (readonly (readonly MarkdownSpan[])[])[] }
  | { readonly kind: 'rule' }
);

const DIAGRAM_LANGUAGE = 'mermaid';

const LINE_BREAK = '\n';

const DIAGRAM_TITLE_LINE = /^\s*(?:title|accTitle)\s*:\s*(.+?)\s*$/u;

/** Where the source's lines start, so an offset reads as a line and a column. */
interface SourceIndex {
  readonly source:      string;
  readonly lineOffsets: readonly number[];
}

function sourceIndexOf(source: string): SourceIndex {
  const lineOffsets = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === LINE_BREAK) lineOffsets.push(i + 1);
  }
  return { source, lineOffsets };
}

function positionOf(index: SourceIndex, offset: number): SourcePosition {
  let line = 0;
  while (line + 1 < index.lineOffsets.length && (index.lineOffsets[line + 1] ?? Infinity) <= offset) line += 1;
  return { line: line + 1, column: offset - (index.lineOffsets[line] ?? 0) + 1 };
}

/** The lines a piece of the source spans, its trailing line breaks left out. */
function linesOf(index: SourceIndex, offset: number, raw: string): SourceLines {
  const trimmedLength = raw.replace(/\n+$/u, '').length;
  return { from: positionOf(index, offset).line, to: positionOf(index, offset + Math.max(trimmedLength - 1, 0)).line };
}

/**
 * Where a token's source starts at or after `cursor`. A list item's text has its indentation taken out, so a raw that is not found whole
 * is found by its first line with text.
 */
function locate(index: SourceIndex, raw: string, cursor: number): { readonly offset: number; readonly length: number } {
  const whole = index.source.indexOf(raw, cursor);
  if (whole !== -1) return { offset: whole, length: raw.length };
  const leadingBreaks = /^\n*/u.exec(raw)?.[0].length ?? 0;
  const firstLine = raw.slice(leadingBreaks).split(LINE_BREAK)[0] ?? '';
  const found = firstLine === '' ? -1 : index.source.indexOf(firstLine, cursor);
  return found === -1 ? { offset: cursor, length: 0 } : { offset: found - leadingBreaks, length: firstLine.length + leadingBreaks };
}

function textStartOf(index: SourceIndex, offset: number, raw: string, text: string): SourcePosition {
  const within = text === '' ? 0 : raw.indexOf(text);
  return positionOf(index, offset + Math.max(within, 0));
}

function offsetOf(index: SourceIndex, position: SourcePosition): number {
  return (index.lineOffsets[position.line - 1] ?? 0) + position.column - 1;
}

/**
 * A text that runs over a soft line break, one span per source line, so each span's start is exact: a later line of a list item starts
 * after its indentation, which the token's text no longer holds.
 */
function textSpansByLineOf(index: SourceIndex, text: string, start: SourcePosition): MarkdownSpan[] {
  const pieces = text.split(LINE_BREAK);
  let position = start;
  return pieces.map((piece, i) => {
    const isLast = i === pieces.length - 1;
    const span: MarkdownSpan = { kind: 'text', text: isLast ? piece : `${piece}${LINE_BREAK}`, start: position };
    if (!isLast) {
      const nextLineOffset = index.lineOffsets[position.line] ?? offsetOf(index, position);
      const nextPiece = pieces[i + 1] ?? '';
      const found = nextPiece === '' ? -1 : index.source.indexOf(nextPiece, nextLineOffset);
      position = positionOf(index, found === -1 ? nextLineOffset : found);
    }
    return span;
  });
}

function spansOf(index: SourceIndex, tokens: readonly Token[], startCursor: number): MarkdownSpan[] {
  let cursor = startCursor;
  const spans: MarkdownSpan[] = [];
  for (const token of tokens) {
    const located = locate(index, token.raw, cursor);
    spans.push(...spansOfToken(index, token, located.offset));
    cursor = located.offset + located.length;
  }
  return spans;
}

/** A text token with inline tokens of its own stands for those tokens' spans, in place. */
function spansOfToken(index: SourceIndex, token: Token, offset: number): MarkdownSpan[] {
  switch (token.type) {
    case 'text':
    case 'escape': {
      const textToken = token as Tokens.Text;
      if (textToken.tokens !== undefined && textToken.tokens.length > 0) return spansOf(index, textToken.tokens, offset);
      return textSpansByLineOf(index, textToken.text, textStartOf(index, offset, textToken.raw, textToken.text));
    }
    case 'codespan': {
      const codeToken = token as Tokens.Codespan;
      return [{ kind: 'code', text: codeToken.text, start: textStartOf(index, offset, codeToken.raw, codeToken.text) }];
    }
    case 'strong':
      return [{ kind: 'strong', spans: spansOf(index, (token as Tokens.Strong).tokens, offset) }];
    case 'em':
      return [{ kind: 'emphasis', spans: spansOf(index, (token as Tokens.Em).tokens, offset) }];
    case 'del':
      return [{ kind: 'deleted', spans: spansOf(index, (token as Tokens.Del).tokens, offset) }];
    case 'link': {
      const linkToken = token as Tokens.Link;
      return [{ kind: 'link', href: hrefIsAllowed(linkToken.href) ? linkToken.href : null, spans: spansOf(index, linkToken.tokens, offset) }];
    }
    case 'image': {
      const imageToken = token as Tokens.Image;
      return [{ kind: 'text', text: imageToken.text, start: textStartOf(index, offset, imageToken.raw, imageToken.text) }];
    }
    case 'br':
      return [{ kind: 'line-break' }];
    default:
      return token.raw === '' ? [] : [{ kind: 'text', text: token.raw, start: positionOf(index, offset) }];
  }
}

/** The diagram's title: the fence's words after `mermaid`, else a `title:` or `accTitle:` line of its source. */
function diagramTitleOf(fenceWords: string, source: string): string | null {
  if (fenceWords !== '') return fenceWords;
  for (const line of source.split(LINE_BREAK)) {
    const match = DIAGRAM_TITLE_LINE.exec(line);
    if (match?.[1] !== undefined) return match[1];
  }
  return null;
}

function diagramKindOf(source: string): string {
  const firstLine = source.split(LINE_BREAK).map((line) => line.trim()).find((line) => line !== '' && line !== '---' && !line.startsWith('%%') && !line.includes(':'));
  return firstLine?.split(/\s+/u)[0] ?? '';
}

function codeBlockOf(token: Tokens.Code, place: BlockPlace): MarkdownBlock {
  const [language = '', ...fenceWords] = (token.lang ?? '').trim().split(/\s+/u);
  if (language !== DIAGRAM_LANGUAGE) return {
    ...place, kind: 'code', language: language === '' ? null : language, text: token.text
  };
  const fenced = token.codeBlockStyle !== 'indented';
  const sourceLines = fenced ? { from: place.lines.from + 1, to: Math.max(place.lines.to - 1, place.lines.from + 1) } : place.lines;
  return {
    ...place,
    kind:        'diagram',
    diagramKind: diagramKindOf(token.text),
    title:       diagramTitleOf(fenceWords.join(' '), token.text),
    source:      token.text,
    sourceLines,
  };
}

function inlineTextOf(spans: readonly MarkdownSpan[]): string {
  return spans.map((span) => {
    if (span.kind === 'text' || span.kind === 'code') return span.text;
    if (span.kind === 'line-break') return ' ';
    return inlineTextOf(span.spans);
  }).join('');
}

function itemLabelOf(blocks: readonly MarkdownBlock[]): string | null {
  const [first] = blocks;
  if (first?.kind !== 'paragraph') return null;
  const [leading] = first.spans;
  return leading?.kind === 'strong' ? inlineTextOf(leading.spans).trim() : null;
}

interface Reading {
  readonly index:     SourceIndex;
  readonly titleSkip: boolean;
}

function listItemOf(reading: Reading, item: Tokens.ListItem, offset: number, sectionPath: readonly string[]): MarkdownListItem {
  const lines = linesOf(reading.index, offset, item.raw);
  const contentTokens = item.tokens.filter((token) => token.type !== 'checkbox');
  const { blocks } = blocksOf(reading, contentTokens, offset, sectionPath);
  const checkbox: ListItemCheckbox = item.task ? (item.checked === true ? 'checked' : 'unchecked') : null;
  return {
    lines, checkbox, label: itemLabelOf(blocks), blocks
  };
}

function listBlockOf(reading: Reading, token: Tokens.List, place: BlockPlace, offset: number): MarkdownBlock {
  let cursor = offset;
  const items = token.items.map((item) => {
    const located = locate(reading.index, item.raw, cursor);
    cursor = located.offset + located.length;
    return listItemOf(reading, item, located.offset, place.sectionPath);
  });
  return {
    ...place, kind: 'list', ordered: token.ordered, start: typeof token.start === 'number' ? token.start : 1, items
  };
}

function cellSpansOf(reading: Reading, cell: Tokens.TableCell, cursor: number): { readonly spans: MarkdownSpan[]; readonly cursor: number } {
  const located = locate(reading.index, cell.text, cursor);
  return { spans: spansOf(reading.index, cell.tokens, located.offset), cursor: located.offset + located.length };
}

function tableBlockOf(reading: Reading, token: Tokens.Table, place: BlockPlace, offset: number): MarkdownBlock {
  let cursor = offset;
  const rowOf = (cells: readonly Tokens.TableCell[]): MarkdownSpan[][] => cells.map((cell) => {
    const { spans, cursor: nextCursor } = cellSpansOf(reading, cell, cursor);
    cursor = nextCursor;
    return spans;
  });
  const header = rowOf(token.header);
  return {
    ...place, kind: 'table', header, rows: token.rows.map(rowOf)
  };
}

interface BlocksRead {
  readonly blocks:      MarkdownBlock[];
  readonly sectionPath: readonly string[];
}

function headingPathAfter(sectionPath: readonly string[], depthPath: readonly number[], depth: number, text: string): { path: string[]; depths: number[] } {
  const keptCount = depthPath.filter((keptDepth) => keptDepth < depth).length;
  return { path: [...sectionPath.slice(0, keptCount), text], depths: [...depthPath.slice(0, keptCount), depth] };
}

/** One block for each token that draws, in order; `space` and link definitions draw nothing. Headings move the section path. */
function blocksOf(reading: Reading, tokens: readonly Token[], startCursor: number, outerPath: readonly string[]): BlocksRead {
  const { index } = reading;
  let cursor = startCursor;
  let sectionPath = outerPath;
  let depthPath: number[] = outerPath.map((_heading, i) => i);
  const blocks: MarkdownBlock[] = [];
  tokens.forEach((token, position) => {
    const located = locate(index, token.raw, cursor);
    cursor = located.offset + located.length;
    if (token.type === 'space' || token.type === 'def') return;
    const lines = linesOf(index, located.offset, token.raw);
    if (token.type === 'heading') {
      const heading = token as Tokens.Heading;
      const spans = spansOf(index, heading.tokens, located.offset);
      const isTitle = reading.titleSkip && position === tokens.findIndex((candidate) => candidate.type === 'heading') && heading.depth === 1;
      blocks.push({
        lines, sectionPath, kind: 'heading', depth: heading.depth, spans
      });
      if (!isTitle) {
        const next = headingPathAfter(sectionPath, depthPath, heading.depth, inlineTextOf(spans).trim());
        sectionPath = next.path;
        depthPath = next.depths;
      }
      return;
    }
    const place: BlockPlace = { lines, sectionPath };
    const block = blockOf(reading, token, place, located.offset);
    if (block !== null) blocks.push(block);
  });
  return { blocks, sectionPath };
}

function blockOf(reading: Reading, token: Token, place: BlockPlace, offset: number): MarkdownBlock | null {
  const { index } = reading;
  switch (token.type) {
    case 'paragraph':
    case 'text': {
      const inlineTokens = (token as Tokens.Paragraph).tokens ?? [];
      const plainText: MarkdownSpan = { kind: 'text', text: (token as Tokens.Text).text, start: positionOf(index, offset) };
      const spans = inlineTokens.length > 0 ? spansOf(index, inlineTokens, offset) : [plainText];
      return { ...place, kind: 'paragraph', spans };
    }
    case 'list':
      return listBlockOf(reading, token as Tokens.List, place, offset);
    case 'code':
      return codeBlockOf(token as Tokens.Code, place);
    case 'blockquote':
      return { ...place, kind: 'quote', blocks: blocksOf({ ...reading, titleSkip: false }, (token as Tokens.Blockquote).tokens, offset, place.sectionPath).blocks };
    case 'table':
      return tableBlockOf(reading, token as Tokens.Table, place, offset);
    case 'hr':
      return { ...place, kind: 'rule' };
    case 'html':
      return { ...place, kind: 'paragraph', spans: [{ kind: 'text', text: token.raw.replace(/\n+$/u, ''), start: positionOf(index, offset) }] };
    default:
      return token.raw.trim() === '' ? null : { ...place, kind: 'paragraph', spans: [{ kind: 'text', text: token.raw.replace(/\n+$/u, ''), start: positionOf(index, offset) }] };
  }
}

function normalisedSourceOf(markdown: string): string {
  return markdown.replace(/\r\n?/gu, LINE_BREAK);
}

/** A document whose first heading is its only `#` has that heading as its title, which no section path names. */
function hasTitleHeading(tokens: readonly Token[]): boolean {
  const headings = tokens.filter((token): token is Tokens.Heading => token.type === 'heading');
  return headings[0]?.depth === 1 && headings.filter((heading) => heading.depth === 1).length === 1;
}

function blocksOfMarkdown(markdown: string): MarkdownBlock[] {
  const source = normalisedSourceOf(markdown);
  const tokens = new Lexer({ gfm: true }).lex(source);
  return blocksOf({ index: sourceIndexOf(source), titleSkip: hasTitleHeading(tokens) }, tokens, 0, []).blocks;
}

/** The plain text of spans, as a reader reads it: a quote or a section name. */
function plainTextOf(spans: readonly MarkdownSpan[]): string {
  return inlineTextOf(spans);
}

export const MarkdownBlocks = Object.freeze({ blocksOf: blocksOfMarkdown, plainTextOf });
