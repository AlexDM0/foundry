/**
 * The forge level's page, pure: the two approvals every entity shares with the hint of each state and the edit a switch sends, the merge
 * train's conflict re-review, the board limit and the entity caps under it, worded in jobs, and the footer's count of the entities and their
 * gates. The board limit is the board's setting, sent by its own control at once; every other setting here is a draft field.
 */
import type { EntityKey, Pipeline, PipelineApproval }                        from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineFlowNode }                                             from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { CONCURRENCY_LIMIT_CEILING_AGENTS, LOWEST_CONCURRENCY_LIMIT_AGENTS } from '../../../../src/lib/tracker-model/constants/ConcurrencyLimits.ts';
import type { ControlCommandBody }                                           from '../../../api/CommandClient.ts';
import type { FlowDraftEdit }                                                from '../flow/PipelineFlowModel.ts';

export interface ApprovalView {
  readonly approval: PipelineApproval;
  readonly title:    string;
  readonly isOn:     boolean;
  readonly hint:     string;
}

const APPROVAL_TITLES: Readonly<Record<PipelineApproval, string>> = Object.freeze({
  tickets: 'Human ticket review',
  merge:   'Human code review',
});

const APPROVAL_HINTS: Readonly<Record<PipelineApproval, { readonly on: string; readonly off: string }>> = Object.freeze({
  tickets: { on: 'On: you ready each draft before it builds, in every entity.', off: 'Off: a complete draft builds at once.' },
  merge:   { on: 'On: you accept each reviewed ticket before its Airlock.', off: 'Off: a green review goes straight to the merge train.' },
});

/** An absent `tickets` approval is on and an absent `merge` approval is off, as `pipeline.json` reads them. */
const APPROVAL_DEFAULTS: Readonly<Record<PipelineApproval, boolean>> = Object.freeze({ tickets: true, merge: false });

const APPROVALS: readonly PipelineApproval[] = Object.freeze(['tickets', 'merge']);

function countText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function approvalViewsOf(draft: Pick<Pipeline, 'approvals'> | null): ApprovalView[] {
  return APPROVALS.map((approval) => {
    const isOn = draft?.approvals?.[approval] ?? APPROVAL_DEFAULTS[approval];
    return {
      approval, title: APPROVAL_TITLES[approval], isOn, hint: isOn ? APPROVAL_HINTS[approval].on : APPROVAL_HINTS[approval].off
    };
  });
}

function approvalEditOf(view: ApprovalView): FlowDraftEdit {
  return { field: `approval:${view.approval}`, value: !view.isOn };
}

/** "Over 750 lines" while the merge train re-reviews a large conflict fix, else "Off". */
function conflictReReviewTextOf(draft: Pick<Pipeline, 'airlock'> | null): string {
  const thresholdLines = draft?.airlock?.reReview?.thresholdLines;
  return thresholdLines === undefined ? 'Off' : `Over ${thresholdLines} lines`;
}

/** The merge of main into the tree that the Airlock runs, whose dialog sets the merge train's re-review. */
function airlockMergeNodeOf(nodes: readonly PipelineFlowNode[]): PipelineFlowNode | null {
  return nodes.find((node) => node.nodeKind === 'merge-main-into-tree' && node.mergePlacement === 'airlock') ?? null;
}

/** "2 jobs at once". */
function jobsAtOnceTextOf(limit: number): string {
  return `${countText(limit, 'job', 'jobs')} at once`;
}

/** Each entity with a cap of its own, under the board limit: "web: a cap of 1 job". */
function entityCapLinesOf(draft: Pick<Pipeline, 'entities'> | null): string[] {
  return Object.entries(draft?.entities ?? {}).flatMap(([entityKey, entity]) => (
    entity.concurrency === undefined ? [] : [`${entityKey}: a cap of ${countText(entity.concurrency, 'job', 'jobs')}`]
  ));
}

function boardLimitCommandOf(wantedLimit: number, currentLimit: number): ControlCommandBody | null {
  const sendable = wantedLimit !== currentLimit && Number.isInteger(wantedLimit)
    && wantedLimit >= LOWEST_CONCURRENCY_LIMIT_AGENTS && wantedLimit <= CONCURRENCY_LIMIT_CEILING_AGENTS;
  return sendable ? { kind: 'concurrency-set', limit: wantedLimit } : null;
}

/** "3 entities · 4 gates · 1 entity without gates"; a root kept for a person is not without gates. */
function footerSummaryOf(draft: Pick<Pipeline, 'entities'> | null): string {
  const entities = Object.values(draft?.entities ?? {});
  const gateCount = entities.reduce((sum, entity) => sum + entity.gates.length, 0);
  const withoutGates = entities.filter((entity) => entity.kind !== 'root' && entity.gates.length === 0).length;
  const parts = [countText(entities.length, 'entity', 'entities'), countText(gateCount, 'gate', 'gates')];
  if (withoutGates > 0) parts.push(`${countText(withoutGates, 'entity', 'entities')} without gates`);
  return parts.join(' · ');
}

/** The entities' keys in the draft's order. */
function entityKeysOf(draft: Pick<Pipeline, 'entities'> | null): EntityKey[] {
  return Object.keys(draft?.entities ?? {});
}

export const ForgeLevelPageModel = Object.freeze({
  LOWEST_BOARD_LIMIT:  LOWEST_CONCURRENCY_LIMIT_AGENTS,
  HIGHEST_BOARD_LIMIT: CONCURRENCY_LIMIT_CEILING_AGENTS,
  approvalViewsOf,
  approvalEditOf,
  conflictReReviewTextOf,
  airlockMergeNodeOf,
  jobsAtOnceTextOf,
  entityCapLinesOf,
  boardLimitCommandOf,
  footerSummaryOf,
  entityKeysOf,
});
