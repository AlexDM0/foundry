/**
 * Maps a ticket's spec and plan, as Gaia holds them, out to the page's `GaiaTicketDocumentsDocument`, key by key, so a key the model gains
 * reaches the page only when the contract names it. The Markdown leaves as its source text: the page parses it and draws it as text.
 */
import type {
  BoardCommentAnchorDocument,
  BoardDocumentApprovalDocument,
  BoardDocumentMessageDocument,
  BoardDocumentOutOfDateDocument,
  BoardDocumentProposalDocument,
  BoardDocumentVersionDocument,
  BoardEffectReadingDocument,
  BoardLineChangeDocument,
  BoardLineRangeDocument,
  BoardTicketDocumentDocument,
  GaiaTicketDocumentsDocument,
} from '../../../page/@types/board/TicketDocumentsDocument.ts';
import type {
  BoardCommentAnchor,
  BoardDocumentApproval,
  BoardDocumentMessage,
  BoardDocumentOutOfDate,
  BoardDocumentProposal,
  BoardDocumentVersion,
  BoardEffectReading,
  BoardLineChange,
  BoardLineRange,
  BoardTicketDocument,
  BoardTicketDocuments,
} from '../../shared/@types/board/TicketDocuments.ts';
import { PAGE_CONTRACT_VERSIONS } from '../../shared/constants/PageContractVersions.ts';

function lineRangeOut(range: BoardLineRange): BoardLineRangeDocument {
  return { from: range.from, to: range.to };
}

function nullableLineRangeOut(range: BoardLineRange | null): BoardLineRangeDocument | null {
  return range === null ? null : lineRangeOut(range);
}

function versionOut(version: BoardDocumentVersion): BoardDocumentVersionDocument {
  return {
    number:             version.number,
    contentHash:        version.contentHash,
    author:             version.author,
    jobId:              version.jobId,
    at:                 version.at,
    constitutionCommit: version.constitutionCommit,
    constitutionNumber: version.constitutionNumber,
  };
}

function approvalOut(approval: BoardDocumentApproval): BoardDocumentApprovalDocument {
  return {
    number:             approval.number,
    contentHash:        approval.contentHash,
    by:                 approval.by,
    at:                 approval.at,
    constitutionCommit: approval.constitutionCommit,
    constitutionNumber: approval.constitutionNumber,
    onSpecNumber:       approval.onSpecNumber,
    onSpecContentHash:  approval.onSpecContentHash,
  };
}

function commentAnchorOut(anchor: BoardCommentAnchor): BoardCommentAnchorDocument {
  return {
    view:             anchor.view,
    versionNumber:    anchor.versionNumber,
    lines:            lineRangeOut(anchor.lines),
    columns:          anchor.columns === null ? null : { from: anchor.columns.from, to: anchor.columns.to },
    sectionPath:      anchor.sectionPath,
    quote:            anchor.quote,
    surroundingLines: lineRangeOut(anchor.surroundingLines),
    diagram:          anchor.diagram === null ? null : {
      lines:       lineRangeOut(anchor.diagram.lines),
      diagramKind: anchor.diagram.diagramKind,
      nodeId:      anchor.diagram.nodeId,
      nodeLabel:   anchor.diagram.nodeLabel,
    },
  };
}

function messageOut(message: BoardDocumentMessage): BoardDocumentMessageDocument {
  return {
    messageId:      message.messageId,
    commentNumber:  message.commentNumber,
    decisionId:     message.decisionId,
    anchor:         message.anchor === null ? null : commentAnchorOut(message.anchor),
    placement:      nullableLineRangeOut(message.placement),
    orphaned:       message.orphaned,
    text:           message.text,
    from:           message.from,
    state:          message.state,
    queuedAt:       message.queuedAt,
    deliveryNumber: message.deliveryNumber,
    agentTurn:      message.agentTurn,
  };
}

function proposalOut(proposal: BoardDocumentProposal): BoardDocumentProposalDocument {
  return {
    proposalId: proposal.proposalId,
    jobId:      proposal.jobId,
    baseNumber: proposal.baseNumber,
    edits:      proposal.edits.map((edit) => ({
      fromLine:         edit.fromLine,
      toLine:           edit.toLine,
      originalLines:    edit.originalLines,
      replacementLines: edit.replacementLines,
    })),
    summary:          proposal.summary,
    answersMessageId: proposal.answersMessageId,
    forSpecNumber:    proposal.forSpecNumber,
    state:            proposal.state,
    appliedNumber:    proposal.appliedNumber,
    at:               proposal.at,
    headLines:        nullableLineRangeOut(proposal.headLines),
  };
}

function lineChangeOut(change: BoardLineChange): BoardLineChangeDocument {
  return {
    originalFromLine:    change.originalFromLine,
    originalLines:       change.originalLines,
    replacementFromLine: change.replacementFromLine,
    replacementLines:    change.replacementLines,
  };
}

function outOfDateOut(outOfDate: BoardDocumentOutOfDate | null): BoardDocumentOutOfDateDocument | null {
  if (outOfDate === null) return null;
  return {
    approvedOnSpecNumber: outOfDate.approvedOnSpecNumber,
    specNumber:           outOfDate.specNumber,
    specChanges:          outOfDate.specChanges.map(lineChangeOut),
  };
}

function ticketDocumentOut(document: BoardTicketDocument): BoardTicketDocumentDocument {
  return {
    document:        document.document,
    standing:        document.standing,
    reviewer:        document.reviewer,
    holdsAcceptance: document.holdsAcceptance,
    editable:        document.editable,
    proposalMode:    document.proposalMode,
    head:            document.head === null ? null : versionOut(document.head),
    markdown:        document.markdown,
    versions:        document.versions.map(versionOut),
    approvals:       document.approvals.map(approvalOut),
    messages:        document.messages.map(messageOut),
    proposals:       document.proposals.map(proposalOut),
    agentJobId:      document.agentJobId,
    outOfDate:       outOfDateOut(document.outOfDate),
  };
}

function effectReadingOut(reading: BoardEffectReading): BoardEffectReadingDocument {
  return {
    document:             reading.document,
    versionNumber:        reading.versionNumber,
    state:                reading.state,
    durationMilliseconds: reading.durationMilliseconds,
    references:           reading.references.map((reference) => ({ reference: reference.reference, lines: lineRangeOut(reference.lines), quote: reference.quote })),
    entries:              reading.entries.map((entry) => ({
      reference:        entry.reference,
      path:             entry.path,
      change:           entry.change,
      detail:           entry.detail,
      unresolvedReason: entry.unresolvedReason,
      candidates:       entry.candidates,
    })),
  };
}

function ticketDocumentsDocumentOf(ticketDocuments: BoardTicketDocuments): GaiaTicketDocumentsDocument {
  return {
    ticketDocumentsVersion: PAGE_CONTRACT_VERSIONS.gaiaTicketDocuments,
    ticketId:               ticketDocuments.ticketId,
    documents:              ticketDocuments.documents.map(ticketDocumentOut),
    effectReadings:         ticketDocuments.effectReadings.map(effectReadingOut),
  };
}

export const TicketDocumentsDocumentMapUtil = {
  ticketDocumentsDocumentOf,
  commentAnchorOut,
  lineRangeOut,
} as const;
