/**
 * A ticket's spec and plan in the spec-then-plan route: the user's saves, comments and approvals, the agent's proposals and its ready, and
 * the queue of messages Hephaestus writes to the agent one at a time. Each move changes the ticket's documents record in place and marks
 * it for the hold to write.
 */
import type {
  CommentAnchor,
  DocumentMessage,
  DocumentProposal,
  DocumentStanding,
  LineEdit,
  ProposalMode,
  TicketDocument,
  TicketDocumentKind
} from './@types/TicketDocument.ts';
import type { BoardRecords }          from './BoardRecords.ts';
import { BoardRefusal }               from './BoardRefusal.ts';
import { TicketDocumentStandingUtil } from './utils/TicketDocumentStandingUtil.ts';

/** What a document agent proposes: its edits on the version it read, `null` for the first write. */
export interface ProposalSubmission {
  baseNumber:        number | null;
  edits:             LineEdit[];
  summary:           string;
  answersMessageId?: string;
  forSpecNumber?:    number;
}

/** `versionNumber` is the head after the save; `changed` is false for a text equal to the head's, which makes no version. */
export interface DocumentSaved {
  changed:       boolean;
  versionNumber: number;
}

export class TicketDocuments {
  constructor(private readonly records: BoardRecords) {}

  /** `null` for a ticket with no documents record, or a record without that document. */
  documentOf(ticketId: string, kind: TicketDocumentKind): Readonly<TicketDocument> | null {
    return this.writableDocumentOf(ticketId, kind);
  }

  /** `null` for a ticket with no documents record; a document the record lacks is `unwritten`. */
  standingOf(ticketId: string, kind: TicketDocumentKind): DocumentStanding | null {
    const loadedRecord = this.records.ticketDocumentRecordOf(ticketId);
    return loadedRecord === undefined ? null : TicketDocumentStandingUtil.standingsOf(loadedRecord.record)[kind];
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

  readonly open: (ticketId: string, at: string) => void = () => {
    throw new Error('lane B');
  };

  readonly save: (ticketId: string, document: TicketDocumentKind, baseNumber: number | null, markdown: string, at: string) => DocumentSaved = () => {
    throw new Error('lane B');
  };

  readonly comment: (ticketId: string, document: TicketDocumentKind, anchor: CommentAnchor | null, text: string, at: string) => DocumentMessage = () => {
    throw new Error('lane B');
  };

  readonly withdrawComment: (ticketId: string, document: TicketDocumentKind, messageId: string, at: string) => void = () => {
    throw new Error('lane B');
  };

  readonly queueBoardMessage: (ticketId: string, document: TicketDocumentKind, text: string, at: string) => DocumentMessage = () => {
    throw new Error('lane B');
  };

  readonly propose: (
    ticketId: string,
    document: TicketDocumentKind,
    jobId: string,
    submission: ProposalSubmission,
    constitutionCommit: string,
    at: string
  ) => DocumentProposal = () => {
      throw new Error('lane B');
    };

  readonly applyProposal: (
    ticketId: string,
    document: TicketDocumentKind,
    proposalId: string,
    replacementLines: string[][] | null,
    at: string
  ) => void = () => {
      throw new Error('lane B');
    };

  readonly discardProposal: (ticketId: string, document: TicketDocumentKind, proposalId: string, at: string) => void = () => {
    throw new Error('lane B');
  };

  readonly setProposalMode: (ticketId: string, document: TicketDocumentKind, mode: ProposalMode, at: string) => void = () => {
    throw new Error('lane B');
  };

  readonly markReady: (ticketId: string, document: TicketDocumentKind, jobId: string, constitutionCommit: string, at: string) => void = () => {
    throw new Error('lane B');
  };

  readonly approve: (ticketId: string, document: TicketDocumentKind, versionNumber: number, constitutionCommit: string, at: string) => void = () => {
    throw new Error('lane B');
  };

  private writableDocumentOf(ticketId: string, kind: TicketDocumentKind): TicketDocument | null {
    return this.records.ticketDocumentRecordOf(ticketId)?.record.documents.find((document) => document.kind === kind) ?? null;
  }
}
