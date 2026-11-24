/**
 * A ticket's spec and plan in the spec-then-plan route: the user's saves, comments and approvals, the agent's proposals and its ready, and
 * the queue of messages Hephaestus writes to the agent one at a time. Each move changes the ticket's documents record in place and marks
 * it for the hold to write.
 */
import type { LogRecord } from './@types/LogRecord.ts';
import type { Ticket }    from './@types/Ticket.ts';
import type {
  CommentAnchor,
  DocumentApprover,
  DocumentAuthor,
  DocumentVersion,
  DocumentMessage,
  DocumentProposal,
  DocumentStanding,
  LineEdit,
  LineRange,
  LoadedTicketDocumentRecord,
  ProposalMode,
  TicketDocument,
  TicketDocumentKind
} from './@types/TicketDocument.ts';
import { TICKET_DOCUMENT_CHARACTER_LIMIT, TICKET_DOCUMENT_KINDS, TICKET_DOCUMENTS_FORMAT_VERSION } from './@types/TicketDocument.ts';
import type { BoardRecords }                                                                       from './BoardRecords.ts';
import { BoardRefusal }                                                                            from './BoardRefusal.ts';
import type { WorkFilesOf }                                                                        from './TicketMoves.ts';
import { TICKET_STATUSES_NO_AGENT_HAS_PICKED_UP }                                                  from './constants/Statuses.ts';
import { DocumentLineMergeUtil }                                                                   from './utils/DocumentLineMergeUtil.ts';
import { LineDiffUtil }                                                                            from './utils/LineDiffUtil.ts';
import type { LineHunk }                                                                           from './utils/LineDiffUtil.ts';
import type { BodyGapsOf }                                                                         from './utils/TicketDocumentReadinessUtil.ts';
import { TicketDocumentStandingUtil }                                                              from './utils/TicketDocumentStandingUtil.ts';
import { TicketDocumentVersionUtil }                                                               from './utils/TicketDocumentVersionUtil.ts';
import { TicketWritingUtil }                                                                       from './utils/TicketWritingUtil.ts';

/** What a document agent proposes: its edits on the version it read, `null` for the first write. */
export interface ProposalSubmission {
  baseNumber:        number | null;
  edits:             LineEdit[];
  summary:           string;
  answersMessageId?: string;
  forSpecNumber?:    number;
}

/**
 * What the document moves read that the model cannot: a body's readiness gaps and the files its Brief names, both read from markdown, and
 * the words of the board's message that tells an agent its edit conflicted, since the model words nothing.
 */
export interface DocumentMoveJudges {
  bodyGapsOf:       BodyGapsOf;
  workFilesOf:      WorkFilesOf;
  conflictNoticeOf: (proposal: Readonly<DocumentProposal>) => string;
}

/** Readies a draft ticket whose documents are both approved, through the Board's one way to `committed`. */
export type ReadyDraftTicket = (ticketId: string, judges: DocumentMoveJudges, at: string) => readonly LogRecord[];

export interface DocumentMoved {
  logged: readonly LogRecord[];
}

/** `versionNumber` is the head after the save; `changed` is false for a text equal to the head's, which makes no version. */
export interface DocumentSaved extends DocumentMoved {
  changed:       boolean;
  versionNumber: number;
}

export interface DocumentMessageQueued extends DocumentMoved {
  message: Readonly<DocumentMessage>;
}

export interface DocumentProposed extends DocumentMoved {
  proposal: Readonly<DocumentProposal>;
}

/** `changed` is false where the move found its result already in place: the same mode, or an approval already standing. */
export interface DocumentSettingChanged extends DocumentMoved {
  changed: boolean;
}

interface DocumentInHand {
  ticket:       Ticket;
  loadedRecord: LoadedTicketDocumentRecord;
  document:     TicketDocument;
}

function emptyDocumentOf(kind: TicketDocumentKind): TicketDocument {
  return {
    kind, versions: [], approvals: [], messages: [], proposals: [], proposalMode: 'ask-first', nextMessageNumber: 1, nextCommentNumber: 1, nextProposalNumber: 1
  };
}

/** A document with no version has no lines, unlike a version whose text is empty, which has one empty line. */
function linesOfVersion(loadedRecord: Readonly<LoadedTicketDocumentRecord>, contentHash: string | null): string[] {
  if (contentHash === null) return [];
  return LineDiffUtil.linesOf(textOfContentHash(loadedRecord, contentHash));
}

function textOfContentHash(loadedRecord: Readonly<LoadedTicketDocumentRecord>, contentHash: string): string {
  if (!Object.hasOwn(loadedRecord.textOfContentHash, contentHash)) throw new Error(`The documents record of #${loadedRecord.record.ticketId} names no text for ${contentHash}.`);
  return loadedRecord.textOfContentHash[contentHash] ?? '';
}

/** Base lines as 0-based indexes, `end` excluded; equal for an insert before line `fromLine`. */
interface BaseSpan {
  start: number;
  end:   number;
}

function baseSpanOf(fromLine: number, lineCount: number): BaseSpan {
  return { start: fromLine - 1, end: fromLine - 1 + lineCount };
}

