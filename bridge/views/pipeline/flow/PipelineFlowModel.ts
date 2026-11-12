/**
 * The pipeline flow's model, pure: which column each node and + slot of the facts stands in, every node's words, meter, chips, switch and
 * what a double-click on it opens, the edge labels, the toolbar note, the + menus and the edits they send, the zoom steps, and the
 * footer's list of removed steps. The facts carry values only; every word here is worded from them.
 */
import type { GatePhase }                                      from '../../../../src/lib/tracker-model/@types/GatePhase.ts';
import type { Pipeline, PipelineApproval, PipelineDraftField } from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type {
  GateProfileRunFacts,
  PipelineChange,
  PipelineEdgeLabelKind,
  PipelineFlowEdge,
  PipelineFlowFacts,
  PipelineFlowNode,
  PipelineFlowStage,
  PipelineInsertSlot,
  PipelineInsertableStep,
  PipelineNodeKind,
  PipelineNodeMark
} from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { DISPATCH_PROTOCOL }                                  from '../../../../src/shared/constants/DispatchProtocol.ts';
import type { FlowColumn, FlowLayoutEdge }                    from './PipelineFlowLayoutUtil.ts';
import { DEFAULT_FLOW_ZOOM_PERCENT, FLOW_ZOOM_PERCENT_STEPS } from './constants/FlowZoomSteps.ts';

export type FlowNodeVariantName = 'step' | 'group' | 'switch' | 'outcome' | 'target';

export type FlowChange = 'changed' | 'new' | 'removed';

export interface FlowGateChipView {
  readonly gateName: string;
  readonly change:   FlowChange | null;
  /** A proposed gate, not stored yet. */
  readonly proposed: boolean;
}

export interface FlowMeterView {
  readonly model:          string;
  readonly effort:         string;
  readonly level:          number;
  readonly levelCount:     number;
  readonly accessibleName: string;
  readonly derivedNote:    { readonly title: string; readonly text: string } | null;
}

export interface FlowSwitchView {
  readonly accessibleName: string;
  readonly checked:        boolean;
  readonly approval:       PipelineApproval;
}

export type FlowDialog = 'agent-step' | 'review-step' | 'merge-step';

/** What a double-click or Enter on a node opens: a step's dialog, at its re-review section for a re-review node, or a gates tab. */
export type FlowOpenAction =
  | { readonly kind: 'dialog'; readonly dialog: FlowDialog; readonly focusesReReview: boolean }
  | { readonly kind: 'gates-tab'; readonly phase: GatePhase };

export interface FlowNodeView {
  readonly nodeId:      string;
  readonly title:       string;
  readonly variant:     FlowNodeVariantName;
  readonly conditional: boolean;
  /** The inline CONDITIONAL tag's text. */
  readonly tagText:     string | null;
  readonly detail:      string | null;
  /** A muted lead before the gate chips, such as "then the build gates again". */
  readonly chipsLead:   string | null;
  readonly gateChips:   readonly FlowGateChipView[];
  readonly meter:       FlowMeterView | null;
  readonly switchView:  FlowSwitchView | null;
  readonly highlighted: boolean;
  readonly mark:        Exclude<PipelineNodeMark, 'unchanged'> | null;
  readonly openAction:  FlowOpenAction | null;
  readonly openLabel:   string | null;
}

export type FlowSlotPlace = 'after-builder' | 'after-review' | 'merge-train';

export type FlowColumnItem =
  | { readonly kind: 'node'; readonly node: PipelineFlowNode }
  | { readonly kind: 'slot'; readonly slot: PipelineInsertSlot; readonly place: FlowSlotPlace };

export interface FlowColumns {
  readonly spine:      readonly FlowColumnItem[];
  readonly branch:     readonly FlowColumnItem[];
  readonly train:      readonly FlowColumnItem[];
  /** The merge train's frame, absent from a flow with no Airlock node. */
  readonly trainLabel: string | null;
}

/** One draft edit as the `pipeline-draft-edit` command carries it: the field it addresses and its new value, `null` to remove it. */
export interface FlowDraftEdit {
  readonly field: PipelineDraftField;
  readonly value: unknown;
}

