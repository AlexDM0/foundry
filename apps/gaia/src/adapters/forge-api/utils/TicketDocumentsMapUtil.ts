/**
 * Maps a forge's ticket documents (`ForgeTicketDocumentsDocument`, checked by `TICKET_DOCUMENTS_SHAPE`) into Gaia's `BoardTicketDocuments`,
 * key by key and value by value, so a key forge adds reaches Gaia only once it is named here. The Markdown stays source text.
 */
import type {
  CommentAnchorDocument,
  CommentView,
  DocumentApprovalDocument,
  DocumentApprover,
  DocumentAuthor,
  DocumentMessageDocument,
  DocumentMessageSender,
  DocumentOutOfDateDocument,
  DocumentProposalDocument,
  DocumentVersionDocument,
  EffectEntryDocument,
  EffectReadingDocument,
  EffectReadingState,
  EffectUnresolvedReason,
  ForgeTicketDocumentsDocument,
  LineChangeDocument,
  LineRangeDocument,
  TicketDocumentDocument,
} from 'forge-contracts/TicketDocumentsDocument';

import type {
  BoardCommentView,
  BoardDocumentApprover,
  BoardDocumentAuthor,
  BoardDocumentMessageSender,
  BoardEffectReadingState,
  BoardEffectUnresolvedReason,
} from '../../../shared/@types/board/BoardVocabulary.ts';
import type * as Gaia        from '../../../shared/@types/board/TicketDocuments.ts';
import { VocabularyMapUtil } from './VocabularyMapUtil.ts';

const VOCABULARIES = VocabularyMapUtil.vocabularies;

const DOCUMENT_AUTHOR = { person: 'person', agent: 'agent' } as const satisfies Record<DocumentAuthor, BoardDocumentAuthor>;

const DOCUMENT_APPROVER = { person: 'person', pipeline: 'pipeline' } as const satisfies Record<DocumentApprover, BoardDocumentApprover>;

const DOCUMENT_MESSAGE_SENDER = { person: 'person', board: 'board' } as const satisfies Record<DocumentMessageSender, BoardDocumentMessageSender>;

const COMMENT_VIEW = { preview: 'preview', code: 'code' } as const satisfies Record<CommentView, BoardCommentView>;

const EFFECT_READING_STATE = { reading: 'reading', read: 'read', failed: 'failed' } as const satisfies Record<EffectReadingState, BoardEffectReadingState>;

const EFFECT_UNRESOLVED_REASON = {
  'ambiguous': 'ambiguous',
  'no-match':  'no-match',
} as const satisfies Record<EffectUnresolvedReason, BoardEffectUnresolvedReason>;

function lineRangeOf(range: LineRangeDocument): Gaia.BoardLineRange {
  return { from: range.from, to: range.to };
}

function nullableLineRangeOf(range: LineRangeDocument | null): Gaia.BoardLineRange | null {
  return range === null ? null : lineRangeOf(range);
}

function versionOf(version: DocumentVersionDocument): Gaia.BoardDocumentVersion {
  return {
    number:             version.number,
    contentHash:        version.contentHash,
    author:             DOCUMENT_AUTHOR[version.author],
    jobId:              version.jobId,
    at:                 version.at,
    constitutionCommit: version.constitutionCommit,
    constitutionNumber: version.constitutionNumber,
  };
}

function approvalOf(approval: DocumentApprovalDocument): Gaia.BoardDocumentApproval {
  return {
    number:             approval.number,
    contentHash:        approval.contentHash,
    by:                 DOCUMENT_APPROVER[approval.by],
    at:                 approval.at,
    constitutionCommit: approval.constitutionCommit,
    constitutionNumber: approval.constitutionNumber,
    onSpecNumber:       approval.onSpecNumber,
    onSpecContentHash:  approval.onSpecContentHash,
  };
}

function commentAnchorOf(anchor: CommentAnchorDocument): Gaia.BoardCommentAnchor {
  return {
    view:             COMMENT_VIEW[anchor.view],
    versionNumber:    anchor.versionNumber,
    lines:            lineRangeOf(anchor.lines),
    columns:          anchor.columns === undefined ? null : { from: anchor.columns.from, to: anchor.columns.to },
    sectionPath:      [...anchor.sectionPath],
    quote:            anchor.quote ?? null,
    surroundingLines: lineRangeOf(anchor.surroundingLines),
    diagram:          anchor.diagram === undefined ? null : {
      lines:       lineRangeOf(anchor.diagram.lines),
      diagramKind: anchor.diagram.diagramKind,
      nodeId:      anchor.diagram.nodeId,
      nodeLabel:   anchor.diagram.nodeLabel,
    },
  };
}

function messageOf(message: DocumentMessageDocument): Gaia.BoardDocumentMessage {
  return {
    messageId:      message.messageId,
    commentNumber:  message.commentNumber,
    anchor:         message.anchor === null ? null : commentAnchorOf(message.anchor),
    placement:      nullableLineRangeOf(message.placement),
    orphaned:       message.orphaned,
    text:           message.text,
    from:           DOCUMENT_MESSAGE_SENDER[message.from],
    state:          VocabularyMapUtil.gaiaValueOf(VOCABULARIES.documentMessageState, message.state),
    queuedAt:       message.queuedAt,
    deliveryNumber: message.deliveryNumber,
    agentTurn:      message.agentTurn,
  };
}

