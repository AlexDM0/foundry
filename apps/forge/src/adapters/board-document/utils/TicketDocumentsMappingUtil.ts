/**
 * A ticket's documents record mapped into the contract's documents of `GET /api/v1/tickets/{ticketId}/documents` and into the summary
 * the board document carries on the ticket.
 * Every field is named, so a field the record gains reaches no reader until it is mapped here.
 */
import type { BoardTicketDocumentsSummaryDocument, TicketDocumentSummaryDocument } from 'forge-contracts/BoardPageDocuments';
import type {
  CommentAnchorDocument,
  DocumentApprovalDocument,
  DocumentApprover,
  DocumentMessageDocument,
  DocumentOutOfDateDocument,
  DocumentProposalDocument,
  DocumentVersionDocument,
  EffectReadingDocument,
  ForgeTicketDocumentsDocument,
  LineChangeDocument,
  LineRangeDocument,
  TicketDocumentDocument
} from 'forge-contracts/TicketDocumentsDocument';

import type {
  CommentAnchor,
  DocumentApproval,
  DocumentMessage,
  DocumentProposal,
  DocumentStanding,
  DocumentVersion,
  LineRange,
  LoadedTicketDocumentRecord,
  TicketDocument,
  TicketDocumentKind
} from '../../../domain/tracker-model/@types/TicketDocument.ts';
import { TICKET_DOCUMENT_KINDS }      from '../../../domain/tracker-model/@types/TicketDocument.ts';
import { DocumentLineMergeUtil }      from '../../../domain/tracker-model/utils/DocumentLineMergeUtil.ts';
import { LineDiffUtil }               from '../../../domain/tracker-model/utils/LineDiffUtil.ts';
import type { LineHunk }              from '../../../domain/tracker-model/utils/LineDiffUtil.ts';
import { TicketDocumentStandingUtil } from '../../../domain/tracker-model/utils/TicketDocumentStandingUtil.ts';
import { TicketDocumentVersionUtil }  from '../../../domain/tracker-model/utils/TicketDocumentVersionUtil.ts';
import type { EffectReading }         from '../../../shared/@types/EffectReading.ts';

/** What forge reads of one document beyond its record: who approves it, whether User may change it, and the agent at work on it. */
export interface TicketDocumentFacts {
  readonly reviewer:   DocumentApprover;
  readonly editable:   boolean;
  readonly agentJobId: string | null;
}

export interface TicketDocumentsReading {
  readonly loadedRecord:         Readonly<LoadedTicketDocumentRecord>;
  readonly factsOf:              (document: TicketDocumentKind) => TicketDocumentFacts;
  /** The newest reading of each of the ticket's documents. */
  readonly effectReadings:       readonly EffectReading[];
  /** How many commits changed the constitution up to the commit; `null` when it cannot be told. */
  readonly constitutionNumberOf: (constitutionCommit: string) => number | null;
}

/** The mode a document the record does not hold yet would open in. */
const UNWRITTEN_DOCUMENT_PROPOSAL_MODE = 'ask-first';

function unwrittenDocumentOf(kind: TicketDocumentKind): TicketDocument {
  return {
    kind,
    versions:           [],
    approvals:          [],
    messages:           [],
    proposals:          [],
    proposalMode:       UNWRITTEN_DOCUMENT_PROPOSAL_MODE,
    nextMessageNumber:  1,
    nextCommentNumber:  1,
    nextProposalNumber: 1,
  };
}

/** Each document in pipeline order; one the record does not hold yet reads as unwritten. */
function documentsInOrderOf(loadedRecord: Readonly<LoadedTicketDocumentRecord>): Readonly<TicketDocument>[] {
  return TICKET_DOCUMENT_KINDS.map((kind) => loadedRecord.record.documents.find((document) => document.kind === kind) ?? unwrittenDocumentOf(kind));
}

function lineRangeOf(range: Readonly<LineRange>): LineRangeDocument {
  return { from: range.from, to: range.to };
}

function versionOf(version: Readonly<DocumentVersion>, constitutionNumberOf: TicketDocumentsReading['constitutionNumberOf']): DocumentVersionDocument {
  return {
    number:             version.number,
    contentHash:        version.contentHash,
    author:             version.author,
    jobId:              version.jobId ?? null,
    at:                 version.at,
    constitutionCommit: version.constitutionCommit ?? null,
    constitutionNumber: version.constitutionCommit === undefined ? null : constitutionNumberOf(version.constitutionCommit),
  };
}

function approvalOf(approval: Readonly<DocumentApproval>, constitutionNumberOf: TicketDocumentsReading['constitutionNumberOf']): DocumentApprovalDocument {
  return {
    number:             approval.number,
    contentHash:        approval.contentHash,
    by:                 approval.by,
    at:                 approval.at,
    constitutionCommit: approval.constitutionCommit,
    constitutionNumber: constitutionNumberOf(approval.constitutionCommit),
    onSpecNumber:       approval.onSpecNumber ?? null,
    onSpecContentHash:  approval.onSpecContentHash ?? null,
  };
}