export interface DraftEditTarget {
  readonly setupId:       string;
  readonly draftRevision: number;
}

export type FlowInsertAction =
  | { readonly kind: 'edit'; readonly edits: readonly FlowDraftEdit[] }
  | { readonly kind: 'new-gate'; readonly phase: GatePhase };

export interface FlowInsertChoice {
  readonly step:        PipelineInsertableStep;
  readonly label:       string;
  readonly description: string;
  readonly action:      FlowInsertAction;
}

export interface FlowSlotView {
  readonly heading:     string;
  readonly triggerName: string;
  readonly insertStyle: 'solid' | 'dashed';
  readonly choices:     readonly FlowInsertChoice[];
}

const NODE_TITLES: Readonly<Record<PipelineNodeKind, string>> = Object.freeze({
  'ticket-creation':      'Ticket creation',
  'human-ticket-review':  'Human ticket review',
  'builder':              'Builder',
  'gates':                'Gates',
  'review':               'Review',
  're-review':            'Re-review',
  'merge-main-into-tree': 'Merge main into the tree',
  'human-code-review':    'Human code review',
  'ready-for-airlock':    'Ready for the merge train',
  'airlock':              'Merge train · Airlock, one at a time',
  'fast-forward-main':    'main · fast-forward',
});

const NODE_VARIANTS: Readonly<Record<PipelineNodeKind, FlowNodeVariantName>> = Object.freeze({
  'ticket-creation':      'step',
  'human-ticket-review':  'switch',
  'builder':              'step',
  'gates':                'group',
  'review':               'step',
  're-review':            'step',
  'merge-main-into-tree': 'step',
  'human-code-review':    'switch',
  'ready-for-airlock':    'outcome',
  'airlock':              'group',
  'fast-forward-main':    'target',
});

const PHASE_MEANINGS: Readonly<Record<GatePhase, string>> = Object.freeze({
  build:  'build · to be reviewed',
  review: 'review · after the findings are fixed',
  merge:  'merge · before the fast-forward',
});

const EDGE_LABELS: Readonly<Record<PipelineEdgeLabelKind, string>> = Object.freeze({
  'all-green':                     'all green',
  'red-builder-fixes':             'red: builder\nfixes it',
  'conflict-or-red-builder-fixes': 'conflict or red:\nbuilder fixes it',
  'red-reviewer-fixes':            'red: reviewer\nfixes it',
  'red-last-worker-fixes':         'red: last worker\nfixes it',
  'gates-again-after-re-review':   'after a re-review:\ngates again',
});

const CONDITIONAL_TAG_TEXT = 'conditional';

const DERIVED_FROM_BUILDER_NOTE = Object.freeze({
  title: 'Derived from the builder',
  text:  'The builder fixes this merge\'s conflicts and red gates. Change it on the Builder step.',
});

const DERIVED_FROM_LAST_WORKER_NOTE = Object.freeze({
  title: 'Derived from the last worker',
  text:  'This ticket\'s reviewer, or its builder when no review ran. Change it on that step.',
});

const DERIVED_WITHOUT_REVIEW_NOTE = Object.freeze({
  title: 'Derived from the last worker',
  text:  'The builder, since no review runs. Change it on the Builder step.',
});

const SWITCH_HINTS: Readonly<Record<PipelineApproval, Readonly<Record<'on' | 'off', string>>>> = Object.freeze({
  tickets: { on: 'User readies each draft before it builds', off: 'A complete draft builds at once' },
  merge:   { on: 'User reviews and presses Merge; press order sets the train', off: 'Green after review goes straight to the train' },
});

const INSERT_CHOICE_WORDS: Readonly<Record<PipelineInsertableStep, { readonly label: string; readonly description: string }>> = Object.freeze({
  'build-gates':       { label: 'Build gates', description: 'What the builder must pass to be reviewed' },
  'review':            { label: 'Review', description: 'An agent reviews and fixes before the merge, with its own gates' },
  'human-code-review': { label: 'Human code review', description: 'User reviews and presses Merge' },
  'review-gates':      { label: 'Review gates', description: 'What the reviewer must keep green after fixing findings' },
  're-review':         { label: 'Conditional re-review', description: 'Reviews again when the review\'s fixes are over the threshold' },
  'merge-gates':       { label: 'Merge gates', description: 'Run on the merged tree, before the fast-forward' },
  'airlock-re-review': { label: 'Conditional re-review', description: 'Reviews again when a conflict fix is over the threshold' },
});

