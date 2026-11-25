/**
 * The head of a ticket's documents page, pure: the document tabs in pipeline order (a tab is muted until the document before it is
 * approved, `✓ Spec v5` once approved, the plan out of date once the spec moved under it), `then Build` and whether the build is held,
 * the state line, the comment count, and the one primary button: approve the head version, worded for what it starts, locked while there
 * is nothing to approve or while the agent's questions on the document are open, saying how many beside it, and read-only `Approved by
 * pipeline` where the review is off. Approve names the head, so a head that moved since the page read it, or a question asked since, is the
 * forge's refusal to word.
 */
import type { BoardCommandDocument }                                     from '../../../@types/board/BoardCommandDocument.ts';
import type { BoardTicketDocument }                                      from '../../../@types/board/BoardTicketDocuments.ts';
import type { BoardTicketDocumentKind }                                  from '../../../@types/board/BoardVocabulary.ts';
import type { BoardTicketDocumentDocument, GaiaTicketDocumentsDocument } from '../../../@types/board/TicketDocumentsDocument.ts';
import { TimeUtil }                                                      from '../../utils/TimeUtil.ts';
import { DocumentQuestionsModel }                                        from './DocumentQuestionsModel.ts';
import { TicketDocumentCommands }                                        from './TicketDocumentCommands.ts';

export const OUT_OF_DATE_SUFFIX = '· out of date';

export interface DocumentTabModel {
  readonly document: BoardTicketDocumentKind;
  /** "Spec", "✓ Spec", "Plan". */
  readonly label:    string;
  /** The approved version after a ticked label, in mono: "v5". */
  readonly version:  string | null;
  /** "· after spec", "· out of date". */
  readonly suffix:   string | null;
  /** The document before it is not approved yet. */
  readonly muted:    boolean;
  readonly selected: boolean;
}

export type PrimaryActionModel =
  | {
    readonly kind:              'approve';
    readonly label:             string;
    /** `null` while the button is locked. */
    readonly command:           BoardCommandDocument | null;
    /** Why the button is locked, said beside it; `null` while it is not. */
    readonly lockReason:        string | null;
    /** "2 questions open" beside the button while the agent's questions lock it; `null` otherwise. */
    readonly openQuestionsText: string | null;
  }
  | { readonly kind: 'approved-by-pipeline'; readonly label: string };

export interface DocumentsHeadModel {
  readonly tabs:          readonly DocumentTabModel[];
  /** "then Build" or "then Build · held". */
  readonly buildText:     string;
  /** The ticket is still a draft. */
  readonly isDraft:       boolean;
  /** "spec · v4 · saved 13:05". */
  readonly stateLine:     string;
  readonly commentCount:  number;
  readonly primaryAction: PrimaryActionModel;
  /** The document opens read-only: User may not edit it. */
  readonly readOnly:      boolean;
}

export interface DocumentsHeadReading {
  readonly documents:          GaiaTicketDocumentsDocument;
  readonly ticket:             BoardTicketDocument;
  readonly shown:              BoardTicketDocumentKind;
  /** User's text differs from the head and is not saved yet. */
  readonly editing:            boolean;
  /** The agent's questions on the shown document that wait on User. */
  readonly openQuestionCount?: number;
}

const APPROVE_LABELS: Readonly<Record<BoardTicketDocumentKind, string>> = {
  spec: 'Approve spec · start Plan',
  plan: 'Approve plan · start build',
};

const APPROVE_AGAIN_LABEL = 'Approve plan again · start build';

export const OPEN_QUESTIONS_LOCK_REASON = 'Answer the open questions first.';

const TAB_TITLES: Readonly<Record<BoardTicketDocumentKind, string>> = { spec: 'Spec', plan: 'Plan' };

function documentOf(documents: GaiaTicketDocumentsDocument, kind: BoardTicketDocumentKind): BoardTicketDocumentDocument | null {
  return documents.documents.find((document) => document.document === kind) ?? null;
}

function newestApprovalOf(document: BoardTicketDocumentDocument | null) {
  return document?.approvals.at(-1) ?? null;
}

function tabOf(documents: GaiaTicketDocumentsDocument, kind: BoardTicketDocumentKind, shown: BoardTicketDocumentKind): DocumentTabModel {
  const document = documentOf(documents, kind);
  const approvedAtHead = document?.standing === 'approved';
  const spec = documentOf(documents, 'spec');
  const waitsOnSpec = kind === 'plan' && spec?.standing !== 'approved' && (spec?.approvals.length ?? 0) === 0;
  const suffix = waitsOnSpec ? '· after spec' : document?.standing === 'out-of-date' ? OUT_OF_DATE_SUFFIX : null;
  return {
    document: kind,
    label:    approvedAtHead ? `✓ ${TAB_TITLES[kind]}` : TAB_TITLES[kind],
    version:  approvedAtHead && document.head !== null ? `v${document.head.number}` : null,
    suffix,
    muted:    waitsOnSpec,
    selected: kind === shown,
  };
}

function clockTextOf(at: string): string | null {
  const epochMilliseconds = TimeUtil.epochMillisecondsOf(at);
  return epochMilliseconds === null ? null : TimeUtil.clockOf(new Date(epochMilliseconds));
}

