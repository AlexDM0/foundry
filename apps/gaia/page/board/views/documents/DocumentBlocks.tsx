/**
 * A document's Markdown blocks as React elements, never as HTML: each piece of text, each line of a code block among them, carries the
 * source line and column where it starts, so a selection maps back to the source; a character reference draws the character it names; a
 * link keeps only an allowed target; a diagram is drawn by the diagram frame. After the text of a paragraph, heading or list item go the
 * marks of the lines it holds: a comment's chip (`C2`, `✓ C2` once applied) and a reference mark of the effect reading (`1`, in the
 * warning look while its place is unresolved, the words it quotes then underlined). The caller may place its own part after the
 * innermost such block that holds a line, such as an agent's proposed edit or the comment popover, and frame the part with that block, as
 * an edit with the lines it replaces. The text an open comment points at stays marked.
 */
import {
  createContext,
  Fragment,
  useContext,
  type ReactNode
} from 'react';

import type {
  MarkdownBlock,
  MarkdownListItem,
  MarkdownSpan,
  SourceLines,
  SourcePosition
} from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import type { DiagramNode }                         from '../../../shared/@types/DiagramFrameMessages.ts';
import { DiagramFrame }                             from './DiagramFrame.tsx';
import { DocumentSelectionModel, type MarkedRange } from './DocumentSelectionModel.ts';

type DiagramBlock = Extract<MarkdownBlock, { readonly kind: 'diagram' }>;

export interface CommentChip {
  readonly key:     string;
  readonly line:    number;
  readonly text:    string;
  readonly applied: boolean;
  readonly title:   string;
}

export interface ReferenceMark {
  readonly reference:  number;
  readonly line:       number;
  readonly unresolved: boolean;
  /** The words of the plan the reference reads, and the lines they stand on. */
  readonly quote:      string;
  readonly quoteLines: SourceLines;
}

/** A part of the caller's, placed after the innermost paragraph, heading, list item or other block that holds its line. */
export interface PlacedPart {
  readonly key:          string;
  readonly line:         number;
  readonly part:         ReactNode;
  /** Lines the part is framed with: the block it follows shares its frame when that block holds them all. */
  readonly framedLines?: SourceLines;
}

export interface DocumentBlocksProps {
  readonly blocks:          readonly MarkdownBlock[];
  readonly chips?:          readonly CommentChip[];
  readonly referenceMarks?: readonly ReferenceMark[];
  /** Lines an open comment points at, drawn with the comment's tint. */
  readonly commentedLines?: readonly SourceLines[];
  /** Lines an open proposal replaces, drawn struck through. */
  readonly replacedLines?:  readonly SourceLines[];
  readonly parts?:          readonly PlacedPart[];
  /** The text an open comment points at, drawn marked. */
  readonly markedRange?:    MarkedRange | null;
  readonly onNodeComment?:  (diagram: DiagramBlock, node: DiagramNode) => void;
  readonly nodeOfferOf?:    (diagram: DiagramBlock, node: DiagramNode) => string;
}

const CHECKBOX_GLYPHS = { checked: '☑', unchecked: '☐' } as const;

const HEADING_ELEMENTS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

function unresolvedPlacesOf(props: DocumentBlocksProps): UnresolvedPlace[] {
  return (props.referenceMarks ?? []).filter((mark) => mark.unresolved);
}

function overlaps(lines: SourceLines, other: SourceLines): boolean {
  return lines.from <= other.to && other.from <= lines.to;
}

function lineIsIn(line: number, lines: SourceLines): boolean {
  return lines.from <= line && line <= lines.to;
}

const charactersOfReferences = new Map<string, string>();

/** The character a reference names, read by the browser's HTML parser from the reference alone, which holds no markup; itself without one. */
function characterOf(reference: string): string {
  const known = charactersOfReferences.get(reference);
  if (known !== undefined) return known;
  if (typeof DOMParser === 'undefined') return reference;
  const character = new DOMParser().parseFromString(reference, 'text/html').body.textContent ?? '';
  const read = character === '' ? reference : character;
  charactersOfReferences.set(reference, read);
  return read;
}

const MarkedRangeContext = createContext<MarkedRange | null>(null);

interface SourceTextProps {
  readonly text:        string;
  readonly start:       SourcePosition;
  readonly unresolved?: boolean;
}