const SLOT_WORDS: Readonly<Record<FlowSlotPlace, { readonly heading: string; readonly triggerName: string }>> = Object.freeze({
  'after-builder': { heading: 'Add after the Builder', triggerName: 'Add a step after the Builder' },
  'after-review':  { heading: 'Add after the review', triggerName: 'Add a step after the review' },
  'merge-train':   { heading: 'Add in the merge train', triggerName: 'Add a step before the fast-forward' },
});

/** The review a + adds: named as the default review step, with no re-review until one is added. */
const DEFAULT_REVIEW_NAME = 'review';

const ZOOM_PERCENT_STEPS = FLOW_ZOOM_PERCENT_STEPS;

const DEFAULT_ZOOM_PERCENT = DEFAULT_FLOW_ZOOM_PERCENT;

/** The kinds that open the right column: what follows the left spine, after the merge before review. */
function opensTheBranch(node: PipelineFlowNode): boolean {
  return node.nodeKind === 'review'
    || node.nodeKind === 'human-code-review'
    || node.nodeKind === 'ready-for-airlock'
    || (node.nodeKind === 'merge-main-into-tree' && node.mergePlacement === 'before-human-code-review');
}

function columnsOfNodes(nodes: readonly PipelineFlowNode[]): Map<string, FlowColumn> {
  const columnByNodeId = new Map<string, FlowColumn>();
  let column: FlowColumn = 'spine';
  nodes.forEach((node) => {
    if (node.nodeKind === 'airlock') column = 'train';
    else if (column === 'spine' && opensTheBranch(node)) column = 'branch';
    columnByNodeId.set(node.nodeId, column);
  });
  return columnByNodeId;
}

function slotPlaceOf(after: PipelineFlowNode | undefined, column: FlowColumn | undefined): FlowSlotPlace {
  if (column === 'train') return 'merge-train';
  if (after?.nodeKind === 'builder' || (after?.nodeKind === 'gates' && after.phase === 'build')) return 'after-builder';
  return 'after-review';
}

/** Each node in its column in the facts' order, the Airlock node itself left out as the train's frame, and each + right after its node. */
function columnsOf(flow: Pick<PipelineFlowFacts, 'nodes' | 'insertSlots'>): FlowColumns {
  const columnByNodeId = columnsOfNodes(flow.nodes);
  const items: Record<FlowColumn, FlowColumnItem[]> = { spine: [], branch: [], train: [] };
  flow.nodes.forEach((node) => {
    const column = columnByNodeId.get(node.nodeId) ?? 'spine';
    if (node.nodeKind !== 'airlock') items[column].push({ kind: 'node', node });
    flow.insertSlots
      .filter((slot) => slot.after === node.nodeId)
      .forEach((slot) => items[column].push({ kind: 'slot', slot, place: slotPlaceOf(node, column) }));
  });
  const airlock = flow.nodes.find((node) => node.nodeKind === 'airlock');
  return { ...items, trainLabel: airlock === undefined ? null : NODE_TITLES.airlock };
}

function columnOfNode(flow: Pick<PipelineFlowFacts, 'nodes'>, nodeId: string): FlowColumn {
  return columnsOfNodes(flow.nodes).get(nodeId) ?? 'spine';
}

function instructionFilesTextOf(node: PipelineFlowNode): string {
  const fileNames = node.instructionEntries.map((entry) => entry.fileName);
  return fileNames.length === 0 ? 'built-in brief' : fileNames.join(' · ');
}

function mergeDetailOf(node: PipelineFlowNode): string {
  if (node.mergePlacement === 'before-review') return 'conflicts and red gates: the builder fixes them';
  if (node.derivedFrom === 'builder') return 'conflicts: the builder fixes them';
  return node.mergePlacement === 'before-human-code-review' ? 'conflicts: the reviewer fixes them' : 'conflicts: the last worker fixes them';
}

