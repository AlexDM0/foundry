/**
 * The document agent's head and Flint strip, pure: what the head says under the agent's name, the strip's status line, and Flint's cue in
 * the strip's slot. While a turn works the agent reads the file its running call names, or writes between calls, for the comment it
 * answers; it waits on User while an edit of its own waits for review, or, on a plan, while the newest effect reading of the head left
 * places unresolved; it is done once its document is approved with nothing open; otherwise it idles and the strip says how to start.
 */
import type { BoardTicketDocumentDocument, BoardEffectReadingDocument } from '../../../@types/board/TicketDocumentsDocument.ts';
import type { ToolCall }                                                from '../../conversation/ChatThreadModel.ts';
import { FLINT_SLOT_CUES, type FlintSlotCue }                           from '../../flint/FlintSlotCues.ts';
import type { DocumentChat }                                            from './DocumentChatModel.ts';
import { AGENT_NAMES }                                                  from './ProposalModel.ts';

export type DocumentViewMode = 'preview' | 'code' | 'split';

export interface DocumentAgentStripModel {
  readonly agentName: string;
  /** Under the name: "Replying to C2 · reads v4", "Waiting on you · 1 edit to review". */
  readonly headLine:  string;
  /** Beside Flint: "Reading package.json for C2", "Idle. Select text to comment, or ask." */
  readonly status:    string;
  readonly cue:       FlintSlotCue;
}

export interface DocumentAgentReading {
  readonly document:      BoardTicketDocumentDocument;
  /** The spec, for the plan agent's head: it reads both. */
  readonly spec:          BoardTicketDocumentDocument | null;
  readonly chat:          DocumentChat;
  readonly effectReading: BoardEffectReadingDocument | null;
  readonly view:          DocumentViewMode;
}

const NAMED_PATH = /"(?:file_path|path|notebook_path|pattern)"\s*:\s*"([^"]+)"/u;

function countText(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function versionText(document: BoardTicketDocumentDocument): string {
  return document.head === null ? 'no version yet' : `v${document.head.number}`;
}

/** The file a call names, its last segment: `package.json`; `null` when it names none. */
function namedFileOf(call: ToolCall): string | null {
  const path = NAMED_PATH.exec(call.inputText)?.[1] ?? null;
  return path === null ? null : path.split('/').filter((segment) => segment !== '').at(-1) ?? path;
}

/**
 * A document agent's snapshot is read-only, so a call it runs reads the repository, named by the file it names; between calls it writes
 * its answer. Gaia names no tool of the agent's: the call's input alone says what it reads.
 */
function workingStatusOf(call: ToolCall | null, answeringComment: number | null): { readonly text: string; readonly cue: FlintSlotCue } {
  const forComment = answeringComment === null ? '' : ` for C${answeringComment}`;
  if (call === null) return { text: `Writing${forComment}`, cue: FLINT_SLOT_CUES.AGENT_WRITES };
  const file = namedFileOf(call);
  return { text: file === null ? `Reading the repository${forComment}` : `Reading ${file}${forComment}`, cue: FLINT_SLOT_CUES.AGENT_READS };
}

function readsTextOf({ document, spec }: DocumentAgentReading): string {
  if (document.document === 'plan' && spec !== null) return `reads spec ${versionText(spec)}, plan ${versionText(document)}`;
  return `reads ${versionText(document)}`;
}

function unresolvedCountOf({ document, effectReading }: DocumentAgentReading): number {
  if (document.document !== 'plan' || effectReading?.state !== 'read' || effectReading.versionNumber !== document.head?.number) return 0;
  return effectReading.entries.filter((entry) => entry.change === 'unresolved').length;
}

function stripOf(reading: DocumentAgentReading): DocumentAgentStripModel {
  const {
    document, spec, chat, view
  } = reading;
  const agentName = AGENT_NAMES[document.document];
  if (chat.working) {
    const working = workingStatusOf(chat.runningCall, chat.answeringComment);
    const startedOn = chat.answeringOnVersion !== null && document.head !== null && chat.answeringOnVersion !== document.head.number
      ? `started on v${chat.answeringOnVersion}`
      : readsTextOf(reading);
    const headLine = chat.answeringComment === null ? `Working · ${startedOn}` : `Replying to C${chat.answeringComment} · ${startedOn}`;
    return {
      agentName, headLine, status: working.text, cue: working.cue
    };
  }
  const openEdits = document.proposals.filter((proposal) => proposal.state === 'proposed');
  if (openEdits.length > 0) {
    const forSpec = document.document === 'plan' ? openEdits.find((proposal) => proposal.forSpecNumber !== null)?.forSpecNumber ?? null : null;
    const headLine = forSpec === null ? `Waiting on you · ${countText(openEdits.length, 'edit', 'edits')} to review` : `Waiting on you · reads spec v${forSpec}`;
    const status = forSpec === null
      ? `Waiting on you · ${countText(openEdits.length, 'edit', 'edits')} to review`
      : `Waiting on you · ${countText(openEdits.length, 'edit', 'edits')} for spec v${forSpec}`;
    return {
      agentName, headLine, status, cue: FLINT_SLOT_CUES.AGENT_WAITS_ON_USER
    };
  }
  const unresolvedCount = unresolvedCountOf(reading);
  if (unresolvedCount > 0) {
    return {
      agentName,
      headLine: `Idle · ${readsTextOf(reading)}`,
      status:   `Waiting on you · ${countText(unresolvedCount, 'unresolved place', 'unresolved places')}`,
      cue:      FLINT_SLOT_CUES.AGENT_WAITS_ON_USER,
    };
  }
  if (document.standing === 'approved' && chat.queued.length === 0) {
    return {
      agentName, headLine: `Done · ${readsTextOf(reading)}`, status: `Done. The ${document.document} is approved.`, cue: FLINT_SLOT_CUES.AGENT_IS_DONE,
    };
  }
  const selectWhat = view === 'code' ? 'Select lines to comment, or ask.' : 'Select text to comment, or ask.';
  const headLine = spec === null || document.document === 'spec' ? `Idle · ${readsTextOf(reading)}` : `Idle · ${readsTextOf(reading)}`;
  return {
    agentName, headLine, status: `Idle. ${selectWhat}`, cue: FLINT_SLOT_CUES.AGENT_IS_IDLE
  };
}

export const DocumentAgentStripModelUtil = Object.freeze({ stripOf, namedFileOf });
