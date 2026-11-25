/**
 * The comment popover and the anchor line of a comment in the chat, pure: the comment's number, where it points (section, lines, view),
 * what the agent gets with it, and the command it sends. A comment is one chat message with an anchor; the next number follows the
 * highest one the document's messages hold.
 */
import type { MarkdownBlock }                                                                    from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import type { BoardCommandDocument }                                                             from '../../../@types/board/BoardCommandDocument.ts';
import type { BoardCommentView }                                                                 from '../../../@types/board/BoardVocabulary.ts';
import type { BoardCommentAnchorDocument, BoardDocumentMessageDocument, BoardLineRangeDocument } from '../../../@types/board/TicketDocumentsDocument.ts';
import { DocumentSelectionModel }                                                                from './DocumentSelectionModel.ts';
import { TicketDocumentCommands, type DocumentPlace }                                            from './TicketDocumentCommands.ts';

const VIEW_WORDS: Readonly<Record<BoardCommentView, string>> = { preview: 'Preview', code: 'Code' };

const SECTION_SEPARATOR = ' › ';

export interface CommentPopoverContent {
  readonly heading: string;
  /** The section line under the heading in Code, where the heading names lines alone; `null` in Preview. */
  readonly section: string | null;
  readonly quote:   string | null;
  readonly note:    string;
}

function linesTextOf(lines: BoardLineRangeDocument): string {
  return lines.from === lines.to ? `line ${lines.from}` : `lines ${lines.from}–${lines.to}`;
}

function sectionTextOf(sectionPath: readonly string[]): string | null {
  return sectionPath.length === 0 ? null : `§ ${sectionPath.join(SECTION_SEPARATOR)}`;
}

/** An anchor line's parts, so a card sets the comment's name and its lines in the mono face and the rest in the text face. */
export interface AnchorLineParts {
  readonly commentName: string;
  readonly section:     string | null;
  readonly linesText:   string;
  readonly viewWord:    string;
}

function nextCommentNumberOf(messages: readonly BoardDocumentMessageDocument[]): number {
  return messages.reduce((highest, message) => Math.max(highest, message.commentNumber ?? 0), 0) + 1;
}

/** The lines where the comment stands now, else where it was made. */
function anchorLinePartsOf(commentNumber: number, anchor: BoardCommentAnchorDocument, placement: BoardLineRangeDocument | null): AnchorLineParts {
  return {
    commentName: `C${commentNumber}`,
    section:     sectionTextOf(anchor.sectionPath),
    linesText:   linesTextOf(placement ?? anchor.lines),
    viewWord:    VIEW_WORDS[anchor.view],
  };
}

/** "C2 · § 4 Acceptance › A3 · line 29 · Preview". */
function anchorLineOf(commentNumber: number, anchor: BoardCommentAnchorDocument, placement: BoardLineRangeDocument | null): string {
  const parts = anchorLinePartsOf(commentNumber, anchor, placement);
  return [parts.commentName, parts.section, parts.linesText, parts.viewWord].filter((part) => part !== null).join(' · ');
}

function diagramNameOf(blocks: readonly MarkdownBlock[], anchor: BoardCommentAnchorDocument): string | null {
  const diagram = DocumentSelectionModel.diagramAtLine(blocks, anchor.lines.from);
  if (diagram === null) return null;
  return diagram.title === null ? 'mermaid block' : `mermaid block ${diagram.title}`;
}

function popoverContentOf(commentNumber: number, anchor: BoardCommentAnchorDocument, blocks: readonly MarkdownBlock[]): CommentPopoverContent {
  if (anchor.view === 'code') {
    const diagramName = diagramNameOf(blocks, anchor);
    const sectionPath = diagramName === null ? anchor.sectionPath : [...anchor.sectionPath, diagramName];
    return {
      heading: `C${commentNumber} · ${linesTextOf(anchor.lines)} · Code`,
      section: sectionTextOf(sectionPath),
      quote:   null,
      note:    'Same comment, same anchor, in either view.',
    };
  }
  const quote = anchor.diagram === null ? anchor.quote : anchor.diagram.nodeLabel;
  return {
    heading: anchorLineOf(commentNumber, anchor, null),
    section: null,
    quote,
    note:    `The agent gets ${anchor.diagram === null ? 'the quote' : 'the node'}, its section and ${linesTextOf(anchor.surroundingLines)}.`,
  };
}

/** The comment the popover sends; `null` while its text is empty. */
function commandOf(place: DocumentPlace, anchor: BoardCommentAnchorDocument, text: string): BoardCommandDocument | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : TicketDocumentCommands.commentOf(place, anchor, trimmed);
}

export const CommentPopoverModel = Object.freeze({
  linesTextOf,
  sectionTextOf,
  nextCommentNumberOf,
  anchorLinePartsOf,
  anchorLineOf,
  popoverContentOf,
  commandOf,
});