function reReviewDetailOf(node: PipelineFlowNode): string {
  const subject = node.role === 'reReviewer' ? 'the review\'s fixes are' : 'the conflict fix is';
  return `only when ${subject} over ${node.thresholdLines ?? DISPATCH_PROTOCOL.REWORK_ROUND_THRESHOLD_LINES} lines`;
}

/** A gates node right after the merge before User's code review runs its phase again on the merged tree. */
function gatesDetailOf(node: PipelineFlowNode, runsAgain: boolean): string {
  if (node.phase === null) return '';
  return runsAgain ? `${node.phase}, again · must be green` : PHASE_MEANINGS[node.phase];
}

function switchApprovalOf(node: PipelineFlowNode): PipelineApproval | null {
  if (node.nodeKind === 'human-ticket-review') return 'tickets';
  if (node.nodeKind === 'human-code-review') return 'merge';
  return null;
}

function detailOf(node: PipelineFlowNode, gatesRunAgain: boolean): string | null {
  const approval = switchApprovalOf(node);
  if (approval !== null) return SWITCH_HINTS[approval][node.switchState ?? 'off'];
  switch (node.nodeKind) {
    case 'ticket-creation':
      return `${instructionFilesTextOf(node)} · drafts with a Brief`;
    case 'builder':
    case 'review':
      return instructionFilesTextOf(node);
    case 're-review':
      return reReviewDetailOf(node);
    case 'merge-main-into-tree':
      return mergeDetailOf(node);
    case 'gates':
      return gatesDetailOf(node, gatesRunAgain);
    case 'ready-for-airlock':
      return 'joins the Airlock queue by priority';
    default:
      return null;
  }
}

function derivedNoteOf(node: PipelineFlowNode): FlowMeterView['derivedNote'] {
  if (node.nodeKind !== 'merge-main-into-tree') return null;
  if (node.mergePlacement === 'before-review') return DERIVED_FROM_BUILDER_NOTE;
  return node.derivedFrom === 'builder' ? DERIVED_WITHOUT_REVIEW_NOTE : DERIVED_FROM_LAST_WORKER_NOTE;
}

/** An effort's level is its place in the choices plus one; an effort outside them fills no bar. */
function meterOf(node: PipelineFlowNode, efforts: readonly string[]): FlowMeterView | null {
  if (node.settings === null) return null;
  const derivedNote = derivedNoteOf(node);
  const { model, effort } = node.settings;
  return {
    model,
    effort,
    level:          efforts.indexOf(effort) + 1,
    levelCount:     efforts.length,
    accessibleName: `${NODE_TITLES[node.nodeKind]}: ${derivedNote === null ? '' : 'derived, '}${model}, effort ${effort}`,
    derivedNote,
  };
}

function openActionOf(node: PipelineFlowNode): FlowOpenAction | null {
  switch (node.dialogTarget) {
    case 'agent-step':
    case 'review-step':
    case 'merge-step':
      return { kind: 'dialog', dialog: node.dialogTarget, focusesReReview: false };
    case 'review-step-re-review':
      return { kind: 'dialog', dialog: 'review-step', focusesReReview: true };
    case 'merge-step-re-review':
      return { kind: 'dialog', dialog: 'merge-step', focusesReReview: true };
    case 'gates-tab':
      return node.phase === null ? null : { kind: 'gates-tab', phase: node.phase };
    case null:
      return null;
  }
}

function openLabelOf(node: PipelineFlowNode, openAction: FlowOpenAction | null): string | null {
  if (openAction === null) return null;
  if (openAction.kind === 'gates-tab') return `Show the ${openAction.phase} gates`;
  return `Open the ${NODE_TITLES[node.nodeKind]} step`;
}

function changeOfMark(mark: PipelineNodeMark): FlowChange | null {
  return mark === 'changed' || mark === 'new' || mark === 'removed' ? mark : null;
}

