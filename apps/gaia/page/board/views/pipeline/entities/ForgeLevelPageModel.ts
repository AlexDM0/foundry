/**
 * The forge level's page, pure: the approvals every entity shares, those of the Ticket phase as the route writes a ticket, with the hint of
 * each state and the edit a switch sends; the steps that write a ticket in the route the flow draws; the merge train's conflict re-review,
 * the board limit and the entity caps under it, worded in jobs, and the footer's count of the entities and their gates. The board limit is
 * the board's setting, sent by its own control at once; every other setting here is a draft field.
 */
import { PAGE_CONTRACT_VERSIONS }                                                              from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument }                                                           from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardConcurrencyBoundsDocument }                                                 from '../../../../@types/board/BoardFactDocuments.ts';
import type { BoardDraftEditDocument, BoardFlowNodeDocument, BoardPipelineDefinitionDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardPipelineApproval, BoardPipelineNodeKind, BoardTicketWritingRoute }          from '../../../../@types/board/BoardVocabulary.ts';

export interface ApprovalView {
  readonly approval: BoardPipelineApproval;
  readonly title:    string;
  readonly isOn:     boolean;
  readonly hint:     string;
}

const APPROVAL_TITLES: Readonly<Record<BoardPipelineApproval, string>> = Object.freeze({
  tickets: 'Human ticket review',
  merge:   'Human code review',
  spec:    'Human spec review',
  plan:    'Human plan review',
});

const APPROVAL_HINTS: Readonly<Record<BoardPipelineApproval, { readonly on: string; readonly off: string }>> = Object.freeze({
  tickets: { on: 'On: you ready each draft before it builds, in every entity.', off: 'Off: a complete draft builds at once.' },
  merge:   { on: 'On: you accept each reviewed ticket before its Airlock.', off: 'Off: a green review goes straight to the merge train.' },
  spec:    { on: 'On: you approve each spec before its plan is written.', off: 'Off: the spec agent approves the spec when it is ready.' },
  plan:    { on: 'On: you approve each plan before the ticket builds.', off: 'Off: the plan agent approves the plan when it is ready.' },
});

/** An absent `tickets`, `spec` or `plan` approval is on and an absent `merge` approval is off, as `pipeline.json` reads them. */
const APPROVAL_DEFAULTS: Readonly<Record<BoardPipelineApproval, boolean>> = Object.freeze({
  tickets: true, merge: false, spec: true, plan: true
});

/** The Ticket phase's reviews in each route: Human ticket review of one ticket, Human spec and plan review of a spec, then a plan. */
const TICKET_PHASE_APPROVALS: Readonly<Record<BoardTicketWritingRoute, readonly BoardPipelineApproval[]>> = Object.freeze({
  'one-ticket':     ['tickets'],
  'spec-then-plan': ['spec', 'plan'],
});

/** The steps that write a ticket: one ticket's, or the spec's and then the plan's. */
const TICKET_WRITING_NODE_KINDS: ReadonlySet<BoardPipelineNodeKind> = new Set(['ticket-creation', 'spec-writing', 'plan-writing']);

function countText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function approvalViewOf(draft: Pick<BoardPipelineDefinitionDocument, 'approvals'> | null, approval: BoardPipelineApproval): ApprovalView {
  const isOn = draft?.approvals?.[approval] ?? APPROVAL_DEFAULTS[approval];
  return {
    approval, title: APPROVAL_TITLES[approval], isOn, hint: isOn ? APPROVAL_HINTS[approval].on : APPROVAL_HINTS[approval].off
  };
}

/** The Ticket phase's switches in the route the draft writes a ticket by. */
function ticketPhaseApprovalViewsOf(draft: Pick<BoardPipelineDefinitionDocument, 'approvals' | 'ticketWriting'> | null): ApprovalView[] {
  return TICKET_PHASE_APPROVALS[draft?.ticketWriting ?? 'one-ticket'].map((approval) => approvalViewOf(draft, approval));
}