/** Two changes overlap when they change a common line, or both insert at one place, or one inserts at the other's first line. */
function spansOverlap(first: BaseSpan, second: BaseSpan): boolean {
  if (first.start < second.end && second.start < first.end) return true;
  return first.start === second.start && (first.start === first.end || second.start === second.end);
}

/** A change's lines carried back to the base through `backToBase`; `null` when a line it changed is not in the base. */
function baseSpanOfLinesIn(hunk: Readonly<LineHunk>, backToBase: readonly Readonly<LineHunk>[]): BaseSpan | null {
  if (hunk.originalLines.length === 0) {
    const insertedBefore = LineDiffUtil.lineRangeAfter(hunk.originalFromLine, backToBase);
    return insertedBefore === null ? null : baseSpanOf(insertedBefore.from, 0);
  }
  const first = LineDiffUtil.lineRangeAfter(hunk.originalFromLine, backToBase);
  const last  = LineDiffUtil.lineRangeAfter(hunk.originalFromLine + hunk.originalLines.length - 1, backToBase);
  return first === null || last === null ? null : baseSpanOf(first.from, last.to - first.from + 1);
}

function lineRangeIsWithin(range: Readonly<LineRange>, lineCount: number): boolean {
  return range.from >= 1 && range.from <= range.to && range.to <= lineCount;
}

function spanOf(ranges: readonly LineRange[]): LineRange | null {
  if (ranges.length === 0) return null;
  return { from: Math.min(...ranges.map((range) => range.from)), to: Math.max(...ranges.map((range) => range.to)) };
}

export class TicketDocuments {
  constructor(
    private readonly records: BoardRecords,
    private readonly readyDraftTicket: ReadyDraftTicket,
  ) {}

  /** `null` for a ticket with no documents record, or a record without that document. */
  documentOf(ticketId: string, kind: TicketDocumentKind): Readonly<TicketDocument> | null {
    return this.writableDocumentOf(ticketId, kind);
  }

  /** `null` for a ticket with no documents record; a document the record lacks is `unwritten`. */
  standingOf(ticketId: string, kind: TicketDocumentKind): DocumentStanding | null {
    const loadedRecord = this.records.ticketDocumentRecordOf(ticketId);
    return loadedRecord === undefined ? null : TicketDocumentStandingUtil.standingsOf(loadedRecord.record)[kind];
  }

  /** The text of a version the record names by its number; `null` for no record, no document or no such version. */
  versionTextOf(ticketId: string, kind: TicketDocumentKind, versionNumber: number): string | null {
    const loadedRecord = this.records.ticketDocumentRecordOf(ticketId);
    const document     = this.writableDocumentOf(ticketId, kind);
    const version      = document === null ? null : TicketDocumentVersionUtil.versionOfNumber(document, versionNumber);
    return loadedRecord === undefined || version === null ? null : textOfContentHash(loadedRecord, version.contentHash);
  }

  /** The oldest message still queued for the document's agent, in the order the messages were queued; `null` when none waits. */
  nextQueuedMessageOf(ticketId: string, document: TicketDocumentKind): Readonly<DocumentMessage> | null {
    return this.writableDocumentOf(ticketId, document)?.messages.find((message) => message.state === 'queued') ?? null;
  }

  /**
   * Hephaestus wrote the message to the agent's session as its `deliveryNumber`th delivery, opening agent turn `agentTurn`. Refuses
   * `ticket-has-no-documents`, `document-unknown-message`, and `document-message-not-queued` for a message already sent or withdrawn.
   */
  markMessageSent(ticketId: string, document: TicketDocumentKind, messageId: string, deliveryNumber: number, agentTurn: number): void {
    const loadedRecord = this.records.ticketDocumentRecordOf(ticketId);
    if (loadedRecord === undefined) throw new BoardRefusal({ reason: 'ticket-has-no-documents', ticketId });
    const message = loadedRecord.record.documents.find((candidate) => candidate.kind === document)?.messages
      .find((candidate) => candidate.messageId === messageId);
    if (message === undefined) throw new BoardRefusal({
      reason: 'document-unknown-message', ticketId, document, messageId
    });
    if (message.state !== 'queued') {
      throw new BoardRefusal({
        reason: 'document-message-not-queued', ticketId, document, messageId, state: message.state
      });
    }
    message.state          = 'sent';
    message.deliveryNumber = deliveryNumber;
    message.agentTurn      = agentTurn;
    this.records.markTicketDocumentsChanged(loadedRecord);
  }

  /** Opens the ticket's spec and plan, both unwritten; a ticket that has them already is left as it is. */
  open(ticketId: string, at: string): DocumentMoved {
    this.records.requireTicket(ticketId);
    if (this.records.ticketDocumentRecordOf(ticketId) !== undefined) return { logged: [] };
    const loadedRecord: LoadedTicketDocumentRecord = {
      record: {
        version: TICKET_DOCUMENTS_FORMAT_VERSION, ticketId, openedAt: at, documents: TICKET_DOCUMENT_KINDS.map(emptyDocumentOf)
      },
      textOfContentHash: {},
    };
    this.records.ticketDocumentRecords.push(loadedRecord);
    this.records.markTicketDocumentsChanged(loadedRecord);
    return { logged: [this.records.logger.log({ kind: 'ticket-documents-opened', ticketId, fields: {} }, at)] };
  }