function chipsLeadOf(node: PipelineFlowNode): string | null {
  if (node.mergePlacement !== 'before-review') return null;
  return node.gateChips.length === 0 ? 'no gates run after it' : 'then the build gates again';
}

/** `gatesRunAgain` marks the gates node that follows the merge before User's code review. */
function nodeViewOf(node: PipelineFlowNode, efforts: readonly string[], gatesRunAgain = false): FlowNodeView {
  const openAction = openActionOf(node);
  const approval = switchApprovalOf(node);
  const title = NODE_TITLES[node.nodeKind];
  return {
    nodeId:      node.nodeId,
    title,
    variant:     NODE_VARIANTS[node.nodeKind],
    conditional: node.conditional,
    tagText:     node.conditional ? CONDITIONAL_TAG_TEXT : null,
    detail:      detailOf(node, gatesRunAgain),
    chipsLead:   chipsLeadOf(node),
    gateChips:   node.gateChips.map((chip) => ({ gateName: chip.gateName, change: changeOfMark(chip.mark), proposed: chip.mark === 'proposed' })),
    meter:       meterOf(node, efforts),
    switchView:  approval === null ? null : { accessibleName: title, checked: node.switchState === 'on', approval },
    highlighted: node.nodeKind === 'human-code-review' && node.switchState === 'on',
    mark:        node.mark === 'unchanged' ? null : node.mark,
    openAction,
    openLabel:   openLabelOf(node, openAction),
  };
}

/** Every node's view in the facts' order; the gates node after the merge before User's code review is worded as its phase again. */
function nodeViewsOf(nodes: readonly PipelineFlowNode[], efforts: readonly string[]): FlowNodeView[] {
  let afterHumanCodeReviewMerge = false;
  return nodes.map((node) => {
    if (node.nodeKind === 'merge-main-into-tree') afterHumanCodeReviewMerge = node.mergePlacement === 'before-human-code-review';
    const view = nodeViewOf(node, efforts, node.nodeKind === 'gates' && afterHumanCodeReviewMerge);
    if (node.nodeKind === 'gates' || node.nodeKind === 'human-code-review') afterHumanCodeReviewMerge = false;
    return view;
  });
}

function layoutEdgesOf(edges: readonly PipelineFlowEdge[]): FlowLayoutEdge[] {
  return edges.map((edge) => ({
    edgeId:    edge.edgeId,
    from:      edge.from,
    to:        edge.to,
    tone:      edge.tone,
    active:    edge.active,
    labelText: edge.labelKind === null ? null : EDGE_LABELS[edge.labelKind],
  }));
}

