/**
 * A ticket's documents record as its stored JSON: every key in one fixed order and an optional key only once set, so a record read and
 * written back stays byte for byte as it was.
 */
import type {
  CommentAnchor,
  DocumentApproval,
  DocumentMessage,
  DocumentProposal,
  DocumentVersion,
  LineEdit,
  TicketDocument,
  TicketDocumentRecord
} from '../../lib/tracker-model/@types/TicketDocument.ts';

const INDENTATION_SPACES = 2;

function versionOf(version: Readonly<DocumentVersion>): Record<string, unknown> {
  return {
    number:      version.number,
    contentHash: version.contentHash,
    author:      version.author,
    ...(version.jobId === undefined ? {} : { jobId: version.jobId }),
    at:          version.at,
    ...(version.constitutionCommit === undefined ? {} : { constitutionCommit: version.constitutionCommit }),
  };
}

function approvalOf(approval: Readonly<DocumentApproval>): Record<string, unknown> {
  return {
    number:             approval.number,
    contentHash:        approval.contentHash,
    by:                 approval.by,
    at:                 approval.at,
    constitutionCommit: approval.constitutionCommit,
    ...(approval.onSpecNumber === undefined ? {} : { onSpecNumber: approval.onSpecNumber }),
    ...(approval.onSpecContentHash === undefined ? {} : { onSpecContentHash: approval.onSpecContentHash }),
  };
}

function anchorOf(anchor: Readonly<CommentAnchor>): Record<string, unknown> {
  return {
    view:             anchor.view,
    versionNumber:    anchor.versionNumber,
    lines:            { from: anchor.lines.from, to: anchor.lines.to },
    ...(anchor.columns === undefined ? {} : { columns: { from: anchor.columns.from, to: anchor.columns.to } }),
    sectionPath:      [...anchor.sectionPath],
    ...(anchor.quote === undefined ? {} : { quote: anchor.quote }),
    surroundingLines: { from: anchor.surroundingLines.from, to: anchor.surroundingLines.to },
    ...(anchor.diagram === undefined ? {} : {
      diagram: {
        lines:       { from: anchor.diagram.lines.from, to: anchor.diagram.lines.to },
        diagramKind: anchor.diagram.diagramKind,
        nodeId:      anchor.diagram.nodeId,
        nodeLabel:   anchor.diagram.nodeLabel,
      },
    }),
  };
}

function messageOf(message: Readonly<DocumentMessage>): Record<string, unknown> {
  return {
    messageId: message.messageId,
    ...(message.commentNumber === undefined ? {} : { commentNumber: message.commentNumber }),
    ...(message.decisionId === undefined ? {} : { decisionId: message.decisionId }),
    ...(message.anchor === undefined ? {} : { anchor: anchorOf(message.anchor) }),
    ...(message.placement === undefined ? {} : { placement: { from: message.placement.from, to: message.placement.to } }),
    ...(message.orphaned === true ? { orphaned: true } : {}),
    text:      message.text,
    from:      message.from,
    state:     message.state,
    queuedAt:  message.queuedAt,
    ...(message.deliveryNumber === undefined ? {} : { deliveryNumber: message.deliveryNumber }),
    ...(message.agentTurn === undefined ? {} : { agentTurn: message.agentTurn }),
  };
}

function editOf(edit: Readonly<LineEdit>): Record<string, unknown> {
  return {
    fromLine: edit.fromLine, toLine: edit.toLine, originalLines: [...edit.originalLines], replacementLines: [...edit.replacementLines]
  };
}

function proposalOf(proposal: Readonly<DocumentProposal>): Record<string, unknown> {
  return {
    proposalId: proposal.proposalId,
    jobId:      proposal.jobId,
    baseNumber: proposal.baseNumber,
    edits:      proposal.edits.map(editOf),
    summary:    proposal.summary,
    ...(proposal.answersMessageId === undefined ? {} : { answersMessageId: proposal.answersMessageId }),
    ...(proposal.forSpecNumber === undefined ? {} : { forSpecNumber: proposal.forSpecNumber }),
    state:      proposal.state,
    ...(proposal.appliedNumber === undefined ? {} : { appliedNumber: proposal.appliedNumber }),
    at:         proposal.at,
  };
}

function documentOf(document: Readonly<TicketDocument>): Record<string, unknown> {
  return {
    kind:               document.kind,
    versions:           document.versions.map(versionOf),
    approvals:          document.approvals.map(approvalOf),
    messages:           document.messages.map(messageOf),
    proposals:          document.proposals.map(proposalOf),
    proposalMode:       document.proposalMode,
    ...(document.readyAtNumber === undefined ? {} : { readyAtNumber: document.readyAtNumber }),
    nextMessageNumber:  document.nextMessageNumber,
    nextCommentNumber:  document.nextCommentNumber,
    nextProposalNumber: document.nextProposalNumber,
  };
}

function contentsOf(record: Readonly<TicketDocumentRecord>): string {
  const stored = {
    version: record.version, ticketId: record.ticketId, openedAt: record.openedAt, documents: record.documents.map(documentOf)
  };
  return `${JSON.stringify(stored, null, INDENTATION_SPACES)}\n`;
}

export const TicketDocumentsFileWriter = Object.freeze({ contentsOf });