  /**
   * User's save, made on `baseNumber`. A head that moved since is merged three ways: changes apart from each other both apply, and where
   * User's overlaps an agent's, User's wins and the agent's is kept as a conflicted proposal it is told of. An overlap with lines another
   * save of a person changed since is `document-merge-conflict`. A draft in the spec-then-plan route with no record opens one.
   */
  save(ticketId: string, document: TicketDocumentKind, baseNumber: number | null, markdown: string, judges: DocumentMoveJudges, at: string): DocumentSaved {
    const opened = this.openForUser(ticketId, at);
    const inHand = this.editableDocumentOf(ticketId, document);
    this.refuseAnEditOfADocumentItsAgentKeeps(inHand);
    this.refuseAPlanBeforeAnApprovedSpec(inHand);
    if (markdown.length > TICKET_DOCUMENT_CHARACTER_LIMIT) {
      throw new BoardRefusal({
        reason: 'document-too-long', ticketId, document, characterCount: markdown.length, characterLimit: TICKET_DOCUMENT_CHARACTER_LIMIT
      });
    }
    const { loadedRecord, document: writable } = inHand;
    const head = TicketDocumentVersionUtil.headOf(writable);
    const headNumber = head?.number ?? null;
    let savedText = markdown;
    const logged: LogRecord[] = [...opened];
    if (baseNumber !== headNumber) {
      const base = baseNumber === null ? null : TicketDocumentVersionUtil.versionOfNumber(writable, baseNumber);
      if (base === null || head === null) {
        throw new BoardRefusal({
          reason: 'document-version-moved', ticketId, document, version: baseNumber, headNumber
        });
      }
      const merge = DocumentLineMergeUtil.mergeOf(
        linesOfVersion(loadedRecord, base.contentHash),
        linesOfVersion(loadedRecord, head.contentHash),
        LineDiffUtil.linesOf(markdown)
      );
      if (merge.overriddenHeadHunks.length > 0) {
        const versionsSince = writable.versions.filter((version) => version.number > base.number);
        if (this.aPersonChangedAnOverriddenLine(inHand, base, merge.overriddenHeadHunks)) {
          throw new BoardRefusal({
            reason: 'document-merge-conflict', ticketId, document, baseNumber: base.number, headNumber: head.number
          });
        }
        const agentVersion = versionsSince.findLast((version) => version.author === 'agent');
        const overridden = this.addProposal(inHand, {
          jobId:      agentVersion?.jobId ?? '',
          baseNumber: base.number,
          edits:      merge.overriddenHeadHunks.map((hunk) => ({
            fromLine:         hunk.originalFromLine,
            toLine:           hunk.originalFromLine + hunk.originalLines.length - 1,
            originalLines:    hunk.originalLines,
            replacementLines: hunk.replacementLines,
          })),
          summary: '',
        }, at);
        logged.push(...overridden.logged, ...this.conflict(inHand, overridden.proposal, judges, at));
      }
      savedText = merge.mergedLines.join('\n');
    }
    const versioned = this.addVersion(inHand, savedText, 'person', {}, at);
    logged.push(...versioned.logged);
    return { changed: versioned.logged.length > 0, versionNumber: versioned.versionNumber, logged };
  }

  /**
   * User's message to the document's agent, queued behind the ones before it; with an anchor it is comment `C<n>`, placed on the head as the
   * lines it names stand there now. A draft in the spec-then-plan route with no record opens one.
   */
  comment(ticketId: string, document: TicketDocumentKind, anchor: CommentAnchor | null, text: string, at: string): DocumentMessageQueued {
    const opened = this.openForUser(ticketId, at);
    const inHand = this.editableDocumentOf(ticketId, document);
    this.refuseAPlanBeforeAnApprovedSpec(inHand);
    const placed = anchor === null ? {} : this.placedAnchorOf(inHand, anchor);
    const queued = this.queueMessage(inHand, { text, from: 'person', ...placed }, at);
    return { message: queued.message, logged: [...opened, ...queued.logged] };
  }

  /** Only a message still queued is withdrawn: one Hephaestus already wrote to the session stays in the chat. */
  withdrawComment(ticketId: string, document: TicketDocumentKind, messageId: string): DocumentSettingChanged {
    const inHand  = this.editableDocumentOf(ticketId, document);
    const message = this.requireMessage(inHand, messageId);
    if (message.state === 'withdrawn') return { changed: false, logged: [] };
    if (message.state !== 'queued') {
      throw new BoardRefusal({
        reason: 'document-message-not-queued', ticketId, document, messageId, state: message.state
      });
    }
    message.state = 'withdrawn';
    this.records.markTicketDocumentsChanged(inHand.loadedRecord);
    return { changed: true, logged: [] };
  }

  /** forge's own message to the agent, such as an effect reading's result, queued like User's. */
  queueBoardMessage(ticketId: string, document: TicketDocumentKind, text: string, at: string): DocumentMessageQueued {
    return this.queueMessage(this.requireDocument(ticketId, document), { text, from: 'board' }, at);
  }