function SourceRun({ text, start, unresolved }: SourceTextProps) {
  return unresolved === true
    ? <span className="board-document-unresolved-place" data-source-line={start.line} data-source-column={start.column}>{text}</span>
    : <span data-source-line={start.line} data-source-column={start.column}>{text}</span>;
}

/** A piece of source text, carrying where it starts, with the part of it inside the marked range drawn marked. */
function SourceText({ text, start, unresolved = false }: SourceTextProps) {
  const markedRange = useContext(MarkedRangeContext);
  const marked = markedRange === null ? null : DocumentSelectionModel.markedOffsetsInSpan(start, text, markedRange);
  if (marked === null) return <SourceRun text={text} start={start} unresolved={unresolved} />;
  const startOf = (offset: number) => DocumentSelectionModel.positionInSpan(start, text, offset);
  const markedStart = startOf(marked.from);
  const afterStart = startOf(marked.to);
  return (
    <>
      {marked.from === 0 ? null : <SourceRun text={text.slice(0, marked.from)} start={start} unresolved={unresolved} />}
      <mark
        className={unresolved ? 'board-document-marked board-document-unresolved-place' : 'board-document-marked'}
        data-source-line={markedStart.line}
        data-source-column={markedStart.column}
      >
        {text.slice(marked.from, marked.to)}
      </mark>
      {marked.to === text.length ? null : <SourceRun text={text.slice(marked.to)} start={afterStart} unresolved={unresolved} />}
    </>
  );
}

type UnresolvedPlace = Pick<ReferenceMark, 'quote' | 'quoteLines'>;

interface TextPiece {
  readonly text:       string;
  readonly offset:     number;
  readonly unresolved: boolean;
}

function quotesAt(line: number, places: readonly UnresolvedPlace[]): string[] {
  return places.filter((place) => place.quote !== '' && lineIsIn(line, place.quoteLines)).map((place) => place.quote);
}

/** A text cut where an unresolved place's quote stands in it, so the quote alone is underlined. */
function piecesOf(text: string, quotes: readonly string[]): TextPiece[] {
  const pieces: TextPiece[] = [];
  let offset = 0;
  while (offset < text.length) {
    const found = quotes
      .map((quote) => ({ quote, at: text.indexOf(quote, offset) }))
      .filter((match) => match.at >= 0)
      .sort((a, b) => a.at - b.at)[0];
    if (found === undefined) break;
    if (found.at > offset) pieces.push({ text: text.slice(offset, found.at), offset, unresolved: false });
    pieces.push({ text: found.quote, offset: found.at, unresolved: true });
    offset = found.at + found.quote.length;
  }
  if (offset < text.length || pieces.length === 0) pieces.push({ text: text.slice(offset), offset, unresolved: false });
  return pieces;
}

function TextSpan({ span, places }: { readonly span: Extract<MarkdownSpan, { readonly kind: 'text' }>; readonly places: readonly UnresolvedPlace[] }) {
  return piecesOf(span.text, quotesAt(span.start.line, places)).map((piece) => {
    const start = DocumentSelectionModel.positionInSpan(span.start, span.text, piece.offset);
    return <SourceText key={piece.offset} text={piece.text} start={start} unresolved={piece.unresolved} />;
  });
}

function Spans({ spans, places }: { readonly spans: readonly MarkdownSpan[]; readonly places: readonly UnresolvedPlace[] }) {
  return spans.map((span, position) => <Span key={position} span={span} places={places} />);
}

function Span({ span, places }: { readonly span: MarkdownSpan; readonly places: readonly UnresolvedPlace[] }) {
  switch (span.kind) {
    case 'text':
      return <TextSpan span={span} places={places} />;
    case 'code':
      return (
        <code
          className="board-document-inline-code"
          data-unresolved={quotesAt(span.start.line, places).some((quote) => span.text.includes(quote)) ? '' : undefined}
        >
          <SourceText text={span.text} start={span.start} />
        </code>
      );
    case 'reference':
      return <span data-source-line={span.start.line} data-source-column={span.start.column}>{characterOf(span.reference)}</span>;
    case 'strong':
      return <strong><Spans spans={span.spans} places={places} /></strong>;
    case 'emphasis':
      return <em><Spans spans={span.spans} places={places} /></em>;
    case 'deleted':
      return <del><Spans spans={span.spans} places={places} /></del>;
    case 'link':
      return span.href === null
        ? <Spans spans={span.spans} places={places} />
        : <a className="board-document-link" href={span.href} target="_blank" rel="noreferrer noopener"><Spans spans={span.spans} places={places} /></a>;
    case 'line-break':
      return <br />;
  }
}

