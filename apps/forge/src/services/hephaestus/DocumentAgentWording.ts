/**
 * The lines Hephaestus writes to a document agent for each delivered message: one JSON object a comment hands the agent, its lines read at
 * the head the agent sees, and after it the head with line numbers when the head changed since the agent last saw it. The object is data
 * the agent reads, so it carries the record's values, never prose.
 */
import type { DocumentMessage, LineRange, TicketDocumentKind } from '../../lib/tracker-model/@types/TicketDocument.ts';

/** The head the agent sees: its version number, and its text when the agent has not seen it yet. */
export interface SeenHead {
  versionNumber: number | null;
  /** `null` when the agent saw this head already. */
  changedText:   string | null;
}

/** A line range as the anchor payload writes it: `[from, to]`. */
function pairOf(range: LineRange): [number, number] {
  return [range.from, range.to];
}

/** The text with each line numbered from 1, as `12| text`, so an agent names a line by its number. */
function numberedTextOf(text: string): string {
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  const width = String(lines.length).length;
  return lines.map((line, index) => `${String(index + 1).padStart(width, ' ')}| ${line}`).join('\n');
}

/**
 * The payload of a delivered message: an anchored comment names its comment, view, lines at the head, columns, section, quote, surrounding
 * lines and diagram; an orphaned one keeps its quote and names no lines. A message from the board says so.
 */
function messagePayloadOf(message: Readonly<DocumentMessage>, document: TicketDocumentKind, headNumber: number | null): Record<string, unknown> {
  const { anchor } = message;
  const placement  = message.orphaned === true ? undefined : message.placement;
  return {
    ...(message.commentNumber === undefined ? {} : { comment: `C${message.commentNumber}` }),
    ...(message.from === 'board' ? { from: 'board' } : {}),
    ...(anchor === undefined ? {} : { view: anchor.view }),
    document,
    version: headNumber,
    ...(anchor === undefined ? {} : { sentOnVersion: anchor.versionNumber }),
    ...(placement === undefined ? {} : { lines: pairOf(placement) }),
    ...(anchor?.columns === undefined || placement === undefined ? {} : { columns: pairOf(anchor.columns) }),
    ...(anchor === undefined ? {} : { section: [...anchor.sectionPath] }),
    ...(anchor?.quote === undefined ? {} : { quote: anchor.quote }),
    ...(anchor === undefined || placement === undefined ? {} : { around: pairOf(aroundOf(anchor.surroundingLines, anchor.lines, placement)) }),
    ...(message.orphaned === true ? { orphaned: true } : {}),
    ...(anchor?.diagram === undefined ? {} : {
      diagram: {
        lines: pairOf(anchor.diagram.lines), kind: anchor.diagram.diagramKind, node: anchor.diagram.nodeId, label: anchor.diagram.nodeLabel
      },
    }),
    text: message.text,
  };
}

/** The surrounding lines move with the anchor: the same margin around its placement at the head as around its lines when sent. */
function aroundOf(surroundingLines: LineRange, sentLines: LineRange, placement: LineRange): LineRange {
  const before = Math.max(0, sentLines.from - surroundingLines.from);
  const after  = Math.max(0, surroundingLines.to - sentLines.to);
  return { from: Math.max(1, placement.from - before), to: placement.to + after };
}

/** The line written to the agent's session for one message. */
function messageLineOf(message: Readonly<DocumentMessage>, document: TicketDocumentKind, head: SeenHead): string {
  const payload = JSON.stringify(messagePayloadOf(message, document, head.versionNumber), null, 2);
  if (head.changedText === null) return payload;
  return `${payload}\n\nThe ${document} at version ${head.versionNumber ?? 0}:\n\n${numberedTextOf(head.changedText)}`;
}

export const DocumentAgentWording = Object.freeze({ numberedTextOf, messagePayloadOf, messageLineOf });