function anchorOf(anchor: Readonly<CommentAnchor>): CommentAnchorDocument {
  return {
    view:             anchor.view,
    versionNumber:    anchor.versionNumber,
    lines:            lineRangeOf(anchor.lines),
    ...(anchor.columns === undefined ? {} : { columns: { from: anchor.columns.from, to: anchor.columns.to } }),
    sectionPath:      [...anchor.sectionPath],
    ...(anchor.quote === undefined ? {} : { quote: anchor.quote }),
    surroundingLines: lineRangeOf(anchor.surroundingLines),
    ...(anchor.diagram === undefined ? {} : {
      diagram: {
        lines: lineRangeOf(anchor.diagram.lines), diagramKind: anchor.diagram.diagramKind, nodeId: anchor.diagram.nodeId, nodeLabel: anchor.diagram.nodeLabel
      },
    }),
  };
}

function messageOf(message: Readonly<DocumentMessage>): DocumentMessageDocument {
  return {
    messageId:      message.messageId,
    commentNumber:  message.commentNumber ?? null,
    decisionId:     message.decisionId ?? null,
    answer:         message.answer === undefined ? null : { question: message.answer.question, choice: message.answer.choice, note: message.answer.note },
    anchor:         message.anchor === undefined ? null : anchorOf(message.anchor),
    placement:      message.placement === undefined ? null : lineRangeOf(message.placement),
    orphaned:       message.orphaned === true,
    text:           message.text,
    from:           message.from,
    state:          message.state,
    queuedAt:       message.queuedAt,
    deliveryNumber: message.deliveryNumber ?? null,
    agentTurn:      message.agentTurn ?? null,
  };
}

function textOfVersion(loadedRecord: Readonly<LoadedTicketDocumentRecord>, version: Readonly<DocumentVersion> | null): string | null {
  if (version === null) return null;
  return Object.hasOwn(loadedRecord.textOfContentHash, version.contentHash) ? loadedRecord.textOfContentHash[version.contentHash] ?? null : null;
}

/**
 * Only an open proposal covers lines: from its first edit's first line at the head to its last edit's last, carried onto the head as
 * applying it would; `null` when the head changed a line it edits.
 */
function proposalHeadLinesOf(
  proposal: Readonly<DocumentProposal>,
  document: Readonly<TicketDocument>,
  loadedRecord: Readonly<LoadedTicketDocumentRecord>
): LineRangeDocument | null {
  if (proposal.state !== 'proposed' || proposal.baseNumber === null || proposal.edits.length === 0) return null;
  const baseText = textOfVersion(loadedRecord, TicketDocumentVersionUtil.versionOfNumber(document, proposal.baseNumber));
  const headText = textOfVersion(loadedRecord, TicketDocumentVersionUtil.headOf(document));
  if (baseText === null || headText === null) return null;
  const editsOnHead = DocumentLineMergeUtil.editsOnHeadOf(LineDiffUtil.linesOf(baseText), LineDiffUtil.linesOf(headText), proposal.edits);
  if (editsOnHead === null) return null;
  return { from: Math.min(...editsOnHead.map((edit) => edit.fromLine)), to: Math.max(...editsOnHead.map((edit) => edit.toLine)) };
}

function proposalOf(proposal: Readonly<DocumentProposal>, headLines: LineRangeDocument | null): DocumentProposalDocument {
  return {
    proposalId: proposal.proposalId,
    jobId:      proposal.jobId,
    baseNumber: proposal.baseNumber,
    edits:      proposal.edits.map((edit) => ({
      fromLine: edit.fromLine, toLine: edit.toLine, originalLines: [...edit.originalLines], replacementLines: [...edit.replacementLines]
    })),
    summary:          proposal.summary,
    answersMessageId: proposal.answersMessageId ?? null,
    forSpecNumber:    proposal.forSpecNumber ?? null,
    state:            proposal.state,
    appliedNumber:    proposal.appliedNumber ?? null,
    at:               proposal.at,
    headLines,
  };
}

function lineChangeOf(hunk: Readonly<LineHunk>): LineChangeDocument {
  return {
    originalFromLine:    hunk.originalFromLine,
    originalLines:       [...hunk.originalLines],
    replacementFromLine: hunk.replacementFromLine,
    replacementLines:    [...hunk.replacementLines],
  };
}

/**
 * A plan out of date: the spec version it was approved on, or with no approval at its head the one it was written for, the spec's head now,
 * and the spec's lines changed between the two.
 */