  /**
   * The agent's edits, made on the version it read. The first write, with no version yet, applies at once; in auto-apply, and while the
   * document's review is off, so that nobody would be left to apply it, so does every other, carried onto the head. An edit whose original
   * lines no longer stand there makes the proposal conflicted, and the agent is told.
   */
  propose(
    ticketId: string,
    document: TicketDocumentKind,
    jobId: string,
    submission: ProposalSubmission,
    constitutionCommit: string,
    judges: DocumentMoveJudges,
    at: string
  ): DocumentProposed {
    const inHand   = this.editableDocumentOf(ticketId, document);
    const proposed = this.addProposal(inHand, { ...submission, jobId }, at);
    const { proposal } = proposed;
    const isFirstWrite = submission.baseNumber === null && inHand.document.versions.length === 0;
    const waitsForUser = inHand.document.proposalMode === 'ask-first' && TicketWritingUtil.documentReviewIsOn(this.records.pipeline, document);
    if (!isFirstWrite && waitsForUser) return proposed;
    const settled = this.settleByApplying(inHand, proposal, proposal.edits, { author: 'agent', jobId, constitutionCommit }, judges, at);
    return { proposal, logged: [...proposed.logged, ...settled] };
  }

  /** User's Apply of an open proposal; with `replacementLines`, one list per edit, User's own lines take the agent's place (Edit first). */
  applyProposal(
    ticketId: string,
    document: TicketDocumentKind,
    proposalId: string,
    replacementLines: string[][] | null,
    judges: DocumentMoveJudges,
    at: string
  ): DocumentMoved {
    const inHand   = this.editableDocumentOf(ticketId, document);
    this.refuseAnEditOfADocumentItsAgentKeeps(inHand);
    const proposal = this.requireOpenProposal(inHand, proposalId);
    if (replacementLines !== null && replacementLines.length !== proposal.edits.length) {
      throw new TypeError(`replacementLines holds ${replacementLines.length} lists, not one for each of the ${proposal.edits.length} edits`);
    }
    const edits  = replacementLines === null ? proposal.edits : proposal.edits.map((edit, index) => ({ ...edit, replacementLines: replacementLines[index] ?? [] }));
    const author = replacementLines === null ? { author: 'agent' as const, jobId: proposal.jobId } : { author: 'person' as const };
    return { logged: this.settleByApplying(inHand, proposal, edits, author, judges, at) };
  }

  discardProposal(ticketId: string, document: TicketDocumentKind, proposalId: string, at: string): DocumentMoved {
    const inHand   = this.editableDocumentOf(ticketId, document);
    this.refuseAnEditOfADocumentItsAgentKeeps(inHand);
    const proposal = this.requireOpenProposal(inHand, proposalId);
    proposal.state = 'discarded';
    this.records.markTicketDocumentsChanged(inHand.loadedRecord);
    return { logged: [this.logSettled(inHand, proposal, at)] };
  }

  /** Whether the agent's proposals wait for User's Apply or apply as they arrive; it changes no open proposal. */
  setProposalMode(ticketId: string, document: TicketDocumentKind, mode: ProposalMode, at: string): DocumentSettingChanged {
    const inHand = this.editableDocumentOf(ticketId, document);
    if (inHand.document.proposalMode === mode) return { changed: false, logged: [] };
    inHand.document.proposalMode = mode;
    this.records.markTicketDocumentsChanged(inHand.loadedRecord);
    return { changed: true, logged: [this.records.logger.log({ kind: 'ticket-document-mode-set', ticketId, fields: { document, mode } }, at)] };
  }

  /**
   * The agent calls its head ready. With the document's review on, User approves it next; with it off, the pipeline approves it here, and an
   * approval that leaves both documents approved readies a draft ticket. A spec whose head holds no numbered Acceptance is refused. With
   * review off, a proposal still open from before applies first, and one that conflicts leaves the head unapproved for the agent to answer.
   * A plan agent's ready names `forSpecNumber`, the spec version it was given: the pipeline's approval is made on that one, so a ready
   * from an agent that never saw the newer spec leaves the plan out of date.
   */
  markReady(
    ticketId: string,
    document: TicketDocumentKind,
    constitutionCommit: string,
    judges: DocumentMoveJudges,
    at: string,
    forSpecNumber: number | null = null
  ): DocumentMoved {
    const inHand     = this.editableDocumentOf(ticketId, document);
    const reviewIsOn = TicketWritingUtil.documentReviewIsOn(this.records.pipeline, document);
    const settled    = reviewIsOn ? { logged: [], allApplied: true } : this.applyOpenProposals(inHand, constitutionCommit, judges, at);
    if (!settled.allApplied) return { logged: settled.logged };
    const head = TicketDocumentVersionUtil.headOf(inHand.document);
    if (head === null) return { logged: settled.logged };
    this.refuseASpecWithoutNumberedAcceptance(inHand, head.contentHash, judges);
    inHand.document.readyAtNumber = head.number;
    this.records.markTicketDocumentsChanged(inHand.loadedRecord);
    if (reviewIsOn) return { logged: settled.logged };
    return { logged: [...settled.logged, ...this.approveHead(inHand, 'pipeline', constitutionCommit, judges, at, forSpecNumber).logged] };
  }

