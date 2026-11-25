/**
 * Preview: the document drawn from its Markdown by the page itself, with each comment's chip after its text and the effect reading's
 * reference marks, an open proposal inline where it lands, and the comment popover after the text it points at. A selection opens the
 * popover with an anchor of source lines, columns, quote and section, also one in code or one that ends on a chip, a checkbox or the edge of
 * a block; a hovered diagram node offers a comment on its own line. Read-only
 * text still takes comments: a comment changes no text.
 */
import { useMemo, type MouseEvent, type ReactNode } from 'react';

import { MarkdownBlocks, type MarkdownBlock, type SourcePosition } from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import type { BoardDocumentMessageDocument }                       from '../../../@types/board/TicketDocumentsDocument.ts';
import type { DiagramNode }                                        from '../../../shared/@types/DiagramFrameMessages.ts';
import { CommentPopover, type CommentDraft }                       from './CommentPopover.tsx';
import { CommentPopoverModel }                                     from './CommentPopoverModel.ts';
import {
  DocumentBlocks,
  type CommentChip,
  type PlacedPart,
  type ReferenceMark
} from './DocumentBlocks.tsx';
import { DocumentSelectionModel, type PreviewSelection } from './DocumentSelectionModel.ts';
import { InlineProposal }                                from './ProposalCard.tsx';
import type { OpenProposalModel }                        from './ProposalModel.ts';
import type { DocumentPlace }                            from './TicketDocumentCommands.ts';

type DiagramBlock = Extract<MarkdownBlock, { readonly kind: 'diagram' }>;

export interface DocumentPreviewProps {
  readonly place:          DocumentPlace;
  readonly markdown:       string;
  /** The version a comment is made on: the head, `null` before the first. */
  readonly versionNumber:  number | null;
  readonly messages:       readonly BoardDocumentMessageDocument[];
  readonly proposals:      readonly OpenProposalModel[];
  readonly referenceMarks: readonly ReferenceMark[];
  readonly draft:          CommentDraft | null;
  readonly onDraft:        (draft: CommentDraft | null) => void;
  /** The document can no longer change: its proposals offer nothing. */
  readonly settled:        boolean;
  /** Drawn above the document, such as the plan's context line. */
  readonly lead?:          ReactNode;
  /** The comment text a screen shows half written in the popover. */
  readonly draftText?:     string;
}

const OPEN_MESSAGE_STATES: ReadonlySet<string> = new Set(['queued', 'sent']);

function chipsOf(messages: readonly BoardDocumentMessageDocument[]): CommentChip[] {
  return messages.flatMap((message): CommentChip[] => {
    if (message.commentNumber === null || message.placement === null || message.state === 'withdrawn') return [];
    const applied = message.state === 'applied';
    return [{
      key:   message.messageId,
      line:  message.placement.to,
      text:  applied ? `✓ C${message.commentNumber}` : `C${message.commentNumber}`,
      applied,
      title: applied ? `Comment C${message.commentNumber}, applied` : `Comment C${message.commentNumber}`,
    }];
  });
}

/** Which end of a selection a point is: a start reads the text after it, an end the text before it. */
type SelectionSide = 'start' | 'end';

interface TextPoint {
  readonly text:   Text;
  readonly offset: number;
}

/** The span of a text that carries its source line and column, each holding one text. */
function sourceSpanOf(text: Text): HTMLElement | null {
  return text.parentElement?.closest<HTMLElement>('[data-source-line]') ?? null;
}

/** The texts of the article that carry a source position, in document order. */
function sourceTextsOf(root: Element): Text[] {
  const texts: Text[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node instanceof Text && sourceSpanOf(node) !== null) texts.push(node);
  }
  return texts;
}

/**
 * The source text a selection's end stands in: its own text when that carries a source position, else the nearest source text after a
 * start or before an end, so an end on a comment's chip, a checkbox or a diagram's caption, or on the edge of a block, as a triple click
 * leaves it, still maps to the source.
 */