function proposalOf(proposal: DocumentProposalDocument): Gaia.BoardDocumentProposal {
  return {
    proposalId: proposal.proposalId,
    jobId:      proposal.jobId,
    baseNumber: proposal.baseNumber,
    edits:      proposal.edits.map((edit) => ({
      fromLine:         edit.fromLine,
      toLine:           edit.toLine,
      originalLines:    [...edit.originalLines],
      replacementLines: [...edit.replacementLines],
    })),
    summary:          proposal.summary,
    answersMessageId: proposal.answersMessageId,
    forSpecNumber:    proposal.forSpecNumber,
    state:            VocabularyMapUtil.gaiaValueOf(VOCABULARIES.documentProposalState, proposal.state),
    appliedNumber:    proposal.appliedNumber,
    at:               proposal.at,
    headLines:        nullableLineRangeOf(proposal.headLines),
  };
}

function lineChangeOf(change: LineChangeDocument): Gaia.BoardLineChange {
  return {
    originalFromLine:    change.originalFromLine,
    originalLines:       [...change.originalLines],
    replacementFromLine: change.replacementFromLine,
    replacementLines:    [...change.replacementLines],
  };
}

function outOfDateOf(outOfDate: DocumentOutOfDateDocument): Gaia.BoardDocumentOutOfDate {
  return {
    approvedOnSpecNumber: outOfDate.approvedOnSpecNumber,
    specNumber:           outOfDate.specNumber,
    specChanges:          outOfDate.specChanges.map(lineChangeOf),
  };
}

function ticketDocumentOf(document: TicketDocumentDocument): Gaia.BoardTicketDocument {
  return {
    document:        VocabularyMapUtil.gaiaValueOf(VOCABULARIES.ticketDocumentKind, document.document),
    standing:        VocabularyMapUtil.gaiaValueOf(VOCABULARIES.documentStanding, document.standing),
    reviewer:        DOCUMENT_APPROVER[document.reviewer],
    holdsAcceptance: document.holdsAcceptance,
    editable:        document.editable,
    proposalMode:    VocabularyMapUtil.gaiaValueOf(VOCABULARIES.proposalMode, document.proposalMode),
    head:            document.head === null ? null : versionOf(document.head),
    markdown:        document.markdown,
    versions:        document.versions.map(versionOf),
    approvals:       document.approvals.map(approvalOf),
    messages:        document.messages.map(messageOf),
    proposals:       document.proposals.map(proposalOf),
    agentJobId:      document.agentJobId,
    outOfDate:       document.outOfDate === null ? null : outOfDateOf(document.outOfDate),
  };
}

function effectEntryOf(entry: EffectEntryDocument): Gaia.BoardEffectEntry {
  return {
    reference:        entry.reference,
    path:             entry.path,
    change:           VocabularyMapUtil.gaiaValueOf(VOCABULARIES.effectChange, entry.change),
    detail:           entry.detail,
    unresolvedReason: entry.unresolvedReason === null ? null : EFFECT_UNRESOLVED_REASON[entry.unresolvedReason],
    candidates:       [...entry.candidates],
  };
}

function effectReadingOf(reading: EffectReadingDocument): Gaia.BoardEffectReading {
  return {
    document:             VocabularyMapUtil.gaiaValueOf(VOCABULARIES.ticketDocumentKind, reading.document),
    versionNumber:        reading.versionNumber,
    state:                EFFECT_READING_STATE[reading.state],
    durationMilliseconds: reading.durationMilliseconds,
    references:           reading.references.map((reference) => ({ reference: reference.reference, lines: lineRangeOf(reference.lines), quote: reference.quote })),
    entries:              reading.entries.map(effectEntryOf),
  };
}

function ticketDocumentsOf(document: ForgeTicketDocumentsDocument): Gaia.BoardTicketDocuments {
  return {
    ticketId:       document.ticketId,
    documents:      document.documents.map(ticketDocumentOf),
    effectReadings: document.effectReadings.map(effectReadingOf),
  };
}

/** The forge values of the small vocabularies the documents alone carry, for their shape's `oneOf`. */
const FORGE_VALUES = {
  documentAuthor:         Object.keys(DOCUMENT_AUTHOR),
  documentApprover:       Object.keys(DOCUMENT_APPROVER),
  documentMessageSender:  Object.keys(DOCUMENT_MESSAGE_SENDER),
  commentView:            Object.keys(COMMENT_VIEW),
  effectReadingState:     Object.keys(EFFECT_READING_STATE),
  effectUnresolvedReason: Object.keys(EFFECT_UNRESOLVED_REASON),
} as const;

export const TicketDocumentsMapUtil = {
  forgeValues: FORGE_VALUES,
  ticketDocumentsOf,
} as const;