function outOfDateOf(plan: Readonly<TicketDocument>, spec: Readonly<TicketDocument>, loadedRecord: Readonly<LoadedTicketDocumentRecord>): DocumentOutOfDateDocument | null {
  const specVersion = TicketDocumentStandingUtil.specVersionOfPlanHeadOf(plan, spec);
  const specHead    = TicketDocumentVersionUtil.headOf(spec);
  if (specVersion === null || specHead === null) return null;
  const approvedOnText = Object.hasOwn(loadedRecord.textOfContentHash, specVersion.contentHash) ? loadedRecord.textOfContentHash[specVersion.contentHash] : undefined;
  const specHeadText = textOfVersion(loadedRecord, specHead);
  const specChanges = approvedOnText === undefined || specHeadText === null
    ? []
    : LineDiffUtil.hunksOf(LineDiffUtil.linesOf(approvedOnText), LineDiffUtil.linesOf(specHeadText)).map(lineChangeOf);
  return { approvedOnSpecNumber: specVersion.number, specNumber: specHead.number, specChanges };
}

function documentOf(
  document: Readonly<TicketDocument>,
  standing: DocumentStanding,
  spec: Readonly<TicketDocument>,
  reading: TicketDocumentsReading
): TicketDocumentDocument {
  const { loadedRecord, constitutionNumberOf } = reading;
  const facts = reading.factsOf(document.kind);
  const head = TicketDocumentVersionUtil.headOf(document);
  return {
    document:        document.kind,
    standing,
    reviewer:        facts.reviewer,
    holdsAcceptance: document.kind === 'spec',
    editable:        facts.editable,
    proposalMode:    document.proposalMode,
    head:            head === null ? null : versionOf(head, constitutionNumberOf),
    markdown:        textOfVersion(loadedRecord, head) ?? '',
    versions:        document.versions.map((version) => versionOf(version, constitutionNumberOf)),
    approvals:       document.approvals.map((approval) => approvalOf(approval, constitutionNumberOf)),
    messages:        document.messages.map(messageOf),
    proposals:       document.proposals.map((proposal) => proposalOf(proposal, proposalHeadLinesOf(proposal, document, loadedRecord))),
    agentJobId:      facts.agentJobId,
    outOfDate:       document.kind === 'plan' && standing === 'out-of-date' ? outOfDateOf(document, spec, loadedRecord) : null,
  };
}

function effectReadingOf(reading: Readonly<EffectReading>): EffectReadingDocument {
  return {
    document:             reading.document,
    versionNumber:        reading.versionNumber,
    state:                reading.state,
    durationMilliseconds: reading.durationMilliseconds,
    references:           reading.references.map((reference) => ({ reference: reference.reference, lines: lineRangeOf(reference.lines), quote: reference.quote })),
    entries:              reading.entries.map((entry) => ({
      reference:        entry.reference,
      path:             entry.path,
      change:           entry.change,
      detail:           entry.detail,
      unresolvedReason: entry.unresolvedReason,
      candidates:       [...entry.candidates],
    })),
  };
}

function ticketDocumentsOf(reading: TicketDocumentsReading): ForgeTicketDocumentsDocument {
  const { record } = reading.loadedRecord;
  const standings = TicketDocumentStandingUtil.standingsOf(record);
  const documents = documentsInOrderOf(reading.loadedRecord);
  const spec = documents.find((document) => document.kind === 'spec') ?? unwrittenDocumentOf('spec');
  return {
    ticketId:       record.ticketId,
    documents:      documents.map((document) => documentOf(document, standings[document.kind], spec, reading)),
    effectReadings: reading.effectReadings.map(effectReadingOf),
  };
}

function documentSummaryOf(document: Readonly<TicketDocument>, standing: DocumentStanding): TicketDocumentSummaryDocument {
  return {
    standing,
    headNumber:     TicketDocumentVersionUtil.headOf(document)?.number ?? null,
    approvedNumber: document.approvals.at(-1)?.number ?? null,
  };
}

/** Where the ticket's spec and plan stand on the board document; `buildHeld` while they keep a committed ticket from its build. */
function documentsSummaryOf(loadedRecord: Readonly<LoadedTicketDocumentRecord>, buildHeld: boolean): BoardTicketDocumentsSummaryDocument {
  const standings = TicketDocumentStandingUtil.standingsOf(loadedRecord.record);
  const [spec = unwrittenDocumentOf('spec'), plan = unwrittenDocumentOf('plan')] = documentsInOrderOf(loadedRecord);
  return { spec: documentSummaryOf(spec, standings.spec), plan: documentSummaryOf(plan, standings.plan), buildHeld };
}

export const TicketDocumentsMappingUtil = Object.freeze({
  ticketDocumentsOf, documentsSummaryOf, proposalHeadLinesOf, anchorOf
});