function sourceTextPointOf(root: Element, node: Node, offset: number, side: SelectionSide): TextPoint | null {
  if (node instanceof Text && sourceSpanOf(node) !== null) return { text: node, offset };
  const point = root.ownerDocument.createRange();
  point.setStart(node, offset);
  const texts = sourceTextsOf(root);
  if (side === 'start') {
    const after = texts.find((text) => point.comparePoint(text, 0) >= 0);
    return after === undefined ? null : { text: after, offset: 0 };
  }
  const before = texts.findLast((text) => point.comparePoint(text, text.length) <= 0);
  return before === undefined ? null : { text: before, offset: before.length };
}

function sourcePointOf(root: Element, node: Node, offset: number, side: SelectionSide): SourcePosition | null {
  const point = sourceTextPointOf(root, node, offset, side);
  const span = point === null ? null : sourceSpanOf(point.text);
  if (point === null || span === null) return null;
  const start = { line: Number(span.dataset['sourceLine']), column: Number(span.dataset['sourceColumn']) };
  if (!Number.isFinite(start.line) || !Number.isFinite(start.column)) return null;
  return DocumentSelectionModel.positionInSpan(start, span.textContent ?? '', point.offset);
}

/** The window's selection in the article as source positions; `null` when it holds no text of the document. */
export function previewSelectionOf(selection: Selection | null, root: Element): PreviewSelection | null {
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const start = sourcePointOf(root, range.startContainer, range.startOffset, 'start');
  const end = sourcePointOf(root, range.endContainer, range.endOffset, 'end');
  if (start === null || end === null) return null;
  if (end.line < start.line || (end.line === start.line && end.column <= start.column)) return null;
  return { start, end, quote: selection.toString() };
}

export function DocumentPreview({
  place, markdown, versionNumber, messages, proposals, referenceMarks, draft, onDraft, settled, lead, draftText
}: DocumentPreviewProps) {
  const blocks = useMemo(() => MarkdownBlocks.blocksOf(markdown), [markdown]);
  const lineCount = useMemo(() => markdown.split('\n').length, [markdown]);
  const nextCommentNumber = CommentPopoverModel.nextCommentNumberOf(messages);
  const openPlacements = messages.flatMap((message) => (OPEN_MESSAGE_STATES.has(message.state) && message.placement !== null ? [message.placement] : []));
  const placedProposals = proposals.filter((proposal) => proposal.headLines !== null);

  const parts: PlacedPart[] = [
    ...placedProposals.map((proposal): PlacedPart => ({
      key:  proposal.proposalId,
      line: proposal.headLines?.to ?? 1,
      part: <InlineProposal place={place} proposal={proposal} settled={settled} />,
    })),
    ...(draft === null ? [] : [{
      key:  'comment-popover',
      line: draft.anchor.lines.to,
      part: (
        <CommentPopover
          key={JSON.stringify(draft.anchor)}
          place={place}
          draft={draft}
          blocks={blocks}
          onClose={() => onDraft(null)}
          {...(draftText === undefined ? {} : { initialText: draftText })}
        />
      ),
    }]),
  ];

  const commentOnSelection = (event: MouseEvent<HTMLElement>): void => {
    if (versionNumber === null) return;
    const selection = previewSelectionOf(window.getSelection(), event.currentTarget);
    if (selection === null) return;
    onDraft({ commentNumber: nextCommentNumber, anchor: DocumentSelectionModel.anchorOfPreviewSelection(blocks, lineCount, versionNumber, selection) });
  };
  const commentOnNode = (diagram: DiagramBlock, node: DiagramNode): void => {
    if (versionNumber === null) return;
    onDraft({ commentNumber: nextCommentNumber, anchor: DocumentSelectionModel.anchorOfNode(blocks, lineCount, versionNumber, diagram, node) });
  };

  return (
    <article className="board-document-article" aria-label={`The ${place.document}`} onMouseUp={commentOnSelection}>
      {lead}
      <DocumentBlocks
        blocks={blocks}
        chips={chipsOf(messages)}
        referenceMarks={referenceMarks}
        commentedLines={openPlacements}
        replacedLines={placedProposals.flatMap((proposal) => (proposal.headLines === null ? [] : [proposal.headLines]))}
        parts={parts}
        onNodeComment={commentOnNode}
        nodeOfferOf={(diagram, node) => `+ Comment on node · line ${DocumentSelectionModel.nodeSourceLineOf(diagram, node.nodeId)}`}
      />
    </article>
  );
}