/** The chips and reference marks of the lines a block holds, outside any list item nested in it. */
function Marks({ lines, props, nestedItems }: { readonly lines: SourceLines; readonly props: DocumentBlocksProps; readonly nestedItems: readonly SourceLines[] }) {
  const ownLine = (line: number): boolean => lineIsIn(line, lines) && !nestedItems.some((nested) => lineIsIn(line, nested));
  const chips = (props.chips ?? []).filter((chip) => ownLine(chip.line));
  const marks = (props.referenceMarks ?? []).filter((mark) => ownLine(mark.line));
  if (chips.length === 0 && marks.length === 0) return null;
  return (
    <>
      {chips.map((chip) => (
        <span key={chip.key} className="board-document-chip" data-applied={chip.applied ? '' : undefined} title={chip.title}>{chip.text}</span>
      ))}
      {marks.map((mark) => (
        <span
          key={mark.reference}
          className="board-document-reference"
          data-unresolved={mark.unresolved ? '' : undefined}
          title={mark.unresolved ? `Place ${mark.reference}, unresolved` : `Place ${mark.reference}`}
        >
          {mark.reference}
        </span>
      ))}
    </>
  );
}

function ownPartsOf(lines: SourceLines, props: DocumentBlocksProps, nestedItems: readonly SourceLines[]): PlacedPart[] {
  return (props.parts ?? []).filter((placed) => lineIsIn(placed.line, lines) && !nestedItems.some((nested) => lineIsIn(placed.line, nested)));
}

function PartsAfter({ lines, props, nestedItems }: { readonly lines: SourceLines; readonly props: DocumentBlocksProps; readonly nestedItems: readonly SourceLines[] }) {
  return ownPartsOf(lines, props, nestedItems).map((placed) => <Fragment key={placed.key}>{placed.part}</Fragment>);
}

/** A block shares its frame with a part it is followed by when it holds all the lines the part is framed with. */
function isFramed(lines: SourceLines, props: DocumentBlocksProps, nestedItems: readonly SourceLines[]): boolean {
  return ownPartsOf(lines, props, nestedItems).some(({ framedLines }) => framedLines !== undefined && lines.from <= framedLines.from && framedLines.to <= lines.to);
}

function Framed({ framed, children }: { readonly framed: boolean; readonly children: ReactNode }) {
  return framed ? <div className="board-document-proposal-frame">{children}</div> : children;
}

function lineAttributesOf(lines: SourceLines, props: DocumentBlocksProps) {
  return {
    'data-from-line': lines.from,
    'data-to-line':   lines.to,
    'data-commented': (props.commentedLines ?? []).some((commented) => overlaps(lines, commented)) ? '' : undefined,
    'data-replaced':  (props.replacedLines ?? []).some((replaced) => overlaps(lines, replaced)) ? '' : undefined,
  };
}

function ListItem({ item, props }: { readonly item: MarkdownListItem; readonly props: DocumentBlocksProps }) {
  const nestedItems = item.blocks.flatMap((block) => (block.kind === 'list' ? block.items.map((nested) => nested.lines) : []));
  return (
    <li className="board-document-list-item" data-task={item.checkbox === null ? undefined : ''} {...lineAttributesOf(item.lines, props)}>
      <Framed framed={isFramed(item.lines, props, nestedItems)}>
        {item.checkbox === null ? null : <span className="board-document-checkbox" aria-label={item.checkbox}>{CHECKBOX_GLYPHS[item.checkbox]}</span>}
        <span className="board-document-item-text">
          {item.blocks.map((block, position) => (
            block.kind === 'paragraph'
              ? <Fragment key={position}><Spans spans={block.spans} places={unresolvedPlacesOf(props)} />{' '}</Fragment>
              : <Block key={position} block={block} props={props} />
          ))}
          <Marks lines={item.lines} props={props} nestedItems={nestedItems} />
        </span>
        <PartsAfter lines={item.lines} props={props} nestedItems={nestedItems} />
      </Framed>
    </li>
  );
}