function stateLineOf(document: BoardTicketDocumentDocument | null, kind: BoardTicketDocumentKind, editing: boolean): string {
  if (document === null || document.head === null) return `${kind} · no version yet`;
  const version = `${kind} · v${document.head.number}`;
  if (editing) return `${version} · editing`;
  const openEdits = document.proposals.filter((proposal) => proposal.state === 'proposed').length;
  if (document.standing === 'out-of-date' && document.outOfDate !== null) {
    return `${version} · approved on spec v${document.outOfDate.approvedOnSpecNumber}`;
  }
  if (openEdits > 0) return `${version} · ${openEdits} ${openEdits === 1 ? 'edit' : 'edits'} proposed`;
  const savedAt = clockTextOf(document.head.at);
  return savedAt === null ? version : `${version} · saved ${savedAt}`;
}

function lockReasonOf(reading: DocumentsHeadReading, document: BoardTicketDocumentDocument | null): string | null {
  const { documents, shown, editing } = reading;
  if (document === null || document.head === null) return `The ${shown} has no version to approve yet.`;
  if (editing) return 'Your edit is not saved yet.';
  if (document.standing === 'approved') return `v${document.head.number} is approved.`;
  if (shown === 'plan' && documentOf(documents, 'spec')?.standing !== 'approved') return 'The spec is approved first.';
  if (!document.editable) return `The ${shown} can no longer change.`;
  if ((reading.openQuestionCount ?? 0) > 0) return OPEN_QUESTIONS_LOCK_REASON;
  return null;
}

function primaryActionOf(reading: DocumentsHeadReading, document: BoardTicketDocumentDocument | null): PrimaryActionModel {
  const { ticket, shown } = reading;
  if (document?.reviewer === 'pipeline') return { kind: 'approved-by-pipeline', label: 'Approved by pipeline' };
  const label = shown === 'plan' && document?.standing === 'out-of-date' ? APPROVE_AGAIN_LABEL : APPROVE_LABELS[shown];
  const lockReason = lockReasonOf(reading, document);
  const head = document?.head ?? null;
  const command = lockReason === null && head !== null ? TicketDocumentCommands.approveOf({ ticketId: ticket.id, document: shown }, head.number) : null;
  const openQuestionsText = lockReason === OPEN_QUESTIONS_LOCK_REASON ? DocumentQuestionsModel.openCountTextOf(reading.openQuestionCount ?? 0) : null;
  return {
    kind: 'approve', label, command, lockReason, openQuestionsText
  };
}

function headOf(reading: DocumentsHeadReading): DocumentsHeadModel {
  const {
    documents, ticket, shown, editing
  } = reading;
  const document = documentOf(documents, shown);
  return {
    tabs:          (['spec', 'plan'] as const).map((kind) => tabOf(documents, kind, shown)),
    buildText:     ticket.documents?.buildHeld === true ? 'then Build · held' : 'then Build',
    isDraft:       ticket.status === 'draft',
    stateLine:     stateLineOf(document, shown, editing),
    commentCount:  document?.messages.filter((message) => message.commentNumber !== null).length ?? 0,
    primaryAction: primaryActionOf(reading, document),
    readOnly:      document === null || !document.editable || document.reviewer === 'pipeline',
  };
}

export interface SpecChangeModel {
  readonly key:      string;
  /** "Spec · A2", or "Spec · line 29" where the lines name no item. */
  readonly label:    string;
  readonly removed:  string;
  readonly inserted: string;
}

export interface OutOfDateNoticeModel {
  readonly title:    string;
  readonly sentence: string;
  readonly changes:  readonly SpecChangeModel[];
}

/** A list item's label, `**A2**`, after its marker and checkbox. */
const ITEM_LABEL = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?\*\*([^*]+)\*\*\s*/u;

const ITEM_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/u;

function itemLabelOf(lines: readonly string[]): string | null {
  for (const line of lines) {
    const label = ITEM_LABEL.exec(line)?.[1];
    if (label !== undefined) return label.trim();
  }
  return null;
}

function itemTextOf(lines: readonly string[]): string {
  return lines.map((line) => line.replace(ITEM_LABEL, '').replace(ITEM_MARKER, '').trim()).filter((line) => line !== '').join(' ');
}

/** The notice over a plan the spec moved under: what changed in the spec, worded old and new, and that the build waits. */
function outOfDateNoticeOf(plan: BoardTicketDocumentDocument): OutOfDateNoticeModel | null {
  const { outOfDate } = plan;
  if (outOfDate === null || plan.head === null) return null;
  const approval = newestApprovalOf(plan);
  const approver = approval?.by === 'pipeline' ? 'The pipeline approved' : 'You approved';
  const changes = outOfDate.specChanges.map((change, position): SpecChangeModel => {
    const label = itemLabelOf([...change.originalLines, ...change.replacementLines]);
    const lastLine = change.replacementFromLine + Math.max(change.replacementLines.length, 1) - 1;
    const where = lastLine === change.replacementFromLine ? `line ${change.replacementFromLine}` : `lines ${change.replacementFromLine}–${lastLine}`;
    return {
      key: `${position}`, label: `Spec · ${label ?? where}`, removed: itemTextOf(change.originalLines), inserted: itemTextOf(change.replacementLines)
    };
  });
  const names = changes.map((change) => change.label.replace('Spec · ', ''));
  const changed = names.length === 0 ? '' : ` Spec v${outOfDate.specNumber} changed ${names.join(', ')}.`;
  return {
    title:    'The spec changed after this plan was approved',
    sentence: `${approver} plan v${approval?.number ?? plan.head.number} on spec v${outOfDate.approvedOnSpecNumber}.${changed} The build waits until this plan is approved again.`,
    changes,
  };
}

export const TicketDocumentsViewModel = Object.freeze({
  headOf, documentOf, newestApprovalOf, outOfDateNoticeOf
});
