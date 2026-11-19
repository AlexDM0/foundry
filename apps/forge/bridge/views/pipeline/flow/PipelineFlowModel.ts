/**
 * The pipeline flow's step model, pure: every node's card words (its kind, title, sentence and brief files), its meter, gate pills, switch,
 * change marker and what a double-click on it opens, the add-step menus and the edits they send, and the footer's list of removed steps.
 * The facts carry values only; every word here is worded from them.
 */
import type { GatePhase }                  from '../../../../src/lib/tracker-model/@types/GatePhase.ts';
import type { Pipeline, PipelineApproval } from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type {
  GateCacheMarkFacts,
  PipelineChange,
  PipelineEdgeLabelKind,
  PipelineFlowFacts,
  PipelineFlowNode,
  PipelineInsertSlot,
  PipelineInsertableStep,
  PipelineNodeKind,
  PipelineNodeMark
} from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { PipelineDraftEdit, PipelineDraftField } from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { DISPATCH_PROTOCOL }       from '../../../../src/shared/constants/DispatchProtocol.ts';
import { GateCacheMarkModel }      from '../gates/GateCacheMarkModel.ts';

/** What a step card names itself as: an agent's step, User's step, a phase's gates or a step that runs by itself. */
export type StepKind = 'agent' | 'you' | 'gates' | 'automatic';

export type FlowChange = 'changed' | 'new' | 'removed';