  /** Each proposal still open applies in the order it came, as the agent's; `allApplied` is false once one conflicted. */
  private applyOpenProposals(
    inHand: DocumentInHand, constitutionCommit: string, judges: DocumentMoveJudges, at: string
  ): { logged: readonly LogRecord[]; allApplied: boolean } {
    const logged: LogRecord[] = [];
    let allApplied = true;
    for (const proposal of inHand.document.proposals.filter((candidate) => candidate.state === 'proposed')) {
      logged.push(...this.settleByApplying(inHand, proposal, proposal.edits, { author: 'agent', jobId: proposal.jobId, constitutionCommit }, judges, at));
      allApplied &&= proposal.state === 'applied';
    }
    return { logged, allApplied };
  }

  /**
   * User's approval of the head, named by its number. Refused while the document's review is off, on a version that is no longer the
   * head, on a spec whose head holds no numbered Acceptance, and on a plan before its spec is approved. It is appended, never replacing an
   * earlier one; one that leaves both documents approved readies a draft ticket in the same write.
   */
  approve(ticketId: string, document: TicketDocumentKind, versionNumber: number, constitutionCommit: string, judges: DocumentMoveJudges, at: string): DocumentSettingChanged {
    const inHand = this.editableDocumentOf(ticketId, document);
    if (!TicketWritingUtil.documentReviewIsOn(this.records.pipeline, document)) throw new BoardRefusal({ reason: 'document-review-is-off', ticketId, document });
    const head = TicketDocumentVersionUtil.headOf(inHand.document);
    if (head?.number !== versionNumber) {
      throw new BoardRefusal({
        reason: 'document-version-moved', ticketId, document, version: versionNumber, headNumber: head?.number ?? null
      });
    }
    this.refuseASpecWithoutNumberedAcceptance(inHand, head.contentHash, judges);
    return this.approveHead(inHand, 'person', constitutionCommit, judges, at);
  }

  /**
   * A person approves the plan on the spec's head, which they read; the pipeline on `forSpecNumber`, the spec version its agent was given,
   * when the spec still holds it.
   */
  private approveHead(
    inHand: DocumentInHand,
    by: DocumentApprover,
    constitutionCommit: string,
    judges: DocumentMoveJudges,
    at: string,
    forSpecNumber: number | null = null
  ): DocumentSettingChanged {
    const { ticket, loadedRecord, document } = inHand;
    const head = TicketDocumentVersionUtil.headOf(document);
    if (head === null) return { changed: false, logged: [] };
    const spec = this.documentOfRecord(loadedRecord, 'spec');
    const approvedSpecHeadHash = TicketDocumentVersionUtil.approvedHeadHashOf(spec);
    if (document.kind === 'plan' && approvedSpecHeadHash === null) throw new BoardRefusal({ reason: 'plan-before-approved-spec', ticketId: ticket.frontmatter.id });
    if (TicketDocumentStandingUtil.standingsOf(loadedRecord.record)[document.kind] === 'approved') return { changed: false, logged: [] };
    const specHead    = TicketDocumentVersionUtil.headOf(spec);
    const givenSpec   = forSpecNumber === null ? null : TicketDocumentVersionUtil.versionOfNumber(spec, forSpecNumber);
    const specVersion = givenSpec ?? specHead;
    const onSpec      = document.kind === 'plan' && specVersion !== null ? { onSpecNumber: specVersion.number, onSpecContentHash: specVersion.contentHash } : {};
    document.approvals.push({
      number: head.number, contentHash: head.contentHash, by, at, constitutionCommit, ...onSpec
    });
    this.records.markTicketDocumentsChanged(loadedRecord);
    const approved = this.records.logger.log({
      kind:     'ticket-document-approved',
      ticketId: ticket.frontmatter.id,
      fields:   {
        document: document.kind, number: head.number, by, ...(onSpec.onSpecNumber === undefined ? {} : { onSpecNumber: onSpec.onSpecNumber })
      }
    }, at);
    return { changed: true, logged: [approved, ...this.readyWhenBothApproved(inHand, judges, at)] };
  }

  private readyWhenBothApproved(inHand: DocumentInHand, judges: DocumentMoveJudges, at: string): readonly LogRecord[] {
    if (inHand.ticket.frontmatter.status !== 'draft') return [];
    const standings = TicketDocumentStandingUtil.standingsOf(inHand.loadedRecord.record);
    if (!TICKET_DOCUMENT_KINDS.every((kind) => standings[kind] === 'approved')) return [];
    return this.readyDraftTicket(inHand.ticket.frontmatter.id, judges, at);
  }