function countText(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/** Proposal: "Proposed, not stored", and each profile User started while it runs; live: "Applied pipeline · live"; editing: the change count. */
function toolbarNoteOf(stage: PipelineFlowStage, changeCount: number, profileRuns: readonly GateProfileRunFacts[]): string {
  if (stage === 'live') return 'Applied pipeline · live';
  if (stage === 'editing') return `Editing · ${countText(changeCount, 'change')}, not applied`;
  const running = profileRuns.filter((run) => run.state === 'queued' || run.state === 'running');
  const profiling = running.map((run) => `${run.gateName} · ${run.phase}`).join(', ');
  return running.length === 0 ? 'Proposed, not stored' : `Proposed, not stored · profiling ${profiling}`;
}

function insertActionOf(step: PipelineInsertableStep, draft: Pipeline | null): FlowInsertAction {
  const reReview = { thresholdLines: DISPATCH_PROTOCOL.REWORK_ROUND_THRESHOLD_LINES };
  switch (step) {
    case 'build-gates':
      return { kind: 'new-gate', phase: 'build' };
    case 'review-gates':
      return { kind: 'new-gate', phase: 'review' };
    case 'merge-gates':
      return { kind: 'new-gate', phase: 'merge' };
    case 'review':
      return { kind: 'edit', edits: [{ field: 'review', value: { name: DEFAULT_REVIEW_NAME } }] };
    case 'human-code-review':
      return { kind: 'edit', edits: [{ field: 'approval:merge', value: true }] };
    case 're-review':
      return { kind: 'edit', edits: [{ field: 'review', value: { name: draft?.review?.name ?? DEFAULT_REVIEW_NAME, reReview } }] };
    case 'airlock-re-review':
      return { kind: 'edit', edits: [{ field: 'airlock', value: { ...draft?.airlock, reReview } }] };
  }
}

function slotViewOf(slot: PipelineInsertSlot, place: FlowSlotPlace, draft: Pipeline | null): FlowSlotView {
  return {
    ...SLOT_WORDS[place],
    insertStyle: place === 'merge-train' ? 'dashed' : 'solid',
    choices:     slot.offeredSteps.map((step) => ({ step, ...INSERT_CHOICE_WORDS[step], action: insertActionOf(step, draft) })),
  };
}

function switchEditOf(switchView: FlowSwitchView): FlowDraftEdit {
  return { field: `approval:${switchView.approval}`, value: !switchView.checked };
}

function draftEditCommandOf(target: DraftEditTarget, edits: readonly FlowDraftEdit[]) {
  return {
    kind: 'pipeline-draft-edit', setupId: target.setupId, draftRevision: target.draftRevision, edits
  };
}

function removedStepWordOf(field: PipelineDraftField): string {
  if (field.startsWith('gate:')) return `the ${field.slice('gate:'.length)} gate`;
  if (field.startsWith('prepare:')) return `the ${field.slice('prepare:'.length)} prepare step`;
  if (field === 'review') return 'Review';
  if (field === 'airlock') return 'the merge train re-review';
  if (field === 'constitution') return 'the constitution';
  return field;
}

function listTextOf(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`;
}

/** The footer's "<removed steps> removed" from the change list's removed rows; null when the draft removes nothing. */
function removedStepsTextOf(changeList: readonly PipelineChange[]): string | null {
  const words = changeList.filter((change) => change.changeKind === 'removed').map((change) => removedStepWordOf(change.field));
  if (words.length === 0) return null;
  const text = `${listTextOf(words)} removed`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function zoomTextOf(zoomPercent: number): string {
  return `${zoomPercent}%`;
}

/** The next step in or out from the current zoom; a zoom between steps moves to the nearest step beyond it. */
function zoomedPercentOf(zoomPercent: number, direction: 'in' | 'out'): number {
  if (direction === 'in') return ZOOM_PERCENT_STEPS.find((step) => step > zoomPercent) ?? zoomPercent;
  return [...ZOOM_PERCENT_STEPS].reverse().find((step) => step < zoomPercent) ?? zoomPercent;
}

/** The largest step at which the content fits the viewport both ways; an unmeasured viewport or content keeps 100%. */
function fitPercentOf(viewport: { readonly width: number; readonly height: number }, content: { readonly width: number; readonly height: number }): number {
  if (viewport.width <= 0 || viewport.height <= 0 || content.width <= 0 || content.height <= 0) return DEFAULT_ZOOM_PERCENT;
  const fitting = Math.min(viewport.width / content.width, viewport.height / content.height) * 100;
  return [...ZOOM_PERCENT_STEPS].reverse().find((step) => step <= fitting) ?? ZOOM_PERCENT_STEPS[0] ?? DEFAULT_ZOOM_PERCENT;
}

/** A stored zoom that is no step reads as 100%. */
function storedZoomPercentOf(storedText: string | null): number {
  const stored = Number(storedText);
  return ZOOM_PERCENT_STEPS.includes(stored) ? stored : DEFAULT_ZOOM_PERCENT;
}

function canZoom(zoomPercent: number, direction: 'in' | 'out'): boolean {
  return zoomedPercentOf(zoomPercent, direction) !== zoomPercent;
}

export const PipelineFlowModel = Object.freeze({
  DEFAULT_ZOOM_PERCENT,
  canZoom,
  columnOfNode,
  columnsOf,
  draftEditCommandOf,
  fitPercentOf,
  layoutEdgesOf,
  nodeViewOf,
  nodeViewsOf,
  openActionOf,
  removedStepsTextOf,
  slotViewOf,
  storedZoomPercentOf,
  switchEditOf,
  toolbarNoteOf,
  zoomTextOf,
  zoomedPercentOf,
});