function DiagramFigure({ block, props }: { readonly block: DiagramBlock; readonly props: DocumentBlocksProps }) {
  const { onNodeComment, nodeOfferOf } = props;
  return (
    <figure className="board-document-diagram" {...lineAttributesOf(block.lines, props)}>
      <figcaption className="board-document-diagram-caption">{block.title === null ? 'Diagram' : `Diagram · ${block.title}`}</figcaption>
      <DiagramFrame
        title={block.title ?? 'Diagram'}
        source={block.source}
        {...(onNodeComment === undefined ? {} : { onNodeComment: (node: DiagramNode) => onNodeComment(block, node) })}
        {...(nodeOfferOf === undefined ? {} : { offerLabelOf: (node: DiagramNode) => nodeOfferOf(block, node) })}
      />
    </figure>
  );
}

function BlockElement({ block, props }: { readonly block: MarkdownBlock; readonly props: DocumentBlocksProps }) {
  const attributes = lineAttributesOf(block.lines, props);
  const places = unresolvedPlacesOf(props);
  switch (block.kind) {
    case 'heading': {
      const Heading = HEADING_ELEMENTS[Math.min(Math.max(block.depth, 1), HEADING_ELEMENTS.length) - 1] ?? 'h6';
      return (
        <Heading className="board-document-heading" {...attributes}>
          <Spans spans={block.spans} places={places} />
          <Marks lines={block.lines} props={props} nestedItems={[]} />
        </Heading>
      );
    }
    case 'paragraph':
      return <p className="board-document-paragraph" {...attributes}><Spans spans={block.spans} places={places} /><Marks lines={block.lines} props={props} nestedItems={[]} /></p>;
    case 'list': {
      const items = block.items.map((item, position) => <ListItem key={position} item={item} props={props} />);
      return block.ordered
        ? <ol className="board-document-list" start={block.start} {...attributes}>{items}</ol>
        : <ul className="board-document-list" data-tasks={block.items.some((item) => item.checkbox !== null) ? '' : undefined} {...attributes}>{items}</ul>;
    }
    case 'code': {
      const codeLines = block.text.split('\n');
      return (
        <pre className="board-document-code" {...attributes}>
          <code>
            {codeLines.map((codeLine, i) => {
              const start = block.lineStarts[i] ?? { line: block.lines.from, column: 1 };
              const isLast = i === codeLines.length - 1;
              return <SourceText key={i} text={isLast ? codeLine : `${codeLine}\n`} start={start} />;
            })}
          </code>
        </pre>
      );
    }
    case 'diagram':
      return <DiagramFigure block={block} props={props} />;
    case 'quote':
      return <blockquote className="board-document-quote" {...attributes}><BlockList blocks={block.blocks} props={props} /></blockquote>;
    case 'table':
      return (
        <table className="board-document-table" {...attributes}>
          <thead><tr>{block.header.map((cell, position) => <th key={position}><Spans spans={cell} places={places} /></th>)}</tr></thead>
          <tbody>
            {block.rows.map((row, rowPosition) => <tr key={rowPosition}>{row.map((cell, position) => <td key={position}><Spans spans={cell} places={places} /></td>)}</tr>)}
          </tbody>
        </table>
      );
    case 'rule':
      return <hr className="board-document-rule" {...attributes} />;
  }
}

/** A list and a quote hold blocks of their own, which place the parts. */
function Block({ block, props }: { readonly block: MarkdownBlock; readonly props: DocumentBlocksProps }) {
  if (block.kind === 'list' || block.kind === 'quote') return <BlockElement block={block} props={props} />;
  return (
    <Framed framed={isFramed(block.lines, props, [])}>
      <BlockElement block={block} props={props} />
      <PartsAfter lines={block.lines} props={props} nestedItems={[]} />
    </Framed>
  );
}

function BlockList({ blocks, props }: { readonly blocks: readonly MarkdownBlock[]; readonly props: DocumentBlocksProps }) {
  return blocks.map((block) => <Block key={`${block.kind}.${block.lines.from}`} block={block} props={props} />);
}

/** Each document drawn marks only its own text, so an edit's new lines drawn inside the document mark none of it. */
export function DocumentBlocks(props: DocumentBlocksProps) {
  return (
    <MarkedRangeContext value={props.markedRange ?? null}>
      <BlockList blocks={props.blocks} props={props} />
    </MarkedRangeContext>
  );
}