  private settleByApplying(
    inHand: DocumentInHand,
    proposal: DocumentProposal,
    edits: readonly LineEdit[],
    authorship: { author: DocumentAuthor; jobId?: string; constitutionCommit?: string },
    judges: DocumentMoveJudges,
    at: string
  ): readonly LogRecord[] {
    const { loadedRecord, document } = inHand;
    const head      = TicketDocumentVersionUtil.headOf(document);
    const base      = proposal.baseNumber === null ? null : TicketDocumentVersionUtil.versionOfNumber(document, proposal.baseNumber);
    const baseFound = proposal.baseNumber === null ? head === null : base !== null;
    const headLines = linesOfVersion(loadedRecord, head?.contentHash ?? null);
    const mapped    = baseFound ? DocumentLineMergeUtil.editsOnHeadOf(linesOfVersion(loadedRecord, base?.contentHash ?? null), headLines, edits) : null;
    if (mapped === null) return this.conflict(inHand, proposal, judges, at);

    const versioned = this.addVersion(inHand, DocumentLineMergeUtil.linesWithEditsApplied(headLines, mapped).join('\n'), authorship.author, {
      ...(authorship.jobId === undefined ? {} : { jobId: authorship.jobId }),
      ...(authorship.constitutionCommit === undefined ? {} : { constitutionCommit: authorship.constitutionCommit }),
    }, at);
    proposal.state         = 'applied';
    proposal.appliedNumber = versioned.versionNumber;
    const answered = proposal.answersMessageId === undefined ? undefined : document.messages.find((message) => message.messageId === proposal.answersMessageId);
    if (answered !== undefined) {
      answered.state = 'applied';
      const placement = spanOf(DocumentLineMergeUtil.replacementRangesOf(mapped));
      if (answered.anchor !== undefined) this.placeMessage(answered, placement);
    }
    this.records.markTicketDocumentsChanged(loadedRecord);
    return [...versioned.logged, this.logSettled(inHand, proposal, at)];
  }

  /** The proposal could not land on the head: it is settled conflicted, and a board message tells its agent. */
  private conflict(inHand: DocumentInHand, proposal: DocumentProposal, judges: DocumentMoveJudges, at: string): readonly LogRecord[] {
    proposal.state = 'conflicted';
    this.records.markTicketDocumentsChanged(inHand.loadedRecord);
    const settled = this.logSettled(inHand, proposal, at);
    return [settled, ...this.queueMessage(inHand, { text: judges.conflictNoticeOf(proposal), from: 'board' }, at).logged];
  }

  private addProposal(inHand: DocumentInHand, submission: ProposalSubmission & { jobId: string }, at: string): DocumentProposed {
    const { document, ticket } = inHand;
    const proposal: DocumentProposal = {
      proposalId: `P${document.nextProposalNumber}`,
      jobId:      submission.jobId,
      baseNumber: submission.baseNumber,
      edits:      submission.edits.map((edit) => ({
        fromLine: edit.fromLine, toLine: edit.toLine, originalLines: [...edit.originalLines], replacementLines: [...edit.replacementLines]
      })),
      summary: submission.summary,
      ...(submission.answersMessageId === undefined ? {} : { answersMessageId: submission.answersMessageId }),
      ...(submission.forSpecNumber === undefined ? {} : { forSpecNumber: submission.forSpecNumber }),
      state:   'proposed',
      at,
    };
    document.nextProposalNumber += 1;
    document.proposals.push(proposal);
    this.records.markTicketDocumentsChanged(inHand.loadedRecord);
    const ticketId = ticket.frontmatter.id;
    const logged   = this.records.logger.log({ kind: 'ticket-document-proposed', ticketId, fields: { document: document.kind, proposalId: proposal.proposalId } }, at);
    return { proposal, logged: [logged] };
  }

  private logSettled(inHand: DocumentInHand, proposal: Readonly<DocumentProposal>, at: string): LogRecord {
    return this.records.logger.log({
      kind:     'ticket-document-proposal-settled',
      ticketId: inHand.ticket.frontmatter.id,
      fields:   { document: inHand.document.kind, proposalId: proposal.proposalId, state: proposal.state },
    }, at);
  }

  /**
   * A new head of `text`, unless it equals the head's, and every anchored message carried onto it: a message on lines a change replaced
   * moves to the replacement, and one whose lines were all deleted, or whose quote the replacement lost, is orphaned.
   */
  private addVersion(
    inHand: DocumentInHand,
    text: string,
    author: DocumentAuthor,
    agentFields: { jobId?: string; constitutionCommit?: string },
    at: string
  ): { versionNumber: number; logged: readonly LogRecord[] } {
    const { loadedRecord, document, ticket } = inHand;
    const head        = TicketDocumentVersionUtil.headOf(document);
    const contentHash = TicketDocumentVersionUtil.contentHashOf(text);
    if (head?.contentHash === contentHash) return { versionNumber: head.number, logged: [] };
    if (text.length > TICKET_DOCUMENT_CHARACTER_LIMIT) {
      throw new BoardRefusal({
        reason: 'document-too-long', ticketId: ticket.frontmatter.id, document: document.kind, characterCount: text.length, characterLimit: TICKET_DOCUMENT_CHARACTER_LIMIT
      });
    }
    const headLines = linesOfVersion(loadedRecord, head?.contentHash ?? null);
    const newLines  = LineDiffUtil.linesOf(text);
    const hunks     = LineDiffUtil.hunksOf(headLines, newLines);
    for (const message of document.messages) {
      if (message.placement === undefined || message.orphaned === true) continue;
      this.placeMessage(message, LineDiffUtil.placementAfter(message.placement, message.anchor?.quote ?? null, hunks, newLines));
    }
    const versionNumber = TicketDocumentVersionUtil.nextVersionNumberOf(document);
    loadedRecord.textOfContentHash[contentHash] = text;
    document.versions.push({
      number: versionNumber,
      contentHash,
      author,
      ...(agentFields.jobId === undefined ? {} : { jobId: agentFields.jobId }),
      at,
      ...(agentFields.constitutionCommit === undefined ? {} : { constitutionCommit: agentFields.constitutionCommit }),
    });
    this.records.markTicketDocumentsChanged(loadedRecord);
    const ticketId = ticket.frontmatter.id;
    const logged   = this.records.logger.log({ kind: 'ticket-document-versioned', ticketId, fields: { document: document.kind, number: versionNumber, author } }, at);
    return { versionNumber, logged: [logged] };
  }

