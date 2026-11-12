/**
 * The live flow's activity, pure: what stands on each node now (a ticket, or a filing draft being written) as a chip linking to its
 * detail, the "Now" rows of the activity aside in the facts' order, each with a meter only on a step an agent runs, and the "Earlier"
 * lines worded from the newest pipeline records. A record kind with no line here is left out of the list.
 */
import type { LogRecord }                                             from '../../../../src/lib/tracker-model/@types/LogRecord.ts';
import type { PipelineFlowFacts, PipelineFlowNode, PipelineOccupant } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { PipelineSetupMode }                                     from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { DetailRoute, type DetailItem }                               from '../../../shell/DetailRoute.ts';
import { HashRouter }                                                 from '../../../shell/HashRouter.ts';
import { ElapsedTimeUtil }                                            from '../../../utils/ElapsedTimeUtil.ts';
import { TimeUtil, type TimestampSlices }                             from '../../../utils/TimeUtil.ts';
import { PipelineFlowModel, type FlowMeterView }                      from '../flow/PipelineFlowModel.ts';

/** The board tab a chip or a row opens the detail panel over. */
const DETAIL_TAB = 'kanban';

export interface OccupantChipView {
  readonly key:   string;
  readonly text:  string;
  readonly href:  string;
  /** The display state whose colours the chip takes. */
  readonly state: 'in-progress' | 'draft';
}

export interface ActivityRowView {
  readonly key:      string;
  readonly href:     string;
  /** `step` for a step an agent runs, `check` for any other. */
  readonly status:   'step' | 'check';
  readonly idText:   string;
  readonly stepText: string;
  readonly meter:    FlowMeterView | null;
  readonly elapsed:  string;
}

export interface HistoryLineView {
  readonly key:   string;
  /** Null when the page carries no stamp slices. */
  readonly clock: string | null;
  readonly text:  string;
}

/** What a stamp is cut by, and the viewer's day it is compared with. */
export interface StampFormat {
  readonly todayCalendarDate: string;
  readonly slices:            TimestampSlices;
}

const APPROVAL_WORDS: Readonly<Record<string, string>> = Object.freeze({
  tickets: 'Human ticket review',
  merge:   'Human code review',
});

const SETUP_OPENED_TEXTS: Readonly<Record<PipelineSetupMode, string>> = Object.freeze({
  setup:  'Pipeline setup started',
  update: 'Pipeline update started',
  advise: 'Pipeline agent asked for advice',
});

function detailItemOf(occupant: PipelineOccupant): DetailItem {
  return occupant.occupantKind === 'draft'
    ? { form: 'draft', draftId: occupant.occupantId }
    : { form: 'ticket', ticketId: occupant.occupantId };
}

/** The detail panel of the ticket or the filing draft, over Kanban. */
function occupantHrefOf(occupant: PipelineOccupant): string {
  return HashRouter.fragmentOf({ tab: DETAIL_TAB, item: DetailRoute.itemTextOf(detailItemOf(occupant)) });
}

function isMergeBeforeReview(node: PipelineFlowNode | undefined): boolean {
  return node?.nodeKind === 'merge-main-into-tree' && node.mergePlacement === 'before-review';
}

/** "D3 drafting" for a draft; "15 · catching up" for a review catching up with main before it reviews; the id alone otherwise. */
function occupantChipTextOf(occupant: PipelineOccupant, node: PipelineFlowNode | undefined): string {
  if (occupant.occupantKind === 'draft') return `${occupant.occupantId} drafting`;
  return isMergeBeforeReview(node) ? `${occupant.occupantId} · catching up` : occupant.occupantId;
}

