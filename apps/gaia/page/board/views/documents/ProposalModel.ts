/**
 * An agent's proposed edit, pure: where it lands on the head version, its removed and inserted lines, the diff rows of its chat card, the
 * note a settled one leaves in the chat, and the Apply and Discard it sends. Apply sends the agent's lines, Edit first User's own for each
 * edit; the forge lands either on the newest text, never over it.
 */
import type { BoardCommandDocument }                                  from '../../../@types/board/BoardCommandDocument.ts';
import type { BoardTicketDocumentKind }                               from '../../../@types/board/BoardVocabulary.ts';
import type { BoardDocumentProposalDocument, BoardLineRangeDocument } from '../../../@types/board/TicketDocumentsDocument.ts';
import { TicketDocumentCommands, type DocumentPlace }                 from './TicketDocumentCommands.ts';

export const AGENT_NAMES: Readonly<Record<BoardTicketDocumentKind, string>> = { spec: 'Spec agent', plan: 'Plan agent' };

export interface DiffRow {
  readonly key:        string;
  readonly lineNumber: number;
  readonly sign:       '−' | '+';
  readonly text:       string;
}

export interface OpenProposalModel {
  readonly proposalId:       string;
  /** Where the proposal lands on the head version; `null` when the forge could not place it. */
  readonly headLines:        BoardLineRangeDocument | null;
  /** "Spec agent proposes · line 29 only", or "Plan agent proposes, for spec v6" for a plan the spec moved under. */
  readonly label:            string;
  readonly summary:          string;
  readonly removedLines:     readonly string[];
  readonly insertedLines:    readonly string[];
  readonly diffRows:         readonly DiffRow[];
  /** "line 29" or "lines 17–23": the lines the chat card names. */
  readonly linesText:        string;
  /** Each edit's own lines, which Edit first fills its fields with. */
  readonly replacementLines: readonly (readonly string[])[];
}

function linesTextOf(lines: BoardLineRangeDocument): string {
  return lines.from === lines.to ? `line ${lines.from}` : `lines ${lines.from}–${lines.to}`;
}

/** The lines the edits touch in the version they were made on, as the chat names them: "lines 20, 37–39". */
function editedLinesTextOf(proposal: BoardDocumentProposalDocument): string {
  const ranges = proposal.edits.map((edit) => {
    const to = edit.fromLine + Math.max(edit.replacementLines.length, 1) - 1;
    return to === edit.fromLine ? `${edit.fromLine}` : `${edit.fromLine}–${to}`;
  });
  return `${ranges.length === 1 && !ranges[0]?.includes('–') ? 'line' : 'lines'} ${ranges.join(', ')}`;
}

function placeOf(proposal: BoardDocumentProposalDocument): BoardLineRangeDocument {
  if (proposal.headLines !== null) return proposal.headLines;
  const [first] = proposal.edits;
  const last = proposal.edits.at(-1);
  return { from: first?.fromLine ?? 1, to: Math.max(last?.toLine ?? 1, first?.fromLine ?? 1) };
}

function diffRowsOf(proposal: BoardDocumentProposalDocument): DiffRow[] {
  const startLine = proposal.headLines?.from ?? proposal.edits[0]?.fromLine ?? 1;
  let removedLine = startLine;
  let insertedLine = startLine;
  return proposal.edits.flatMap((edit, editPosition) => [
    ...edit.originalLines.map((text, i): DiffRow => ({
      key: `${editPosition}.removed.${i}`, lineNumber: removedLine++, sign: '−', text
    })),
    ...edit.replacementLines.map((text, i): DiffRow => ({
      key: `${editPosition}.inserted.${i}`, lineNumber: insertedLine++, sign: '+', text
    })),
  ]);
}

function labelOf(document: BoardTicketDocumentKind, proposal: BoardDocumentProposalDocument): string {
  const agent = AGENT_NAMES[document];
  if (document === 'plan' && proposal.forSpecNumber !== null) return `${agent} proposes, for spec v${proposal.forSpecNumber}`;
  return `${agent} proposes · ${linesTextOf(placeOf(proposal))} only`;
}

function openProposalOf(document: BoardTicketDocumentKind, proposal: BoardDocumentProposalDocument): OpenProposalModel {
  return {
    proposalId:       proposal.proposalId,
    headLines:        proposal.headLines,
    label:            labelOf(document, proposal),
    summary:          proposal.summary,
    removedLines:     proposal.edits.flatMap((edit) => edit.originalLines),
    insertedLines:    proposal.edits.flatMap((edit) => edit.replacementLines),
    diffRows:         diffRowsOf(proposal),
    linesText:        linesTextOf(placeOf(proposal)),
    replacementLines: proposal.edits.map((edit) => edit.replacementLines),
  };
}

function openProposalsOf(document: BoardTicketDocumentKind, proposals: readonly BoardDocumentProposalDocument[]): OpenProposalModel[] {
  return proposals.filter((proposal) => proposal.state === 'proposed').map((proposal) => openProposalOf(document, proposal));
}

/** The line a settled proposal leaves in the chat: "Edited lines 20, 37–39 · applied · v4". */
function settledNoteOf(proposal: BoardDocumentProposalDocument): string | null {
  const edited = `Edited ${editedLinesTextOf(proposal)}`;
  switch (proposal.state) {
    case 'applied':
      return proposal.appliedNumber === null ? `${edited} · applied` : `${edited} · applied · v${proposal.appliedNumber}`;
    case 'discarded':
      return `${edited} · discarded`;
    case 'conflicted':
      return `${edited} · not applied: your newer text stands there`;
    case 'proposed':
      return null;
  }
}

/** Edit first: User's own lines for each edit, one field per edit with its lines on separate lines. */
function replacementLinesOfFields(fields: readonly string[]): string[][] {
  return fields.map((field) => field.split('\n'));
}

function applyCommandOf(place: DocumentPlace, proposalId: string, editedFields: readonly string[] | null): BoardCommandDocument {
  return TicketDocumentCommands.applyOf(place, proposalId, editedFields === null ? null : replacementLinesOfFields(editedFields));
}

function discardCommandOf(place: DocumentPlace, proposalId: string): BoardCommandDocument {
  return TicketDocumentCommands.discardOf(place, proposalId);
}

export const ProposalModel = Object.freeze({
  openProposalsOf,
  openProposalOf,
  settledNoteOf,
  editedLinesTextOf,
  replacementLinesOfFields,
  applyCommandOf,
  discardCommandOf,
});
