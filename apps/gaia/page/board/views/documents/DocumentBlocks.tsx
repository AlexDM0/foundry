/**
 * A document's Markdown blocks as React elements, never as HTML: each piece of text, each line of a code block among them, carries the
 * source line and column where it starts, so a selection maps back to the source; a character reference draws the character it names; a
 * link keeps only an allowed target; a diagram is drawn by the diagram frame. After the text of
 * a paragraph, heading or list item go the marks of the lines it holds: a comment's chip (`C2`, `✓ C2` once applied) and a reference
 * mark of the effect reading (`1`, in the warning look while its place is unresolved). The caller may place its own part after the
 * innermost such block that holds a line, such as an agent's proposed edit or the comment popover.
 */
import { Fragment, type ReactNode } from 'react';

import type {
  MarkdownBlock,
  MarkdownListItem,
  MarkdownSpan,
  SourceLines
} from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import type { DiagramNode } from '../../../shared/@types/DiagramFrameMessages.ts';
import { DiagramFrame }     from './DiagramFrame.tsx';

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
}

/** A part of the caller's, placed after the innermost paragraph, heading, list item or other block that holds its line. */
export interface PlacedPart {
  readonly key:  string;
  readonly line: number;
  readonly part: ReactNode;
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
  readonly onNodeComment?:  (diagram: DiagramBlock, node: DiagramNode) => void;
  readonly nodeOfferOf?:    (diagram: DiagramBlock, node: DiagramNode) => string;
}

const CHECKBOX_GLYPHS = { checked: '☑', unchecked: '☐' } as const;

const HEADING_ELEMENTS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

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

function Spans({ spans }: { readonly spans: readonly MarkdownSpan[] }) {
  return spans.map((span, position) => <Span key={position} span={span} />);
}

function Span({ span }: { readonly span: MarkdownSpan }) {
  switch (span.kind) {
    case 'text':
      return <span data-source-line={span.start.line} data-source-column={span.start.column}>{span.text}</span>;
    case 'code':
      return <code className="board-document-inline-code" data-source-line={span.start.line} data-source-column={span.start.column}>{span.text}</code>;
    case 'reference':
      return <span data-source-line={span.start.line} data-source-column={span.start.column}>{characterOf(span.reference)}</span>;
    case 'strong':
      return <strong><Spans spans={span.spans} /></strong>;
    case 'emphasis':
      return <em><Spans spans={span.spans} /></em>;
    case 'deleted':
      return <del><Spans spans={span.spans} /></del>;
    case 'link':
      return span.href === null
        ? <Spans spans={span.spans} />
        : <a className="board-document-link" href={span.href} target="_blank" rel="noreferrer noopener"><Spans spans={span.spans} /></a>;
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

function PartsAfter({ lines, props, nestedItems }: { readonly lines: SourceLines; readonly props: DocumentBlocksProps; readonly nestedItems: readonly SourceLines[] }) {
  const own = (props.parts ?? []).filter((placed) => lineIsIn(placed.line, lines) && !nestedItems.some((nested) => lineIsIn(placed.line, nested)));
  return own.map((placed) => <Fragment key={placed.key}>{placed.part}</Fragment>);
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
      {item.checkbox === null ? null : <span className="board-document-checkbox" aria-label={item.checkbox}>{CHECKBOX_GLYPHS[item.checkbox]}</span>}
      <span className="board-document-item-text">
        {item.blocks.map((block, position) => (
          block.kind === 'paragraph'
            ? <Fragment key={position}><Spans spans={block.spans} />{' '}</Fragment>
            : <Block key={position} block={block} props={props} />
        ))}
        <Marks lines={item.lines} props={props} nestedItems={nestedItems} />
      </span>
      <PartsAfter lines={item.lines} props={props} nestedItems={nestedItems} />
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
  switch (block.kind) {
    case 'heading': {
      const Heading = HEADING_ELEMENTS[Math.min(Math.max(block.depth, 1), HEADING_ELEMENTS.length) - 1] ?? 'h6';
      return <Heading className="board-document-heading" {...attributes}><Spans spans={block.spans} /><Marks lines={block.lines} props={props} nestedItems={[]} /></Heading>;
    }
    case 'paragraph':
      return <p className="board-document-paragraph" {...attributes}><Spans spans={block.spans} /><Marks lines={block.lines} props={props} nestedItems={[]} /></p>;
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
              return <span key={i} data-source-line={start.line} data-source-column={start.column}>{isLast ? codeLine : `${codeLine}\n`}</span>;
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
          <thead><tr>{block.header.map((cell, position) => <th key={position}><Spans spans={cell} /></th>)}</tr></thead>
          <tbody>
            {block.rows.map((row, rowPosition) => <tr key={rowPosition}>{row.map((cell, position) => <td key={position}><Spans spans={cell} /></td>)}</tr>)}
          </tbody>
        </table>
      );
    case 'rule':
      return <hr className="board-document-rule" {...attributes} />;
  }
}

/** A list and a quote hold blocks of their own, which place the parts. */
function Block({ block, props }: { readonly block: MarkdownBlock; readonly props: DocumentBlocksProps }) {
  const holdsBlocks = block.kind === 'list' || block.kind === 'quote';
  return (
    <>
      <BlockElement block={block} props={props} />
      {holdsBlocks ? null : <PartsAfter lines={block.lines} props={props} nestedItems={[]} />}
    </>
  );
}

function BlockList({ blocks, props }: { readonly blocks: readonly MarkdownBlock[]; readonly props: DocumentBlocksProps }) {
  return blocks.map((block) => <Block key={`${block.kind}.${block.lines.from}`} block={block} props={props} />);
}

export function DocumentBlocks(props: DocumentBlocksProps) {
  return <BlockList blocks={props.blocks} props={props} />;
}