function mergeApprovalViewOf(draft: Pick<BoardPipelineDefinitionDocument, 'approvals'> | null): ApprovalView {
  return approvalViewOf(draft, 'merge');
}

/** The flow's steps that write a ticket, in its order. */
function ticketWritingNodesOf(nodes: readonly BoardFlowNodeDocument[]): BoardFlowNodeDocument[] {
  return nodes.filter((node) => TICKET_WRITING_NODE_KINDS.has(node.nodeKind));
}

function approvalEditOf(view: ApprovalView): BoardDraftEditDocument {
  return { target: 'approval', approval: view.approval, value: !view.isOn };
}

/** "Over 750 lines" while the merge train re-reviews a large conflict fix, else "Off". */
function conflictReReviewTextOf(draft: Pick<BoardPipelineDefinitionDocument, 'airlock'> | null): string {
  const thresholdLines = draft?.airlock?.reReview?.thresholdLines ?? null;
  return thresholdLines === null ? 'Off' : `Over ${thresholdLines} lines`;
}

/** The merge of main into the tree that the Airlock runs, whose dialog sets the merge train's re-review. */
function airlockMergeNodeOf(nodes: readonly BoardFlowNodeDocument[]): BoardFlowNodeDocument | null {
  return nodes.find((node) => node.nodeKind === 'merge-main-into-tree' && node.mergePlacement === 'airlock') ?? null;
}

/** "2 jobs at once". */
function jobsAtOnceTextOf(limit: number): string {
  return `${countText(limit, 'job', 'jobs')} at once`;
}

/** Each entity with a cap of its own, under the board limit: "web: a cap of 1 job". */
function entityCapLinesOf(draft: Pick<BoardPipelineDefinitionDocument, 'entities'> | null): string[] {
  return Object.entries(draft?.entities ?? {}).flatMap(([entityKey, entity]) => (
    entity.concurrency === null ? [] : [`${entityKey}: a cap of ${countText(entity.concurrency, 'job', 'jobs')}`]
  ));
}

/** A limit inside the bounds the forge serves, which differs from the board's own. */
function boardLimitCommandOf(wantedLimit: number, currentLimit: number, bounds: BoardConcurrencyBoundsDocument): BoardCommandDocument | null {
  const sendable = wantedLimit !== currentLimit && Number.isInteger(wantedLimit)
    && wantedLimit >= bounds.lowest && wantedLimit <= bounds.ceiling;
  return sendable ? { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'concurrency-set', limit: wantedLimit } : null;
}

/** "3 entities · 4 gates · 1 entity without gates"; a root kept for a person is not without gates. */
function footerSummaryOf(draft: Pick<BoardPipelineDefinitionDocument, 'entities'> | null): string {
  const entities = Object.values(draft?.entities ?? {});
  const gateCount = entities.reduce((sum, entity) => sum + entity.gates.length, 0);
  const withoutGates = entities.filter((entity) => entity.kind !== 'root' && entity.gates.length === 0).length;
  const parts = [countText(entities.length, 'entity', 'entities'), countText(gateCount, 'gate', 'gates')];
  if (withoutGates > 0) parts.push(`${countText(withoutGates, 'entity', 'entities')} without gates`);
  return parts.join(' · ');
}

/** The entities' keys in the draft's order. */
function entityKeysOf(draft: Pick<BoardPipelineDefinitionDocument, 'entities'> | null): string[] {
  return Object.keys(draft?.entities ?? {});
}

export const ForgeLevelPageModel = Object.freeze({
  ticketPhaseApprovalViewsOf,
  mergeApprovalViewOf,
  ticketWritingNodesOf,
  approvalEditOf,
  conflictReReviewTextOf,
  airlockMergeNodeOf,
  jobsAtOnceTextOf,
  entityCapLinesOf,
  boardLimitCommandOf,
  footerSummaryOf,
  entityKeysOf,
});