  private placeMessage(message: DocumentMessage, placement: LineRange | null): void {
    if (placement === null) {
      delete message.placement;
      message.orphaned = true;
      return;
    }
    message.placement = placement;
    delete message.orphaned;
  }

  /**
   * The anchor as sent, and where its lines stand on the head: carried from the version it names when the head moved since. An anchor whose
   * lines the version it names does not hold is refused, as one on a version that moved.
   */
  private placedAnchorOf(inHand: DocumentInHand, anchor: CommentAnchor): Pick<DocumentMessage, 'anchor' | 'placement' | 'orphaned'> {
    const { loadedRecord, document, ticket } = inHand;
    const head    = TicketDocumentVersionUtil.headOf(document);
    const version = TicketDocumentVersionUtil.versionOfNumber(document, anchor.versionNumber);
    if (head === null || version === null) {
      throw new BoardRefusal({
        reason: 'document-version-moved', ticketId: ticket.frontmatter.id, document: document.kind, version: anchor.versionNumber, headNumber: head?.number ?? null
      });
    }
    const versionLines = linesOfVersion(loadedRecord, version.contentHash);
    if (!lineRangeIsWithin(anchor.lines, versionLines.length)) {
      throw new BoardRefusal({
        reason: 'document-version-moved', ticketId: ticket.frontmatter.id, document: document.kind, version: anchor.versionNumber, headNumber: head.number
      });
    }
    const headLines = linesOfVersion(loadedRecord, head.contentHash);
    const hunks     = LineDiffUtil.hunksOf(versionLines, headLines);
    const placement = LineDiffUtil.placementAfter(anchor.lines, anchor.quote ?? null, hunks, headLines);
    return placement === null ? { anchor, orphaned: true } : { anchor, placement };
  }

  private queueMessage(
    inHand: DocumentInHand,
    content: Pick<DocumentMessage, 'text' | 'from' | 'anchor' | 'placement' | 'orphaned'>,
    at: string
  ): DocumentMessageQueued {
    const { document, ticket } = inHand;
    const isComment = content.anchor !== undefined;
    const message: DocumentMessage = {
      messageId: `M${document.nextMessageNumber}`,
      ...(isComment ? { commentNumber: document.nextCommentNumber } : {}),
      ...(content.anchor === undefined ? {} : { anchor: content.anchor }),
      ...(content.placement === undefined ? {} : { placement: content.placement }),
      ...(content.orphaned === true ? { orphaned: true as const } : {}),
      text:      content.text,
      from:      content.from,
      state:     'queued',
      queuedAt:  at,
    };
    document.nextMessageNumber += 1;
    if (isComment) document.nextCommentNumber += 1;
    document.messages.push(message);
    this.records.markTicketDocumentsChanged(inHand.loadedRecord);
    const ticketId = ticket.frontmatter.id;
    const logged   = this.records.logger.log({ kind: 'ticket-document-message-queued', ticketId, fields: { document: document.kind, messageId: message.messageId } }, at);
    return { message, logged: [logged] };
  }

  /** User's first save or message on a draft opens its record, but only in the spec-then-plan route. */
  private openForUser(ticketId: string, at: string): readonly LogRecord[] {
    if (this.records.ticketDocumentRecordOf(ticketId) !== undefined) return [];
    const ticket = this.records.requireTicket(ticketId);
    if (TicketWritingUtil.routeOf(this.records.pipeline) !== 'spec-then-plan' || ticket.frontmatter.status !== 'draft') {
      throw new BoardRefusal({ reason: 'ticket-has-no-documents', ticketId });
    }
    return this.open(ticketId, at).logged;
  }

  private requireDocument(ticketId: string, kind: TicketDocumentKind): DocumentInHand {
    const ticket       = this.records.requireTicket(ticketId);
    const loadedRecord = this.records.ticketDocumentRecordOf(ticketId);
    if (loadedRecord === undefined) throw new BoardRefusal({ reason: 'ticket-has-no-documents', ticketId });
    let document = loadedRecord.record.documents.find((candidate) => candidate.kind === kind);
    if (document === undefined) {
      document = emptyDocumentOf(kind);
      loadedRecord.record.documents.push(document);
      loadedRecord.record.documents.sort((a, b) => TICKET_DOCUMENT_KINDS.indexOf(a.kind) - TICKET_DOCUMENT_KINDS.indexOf(b.kind));
    }
    return { ticket, loadedRecord, document };
  }