export interface FlowGatePillView {
  readonly gateName: string;
  /** The gate's name, with the cache mark of its newest run in the step's phase, a job's or a profile's, beside it ("lint · cached"). */
  readonly text:     string;
  readonly change:   FlowChange | null;
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

/** What a double-click or Enter on a node opens: a step's dialog, at its re-review section for a re-review node, or a phase's gates. */
export type FlowOpenAction =
  | { readonly kind: 'dialog'; readonly dialog: FlowDialog; readonly focusesReReview: boolean }
  | { readonly kind: 'gates-tab'; readonly phase: GatePhase };

/**
 * What the flow asks its holder to open: a node's dialog or gates table, the open question a node waits on, or the Gate dialog for a new
 * gate in a phase.
 */
export type FlowOpenRequest =
  | { readonly kind: 'node'; readonly nodeId: string; readonly action: FlowOpenAction }
  | { readonly kind: 'question'; readonly nodeId: string }
  | { readonly kind: 'new-gate'; readonly phase: GatePhase };

export interface FlowNodeView {
  readonly nodeId:      string;
  /** The node's name in the dialogs and the activity list ("Gates"). */
  readonly title:       string;
  /** The card's title: a gates step is named for its phase ("Build gates"). */
  readonly cardTitle:   string;
  readonly kind:        StepKind;
  readonly sentence:    string;
  readonly conditional: boolean;
  /** The agent's instruction files, " · " between them; null on a step no agent runs. */
  readonly briefText:   string | null;
  readonly gatePills:   readonly FlowGatePillView[];
  readonly meter:       FlowMeterView | null;
  readonly switchView:  FlowSwitchView | null;
  /** Human code review while on: the step that waits on User. */
  readonly highlighted: boolean;
  readonly change:      FlowChange | null;
  /** The editing marker's words ("Changed", "Off → on", "2 changes"); null with no change. */
  readonly changeText:  string | null;
  readonly openAction:  FlowOpenAction | null;
  readonly openLabel:   string | null;
}

export type FlowSlotPlace = 'after-builder' | 'after-review' | 'merge-train';

export interface DraftEditTarget {
  readonly setupId:       string;
  readonly draftRevision: number;
}

export type FlowInsertAction =
  | { readonly kind: 'edit'; readonly edits: readonly PipelineDraftEdit[] }
  | { readonly kind: 'new-gate'; readonly phase: GatePhase };

export interface FlowInsertChoice {
  readonly step:        PipelineInsertableStep;
  readonly label:       string;
  readonly description: string;
  readonly action:      FlowInsertAction;
}

export interface FlowSlotView {
  readonly heading: string;
  readonly choices: readonly FlowInsertChoice[];
}

/** Who fixes a red gate of a gates step, read from its way back; `none` for gates that only run again on a merged tree. */
type GatesFixer = 'the builder' | 'the reviewer' | 'the last worker' | 'none';

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

const GATES_TITLES: Readonly<Record<GatePhase, string>> = Object.freeze({ build: 'Build gates', review: 'Review gates', merge: 'Merge gates' });

const FIXER_OF_EDGE_LABEL: Readonly<Partial<Record<PipelineEdgeLabelKind, GatesFixer>>> = Object.freeze({
  'red-builder-fixes':     'the builder',
  'red-reviewer-fixes':    'the reviewer',
  'red-last-worker-fixes': 'the last worker',
});

const CHANGE_WORDS: Readonly<Record<FlowChange, string>> = Object.freeze({ changed: 'Changed', new: 'New', removed: 'Removed' });

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

const SWITCH_SENTENCES: Readonly<Record<PipelineApproval, Readonly<Record<'on' | 'off', string>>>> = Object.freeze({
  tickets: { on: 'You ready each draft before it builds.', off: 'Off: a complete draft builds at once.' },
  merge:   { on: 'You review the change and press Merge. Your presses set the order.', off: 'Off: a green review goes straight to the merge train.' },
});

const INSERT_CHOICE_WORDS: Readonly<Record<PipelineInsertableStep, { readonly label: string; readonly description: string }>> = Object.freeze({
  'build-gates':       { label: 'Build gates', description: 'What the builder must pass to be reviewed' },
  'review':            { label: 'Review', description: 'An agent reviews and fixes before the merge, with its own gates' },
  'human-code-review': { label: 'Human code review', description: 'You review and press Merge' },
  'review-gates':      { label: 'Review gates', description: 'What the reviewer must keep green after fixing findings' },
  're-review':         { label: 'Conditional re-review', description: 'Reviews again when the review\'s fixes are over the threshold' },
  'merge-gates':       { label: 'Merge gates', description: 'Run on the latest main merged in' },
  'airlock-re-review': { label: 'Conditional re-review', description: 'Runs only when a conflict fix is large' },
});

const SLOT_HEADINGS: Readonly<Record<FlowSlotPlace, string>> = Object.freeze({
  'after-builder': 'Add after the Builder',
  'after-review':  'Add after the review',
  'merge-train':   'Add before the fast-forward',
});

/** The review an add card adds: named as the default review step, with no re-review until one is added. */
const DEFAULT_REVIEW_NAME = 'review';

function countText(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function kindOf(node: PipelineFlowNode): StepKind {
  if (node.nodeKind === 'gates') return 'gates';
  if (node.nodeKind === 'human-ticket-review' || node.nodeKind === 'human-code-review') return 'you';
  return node.role === null ? 'automatic' : 'agent';
}

function instructionFilesTextOf(node: PipelineFlowNode): string {
  const fileNames = node.instructionEntries.map((entry) => entry.fileName);
  return fileNames.length === 0 ? 'built-in brief' : fileNames.join(' · ');
}

function switchApprovalOf(node: PipelineFlowNode): PipelineApproval | null {
  if (node.nodeKind === 'human-ticket-review') return 'tickets';
  if (node.nodeKind === 'human-code-review') return 'merge';
  return null;
}

function mergeSentenceOf(node: PipelineFlowNode): string {
  if (node.mergePlacement === 'before-review') return 'Brings the branch up to date before review. The builder fixes a conflict or a red gate.';
  const fixer = node.derivedFrom === 'builder' ? 'The builder fixes any conflict, since no review runs.' : 'The last worker fixes any conflict.';
  if (node.mergePlacement === 'before-human-code-review') return `Comes with human code review. ${fixer}`;
  return `Brings the branch up to date. ${fixer}`;
}

function reReviewSentenceOf(node: PipelineFlowNode): string {
  const subject = node.role === 'reReviewer' ? 'the review\'s fixes are' : 'the conflict fix is';
  return `Runs only when ${subject} over ${node.thresholdLines ?? DISPATCH_PROTOCOL.REWORK_ROUND_THRESHOLD_LINES} lines. Then the gates run again.`;
}

function gatesSentenceOf(node: PipelineFlowNode, fixer: GatesFixer): string {
  if (fixer !== 'none') return `If one fails, ${fixer} fixes it and the gates run again.`;
  return `The ${node.phase ?? ''} gates run again on the merged tree.`;
}

function sentenceOf(node: PipelineFlowNode, fixer: GatesFixer): string {
  const approval = switchApprovalOf(node);
  if (approval !== null) return SWITCH_SENTENCES[approval][node.switchState ?? 'off'];
  switch (node.nodeKind) {
    case 'ticket-creation':
      return 'Turns a request into a draft ticket with a numbered Acceptance and a Brief.';
    case 'builder':
      return 'Makes the change in a worktree of its own and commits on its branch.';
    case 'review':
      return 'A clean agent reads the change and fixes what it finds.';
    case 're-review':
      return reReviewSentenceOf(node);
    case 'merge-main-into-tree':
      return mergeSentenceOf(node);
    case 'gates':
      return gatesSentenceOf(node, fixer);
    case 'ready-for-airlock':
      return 'Joins the Airlock queue by priority.';
    default:
      return '';
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

/** A node asks while one of its questions is open: it opens on the question, and its own dialog waits for the answer. */
function nodeAsksQuestion(node: Pick<PipelineFlowNode, 'questionIds'>, openQuestionIds: readonly string[]): boolean {
  return node.questionIds.some((questionId) => openQuestionIds.includes(questionId));
}

/** How many of the node's questions are still open. */
function openQuestionCountOf(node: Pick<PipelineFlowNode, 'questionIds'>, openQuestionIds: readonly string[]): number {
  return node.questionIds.filter((questionId) => openQuestionIds.includes(questionId)).length;
}

function questionOpenLabelOf(title: string): string {
  return `Answer the question on the ${title} step`;
}

/** "1 question", "2 questions". */
function questionCountTextOf(count: number): string {
  return countText(count, 'question');
}

function changeOfMark(mark: PipelineNodeMark): FlowChange | null {
  return mark === 'changed' || mark === 'new' || mark === 'removed' ? mark : null;
}

/** A switch that changed says which way it turned; a changed gates step counts its changed gates; any other change says its word. */
function changeTextOf(node: PipelineFlowNode, change: FlowChange | null): string | null {
  if (change === null) return null;
  if (change === 'changed' && switchApprovalOf(node) !== null) return node.switchState === 'on' ? 'Off → on' : 'On → off';
  const changedGateCount = node.gateChips.filter((chip) => changeOfMark(chip.mark) !== null).length;
  if (change === 'changed' && node.nodeKind === 'gates' && changedGateCount > 0) return countText(changedGateCount, 'change');
  return CHANGE_WORDS[change];
}

function gatePillsOf(node: PipelineFlowNode, gateCacheMarks: readonly GateCacheMarkFacts[]): FlowGatePillView[] {
  const { phase } = node;
  return node.gateChips.map((chip) => ({
    gateName: chip.gateName,
    text:     GateCacheMarkModel.withCacheWordOf(chip.gateName, phase === null ? null : GateCacheMarkModel.gateCacheReportOf(gateCacheMarks, chip.gateName, phase)),
    change:   changeOfMark(chip.mark),
  }));
}

/** `fixer` names who fixes a red gate of a gates node; every other node ignores it. `gateCacheMarks` give a gate pill its cache mark. */
function nodeViewOf(node: PipelineFlowNode, efforts: readonly string[], fixer: GatesFixer = 'none', gateCacheMarks: readonly GateCacheMarkFacts[] = []): FlowNodeView {
  const openAction = openActionOf(node);
  const approval = switchApprovalOf(node);
  const title = NODE_TITLES[node.nodeKind];
  const kind = kindOf(node);
  const change = changeOfMark(node.mark);
  return {
    nodeId:      node.nodeId,
    title,
    cardTitle:   node.nodeKind === 'gates' && node.phase !== null ? GATES_TITLES[node.phase] : title,
    kind,
    sentence:    sentenceOf(node, fixer),
    conditional: node.conditional,
    briefText:   kind === 'agent' ? instructionFilesTextOf(node) : null,
    gatePills:   gatePillsOf(node, gateCacheMarks),
    meter:       meterOf(node, efforts),
    switchView:  approval === null ? null : { accessibleName: title, checked: node.switchState === 'on', approval },
    highlighted: node.nodeKind === 'human-code-review' && node.switchState === 'on',
    change,
    changeText:  changeTextOf(node, change),
    openAction,
    openLabel:   openLabelOf(node, openAction),
  };
}

/** Who fixes the gates node's red gate: the target of its way back, read from the edge's label. */
function gatesFixerOf(flow: Pick<PipelineFlowFacts, 'edges'>, node: PipelineFlowNode): GatesFixer {
  const wayBack = flow.edges.find((edge) => edge.from === node.nodeId && edge.tone === 'rollback' && edge.labelKind !== null);
  const labelKind = wayBack?.labelKind ?? null;
  if (labelKind === null || !Object.hasOwn(FIXER_OF_EDGE_LABEL, labelKind)) return 'none';
  return FIXER_OF_EDGE_LABEL[labelKind] ?? 'none';
}

/** Every node's view in the facts' order, each gates node worded with who fixes its red gates and its gates' cache marks. */
function nodeViewsOf(flow: Pick<PipelineFlowFacts, 'nodes' | 'edges'>, efforts: readonly string[], gateCacheMarks: readonly GateCacheMarkFacts[] = []): FlowNodeView[] {
  return flow.nodes.map((node) => nodeViewOf(node, efforts, node.nodeKind === 'gates' ? gatesFixerOf(flow, node) : 'none', gateCacheMarks));
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
      return { kind: 'edit', edits: [{ target: 'review', value: { name: DEFAULT_REVIEW_NAME } }] };
    case 'human-code-review':
      return { kind: 'edit', edits: [{ target: 'approval', approval: 'merge', value: true }] };
    case 're-review':
      return { kind: 'edit', edits: [{ target: 'review', value: { name: draft?.review?.name ?? DEFAULT_REVIEW_NAME, reReview } }] };
    case 'airlock-re-review':
      return { kind: 'edit', edits: [{ target: 'airlock', value: { ...draft?.airlock, reReview } }] };
  }
}

function slotViewOf(slot: PipelineInsertSlot, place: FlowSlotPlace, draft: Pipeline | null): FlowSlotView {
  return {
    heading: SLOT_HEADINGS[place],
    choices: slot.offeredSteps.map((step) => ({ step, ...INSERT_CHOICE_WORDS[step], action: insertActionOf(step, draft) })),
  };
}

function switchEditOf(switchView: FlowSwitchView): PipelineDraftEdit {
  return { target: 'approval', approval: switchView.approval, value: !switchView.checked };
}

function draftEditCommandOf(target: DraftEditTarget, edits: readonly PipelineDraftEdit[]) {
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

export const PipelineFlowModel = Object.freeze({
  changeOfMark,
  draftEditCommandOf,
  nodeAsksQuestion,
  nodeViewOf,
  nodeViewsOf,
  openActionOf,
  openQuestionCountOf,
  questionCountTextOf,
  questionOpenLabelOf,
  removedStepsTextOf,
  slotViewOf,
  switchEditOf,
});