/** The chips of the occupants standing on one node, in the facts' order. */
function occupantChipsOf(flow: Pick<PipelineFlowFacts, 'nodes' | 'occupants'>, nodeId: string): OccupantChipView[] {
  const node = flow.nodes.find((candidate) => candidate.nodeId === nodeId);
  return flow.occupants.filter((occupant) => occupant.nodeId === nodeId).map((occupant) => ({
    key:   `${occupant.occupantKind}-${occupant.occupantId}`,
    text:  occupantChipTextOf(occupant, node),
    href:  occupantHrefOf(occupant),
    state: occupant.occupantKind === 'draft' ? 'draft' : 'in-progress',
  }));
}

/** The node's title, a gates node's with its phase ("Gates · build"). */
function stepTextOf(node: PipelineFlowNode, efforts: readonly string[]): string {
  const { title } = PipelineFlowModel.nodeViewOf(node, efforts);
  return node.phase === null ? title : `${title} · ${node.phase}`;
}

/** One row per occupant, in the facts' order; an occupant on a node the flow does not draw is left out. */
function activityRowsOf(flow: Pick<PipelineFlowFacts, 'nodes' | 'occupants'>, efforts: readonly string[], now: Date): ActivityRowView[] {
  return flow.occupants.flatMap((occupant) => {
    const node = flow.nodes.find((candidate) => candidate.nodeId === occupant.nodeId);
    if (node === undefined) return [];
    const runByAgent = node.role !== null;
    return [{
      key:      `${occupant.occupantKind}-${occupant.occupantId}`,
      href:     occupantHrefOf(occupant),
      status:   runByAgent ? 'step' : 'check',
      idText:   occupant.occupantId,
      stepText: stepTextOf(node, efforts),
      meter:    runByAgent ? PipelineFlowModel.nodeViewOf(node, efforts).meter : null,
      elapsed:  ElapsedTimeUtil.ageSinceText(occupant.since, now) ?? '',
    }];
  });
}

/** "Now · 1 item", "Now · 6 items". */
function nowHeadingOf(rowCount: number): string {
  return `Now · ${rowCount} ${rowCount === 1 ? 'item' : 'items'}`;
}

function historyTextOf(record: LogRecord): string | null {
  switch (record.kind) {
    case 'pipeline-gate-added':
      return `Gate ${record.fields.name} set to ${record.fields.run}`;
    case 'pipeline-gate-removed':
      return `Gate ${record.fields.name} removed`;
    case 'pipeline-gates-none':
      return 'No gates, on purpose';
    case 'pipeline-gates-ordered':
      return `Gates of the ${record.fields.phase} phase ordered: ${record.fields.names.join(', ')}`;
    case 'pipeline-prepare-step-set':
      return `Prepare step ${record.fields.name} set to ${record.fields.run}`;
    case 'pipeline-approval-set': {
      const { approval, state } = record.fields;
      return `${Object.hasOwn(APPROVAL_WORDS, approval) ? APPROVAL_WORDS[approval] : `Approval ${approval}`} turned ${state}`;
    }
    case 'pipeline-setup-opened':
      return SETUP_OPENED_TEXTS[record.fields.mode];
    case 'pipeline-draft-discarded':
      return 'Pipeline changes discarded';
    case 'pipeline-setup-discarded':
      return 'Pipeline setup discarded';
    case 'overseer-set':
      return record.fields.state === 'running' ? 'Board resumed' : 'Board paused';
    default:
      return null;
  }
}

/** The records in the facts' order, newest first; the clock is the stamp's short form when the page carries the slices. */
function historyLinesOf(records: readonly LogRecord[], stampFormat: StampFormat | null): HistoryLineView[] {
  return records.flatMap((record, i) => {
    const text = historyTextOf(record);
    if (text === null) return [];
    const clock = stampFormat === null ? null : TimeUtil.shortStampText(record.at, stampFormat.todayCalendarDate, stampFormat.slices);
    return [{ key: `${String(i)}-${record.kind}`, clock, text }];
  });
}

export const FlowActivityPanelModel = Object.freeze({
  occupantChipsOf,
  activityRowsOf,
  nowHeadingOf,
  historyLinesOf,
});