  /** Edits and messages stop once an agent picked the ticket up: its build reads the documents as they stood. */
  private editableDocumentOf(ticketId: string, kind: TicketDocumentKind): DocumentInHand {
    const inHand = this.requireDocument(ticketId, kind);
    const { status } = inHand.ticket.frontmatter;
    if (!TICKET_STATUSES_NO_AGENT_HAS_PICKED_UP.includes(status)) throw new BoardRefusal({
      reason: 'document-not-editable', ticketId, document: kind, status
    });
    return inHand;
  }

  /**
   * Whether a person's save since `base` changed a line of an overridden head change, both read in the base's numbering. Each person
   * version's own change, against the version before it, is carried back to the base; one that cannot be, made on lines added since, counts.
   */
  private aPersonChangedAnOverriddenLine(inHand: DocumentInHand, base: Readonly<DocumentVersion>, overriddenHunks: readonly LineHunk[]): boolean {
    const { loadedRecord, document } = inHand;
    const baseLines       = linesOfVersion(loadedRecord, base.contentHash);
    const overriddenSpans = overriddenHunks.map((hunk) => baseSpanOf(hunk.originalFromLine, hunk.originalLines.length));
    return document.versions.some((version, index) => {
      const before = document.versions[index - 1];
      if (version.number <= base.number || version.author !== 'person' || before === undefined) return false;
      const beforeLines = linesOfVersion(loadedRecord, before.contentHash);
      const backToBase  = LineDiffUtil.hunksOf(beforeLines, baseLines);
      return LineDiffUtil.hunksOf(beforeLines, linesOfVersion(loadedRecord, version.contentHash)).some((ownHunk) => {
        const span = baseSpanOfLinesIn(ownHunk, backToBase);
        return span === null || overriddenSpans.some((overridden) => spansOverlap(span, overridden));
      });
    });
  }

  /** With its review off, a document is its agent's: User reads it and talks to the agent, and does not edit it. */
  private refuseAnEditOfADocumentItsAgentKeeps(inHand: DocumentInHand): void {
    if (TicketWritingUtil.documentReviewIsOn(this.records.pipeline, inHand.document.kind)) return;
    throw new BoardRefusal({
      reason: 'document-not-editable', ticketId: inHand.ticket.frontmatter.id, document: inHand.document.kind, status: inHand.ticket.frontmatter.status
    });
  }

  /** The plan is written from an approved spec, so it waits until the spec was approved at least once. */
  private refuseAPlanBeforeAnApprovedSpec(inHand: DocumentInHand): void {
    if (inHand.document.kind !== 'plan') return;
    if (this.documentOfRecord(inHand.loadedRecord, 'spec').approvals.length > 0) return;
    throw new BoardRefusal({ reason: 'plan-before-approved-spec', ticketId: inHand.ticket.frontmatter.id });
  }

  private refuseASpecWithoutNumberedAcceptance(inHand: DocumentInHand, contentHash: string, judges: DocumentMoveJudges): void {
    if (inHand.document.kind !== 'spec') return;
    if (!judges.bodyGapsOf(textOfContentHash(inHand.loadedRecord, contentHash)).includes('acceptance-unnumbered')) return;
    throw new BoardRefusal({ reason: 'spec-acceptance-unnumbered', ticketId: inHand.ticket.frontmatter.id });
  }

  private requireMessage(inHand: DocumentInHand, messageId: string): DocumentMessage {
    const message = inHand.document.messages.find((candidate) => candidate.messageId === messageId);
    if (message === undefined) {
      throw new BoardRefusal({
        reason: 'document-unknown-message', ticketId: inHand.ticket.frontmatter.id, document: inHand.document.kind, messageId
      });
    }
    return message;
  }

  private requireOpenProposal(inHand: DocumentInHand, proposalId: string): DocumentProposal {
    const ticketId = inHand.ticket.frontmatter.id;
    const document = inHand.document.kind;
    const proposal = inHand.document.proposals.find((candidate) => candidate.proposalId === proposalId);
    if (proposal === undefined) throw new BoardRefusal({
      reason: 'document-unknown-proposal', ticketId, document, proposalId
    });
    if (proposal.state !== 'proposed') {
      throw new BoardRefusal({
        reason: 'document-proposal-not-open', ticketId, document, proposalId, state: proposal.state
      });
    }
    return proposal;
  }

  private documentOfRecord(loadedRecord: Readonly<LoadedTicketDocumentRecord>, kind: TicketDocumentKind): Readonly<TicketDocument> {
    return loadedRecord.record.documents.find((document) => document.kind === kind) ?? emptyDocumentOf(kind);
  }

  private writableDocumentOf(ticketId: string, kind: TicketDocumentKind): TicketDocument | null {
    return this.records.ticketDocumentRecordOf(ticketId)?.record.documents.find((document) => document.kind === kind) ?? null;
  }
}
