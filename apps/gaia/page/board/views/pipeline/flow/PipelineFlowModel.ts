/**
 * The pipeline flow's step model, pure: every node's card words (its kind, title, sentence and brief files), its meter, gate pills, switch,
 * change marker and what a double-click on it opens, the add-step menus and the edits they send, and the footer's list of removed steps.
 * The facts carry values only; every word here is worded from them.
 */
import { PAGE_CONTRACT_VERSIONS }    from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument } from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardDocument }        from '../../../../@types/board/BoardDocument.ts';
import type { BoardLimitsDocument }  from '../../../../@types/board/BoardFactDocuments.ts';
import type {
  BoardDraftEditDocument,
  BoardFlowNodeDocument,
  BoardGateCacheMarkDocument,
  BoardInsertSlotDocument,
  BoardPipelineChangeDocument,
  BoardPipelineDefinitionDocument,
  BoardPipelineFlowDocument
} from '../../../../@types/board/BoardPipelineDocuments.ts';
import type {
  BoardAgentEffort,
  BoardEdgeLabelKind,
  BoardGatePhase,
  BoardInsertableStep,
  BoardPipelineApproval,
  BoardPipelineNodeKind,
  BoardPipelineNodeMark,
  BoardTicketWritingRoute
} from '../../../../@types/board/BoardVocabulary.ts';
import { BOARD_TICKET_WRITING_ROUTES } from '../../../../@types/board/BoardVocabulary.ts';
import { CountTextUtil }               from '../../../../shared/utils/CountTextUtil.ts';
import { GateCacheMarkModel }          from '../gates/GateCacheMarkModel.ts';

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
  readonly approval:       BoardPipelineApproval;
}

export type FlowDialog = 'agent-step' | 'review-step' | 'merge-step';

/** What a double-click or Enter on a node opens: a step's dialog, at its re-review section for a re-review node, or a phase's gates. */
export type FlowOpenAction =
  | { readonly kind: 'dialog'; readonly dialog: FlowDialog; readonly focusesReReview: boolean }
  | { readonly kind: 'gates-tab'; readonly phase: BoardGatePhase };

/**
 * What the flow asks its holder to open: a node's dialog or gates table, the open question a node waits on, or the Gate dialog for a new
 * gate in a phase.
 */
export type FlowOpenRequest =
  | { readonly kind: 'node'; readonly nodeId: string; readonly action: FlowOpenAction }
  | { readonly kind: 'question'; readonly nodeId: string }
  | { readonly kind: 'new-gate'; readonly phase: BoardGatePhase };

export interface FlowNodeView {
  readonly nodeId:           string;
  /** The node's name in the dialogs and the activity list ("Gates"). */
  readonly title:            string;
  /** The card's title: a gates step is named for its phase ("Build gates"). */
  readonly cardTitle:        string;
  readonly kind:             StepKind;
  readonly sentence:         string;
  readonly conditional:      boolean;
  /** The agent's instruction files, " · " between them; null on a step no agent runs and on a writing step, which names its document. */
  readonly briefText:        string | null;
  /** The document a writing step writes ("spec.md"); null on any other step. */
  readonly documentFileName: string | null;
  readonly gatePills:        readonly FlowGatePillView[];
  readonly meter:            FlowMeterView | null;
  readonly switchView:       FlowSwitchView | null;
  /** Human code review while on: the step that waits on User. */
  readonly highlighted:      boolean;
  readonly change:           FlowChange | null;
  /** The editing marker's words ("Changed", "Off → on", "2 changes"); null with no change. */
  readonly changeText:       string | null;
  readonly openAction:       FlowOpenAction | null;
  readonly openLabel:        string | null;
}

/** What a node's words read beside the node: the efforts a meter counts in, and the forge's rework threshold a re-review names by default. */
export interface FlowWording {
  readonly efforts:              readonly BoardAgentEffort[];
  readonly reworkThresholdLines: number;
}

export type FlowSlotPlace = 'after-builder' | 'after-review' | 'merge-train';

export interface DraftEditTarget {
  readonly setupId:       string;
  readonly draftRevision: number;
}

export type FlowInsertAction =
  | { readonly kind: 'edit'; readonly edits: readonly BoardDraftEditDocument[] }
  | { readonly kind: 'new-gate'; readonly phase: BoardGatePhase };

export interface FlowInsertChoice {
  readonly step:        BoardInsertableStep;
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

const NODE_TITLES: Readonly<Record<BoardPipelineNodeKind, string>> = Object.freeze({
  'ticket-creation':      'Ticket creation',
  'human-ticket-review':  'Human ticket review',
  'spec-writing':         'Spec',
  'human-spec-review':    'Human spec review',
  'plan-writing':         'Plan',
  'human-plan-review':    'Human plan review',
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

const GATES_TITLES: Readonly<Record<BoardGatePhase, string>> = Object.freeze({ build: 'Build gates', review: 'Review gates', merge: 'Merge gates' });

const FIXER_OF_EDGE_LABEL: Readonly<Partial<Record<BoardEdgeLabelKind, GatesFixer>>> = Object.freeze({
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

const SWITCH_SENTENCES: Readonly<Record<BoardPipelineApproval, Readonly<Record<'on' | 'off', string>>>> = Object.freeze({
  tickets: { on: 'You ready each draft before it builds.', off: 'Off: a complete draft builds at once.' },
  merge:   { on: 'You review the change and press Merge. Your presses set the order.', off: 'Off: a green review goes straight to the merge train.' },
  spec:    { on: 'You approve the spec before the plan starts.', off: 'Off: the spec agent approves the spec when it is ready.' },
  plan:    { on: 'You approve the plan; approving starts the build.', off: 'Off: the plan agent approves the plan when it is ready.' },
});

/** The document each writing step writes, as its card names it. */
const DOCUMENT_FILE_NAMES: Readonly<Partial<Record<BoardPipelineNodeKind, string>>> = Object.freeze({
  'spec-writing': 'spec.md',
  'plan-writing': 'plan.md',
});

const HUMAN_STEP_KINDS: readonly BoardPipelineNodeKind[] = Object.freeze(['human-ticket-review', 'human-spec-review', 'human-plan-review', 'human-code-review']);

const APPROVAL_OF_SWITCH_NODE: Readonly<Partial<Record<BoardPipelineNodeKind, BoardPipelineApproval>>> = Object.freeze({
  'human-ticket-review': 'tickets',
  'human-spec-review':   'spec',
  'human-plan-review':   'plan',
  'human-code-review':   'merge',
});

const INSERT_CHOICE_WORDS: Readonly<Record<BoardInsertableStep, { readonly label: string; readonly description: string }>> = Object.freeze({
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

function kindOf(node: BoardFlowNodeDocument): StepKind {
  if (node.nodeKind === 'gates') return 'gates';
  if (HUMAN_STEP_KINDS.includes(node.nodeKind)) return 'you';
  return node.role === null ? 'automatic' : 'agent';
}

function instructionFilesTextOf(node: BoardFlowNodeDocument): string {
  const fileNames = node.instructionEntries.map((entry) => entry.fileName);
  return fileNames.length === 0 ? 'built-in brief' : fileNames.join(' · ');
}

function switchApprovalOf(node: BoardFlowNodeDocument): BoardPipelineApproval | null {
  return Object.hasOwn(APPROVAL_OF_SWITCH_NODE, node.nodeKind) ? APPROVAL_OF_SWITCH_NODE[node.nodeKind] ?? null : null;
}

function documentFileNameOf(node: BoardFlowNodeDocument): string | null {
  return Object.hasOwn(DOCUMENT_FILE_NAMES, node.nodeKind) ? DOCUMENT_FILE_NAMES[node.nodeKind] ?? null : null;
}

function mergeSentenceOf(node: BoardFlowNodeDocument): string {
  if (node.mergePlacement === 'before-review') return 'Brings the branch up to date before review. The builder fixes a conflict or a red gate.';
  const fixer = node.derivedFrom === 'builder' ? 'The builder fixes any conflict, since no review runs.' : 'The last worker fixes any conflict.';
  if (node.mergePlacement === 'before-human-code-review') return `Comes with human code review. ${fixer}`;
  return `Brings the branch up to date. ${fixer}`;
}

function reReviewSentenceOf(node: BoardFlowNodeDocument, reworkThresholdLines: number): string {
  const subject = node.role === 'reReviewer' ? 'the review\'s fixes are' : 'the conflict fix is';
  return `Runs only when ${subject} over ${node.thresholdLines ?? reworkThresholdLines} lines. Then the gates run again.`;
}

function gatesSentenceOf(node: BoardFlowNodeDocument, fixer: GatesFixer): string {
  if (fixer !== 'none') return `If one fails, ${fixer} fixes it and the gates run again.`;
  return `The ${node.phase ?? ''} gates run again on the merged tree.`;
}

function sentenceOf(node: BoardFlowNodeDocument, fixer: GatesFixer, reworkThresholdLines: number): string {
  const approval = switchApprovalOf(node);
  if (approval !== null) return SWITCH_SENTENCES[approval][node.switchState ?? 'off'];
  switch (node.nodeKind) {
    case 'ticket-creation':
      return 'Turns a request into a draft ticket with a numbered Acceptance and a Brief.';
    case 'spec-writing':
      return 'Writes what and why with you, and the numbered Acceptance.';
    case 'plan-writing':
      return 'Works out how: approach, changes and order, from the approved spec.';
    case 'builder':
      return 'Makes the change in a worktree of its own and commits on its branch.';
    case 'review':
      return 'A clean agent reads the change and fixes what it finds.';
    case 're-review':
      return reReviewSentenceOf(node, reworkThresholdLines);
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

function derivedNoteOf(node: BoardFlowNodeDocument): FlowMeterView['derivedNote'] {
  if (node.nodeKind !== 'merge-main-into-tree') return null;
  if (node.mergePlacement === 'before-review') return DERIVED_FROM_BUILDER_NOTE;
  return node.derivedFrom === 'builder' ? DERIVED_WITHOUT_REVIEW_NOTE : DERIVED_FROM_LAST_WORKER_NOTE;
}

/** An effort's level is its place in the choices plus one; an effort outside them fills no bar. */
function meterOf(node: BoardFlowNodeDocument, efforts: readonly BoardAgentEffort[]): FlowMeterView | null {
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

function openActionOf(node: BoardFlowNodeDocument): FlowOpenAction | null {
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

function openLabelOf(node: BoardFlowNodeDocument, openAction: FlowOpenAction | null): string | null {
  if (openAction === null) return null;
  if (openAction.kind === 'gates-tab') return `Show the ${openAction.phase} gates`;
  return `Open the ${NODE_TITLES[node.nodeKind]} step`;
}

/** A node asks while one of its questions is open: it opens on the question, and its own dialog waits for the answer. */
function nodeAsksQuestion(node: Pick<BoardFlowNodeDocument, 'questionIds'>, openQuestionIds: readonly string[]): boolean {
  return node.questionIds.some((questionId) => openQuestionIds.includes(questionId));
}

/** How many of the node's questions are still open. */
function openQuestionCountOf(node: Pick<BoardFlowNodeDocument, 'questionIds'>, openQuestionIds: readonly string[]): number {
  return node.questionIds.filter((questionId) => openQuestionIds.includes(questionId)).length;
}

function questionOpenLabelOf(title: string): string {
  return `Answer the question on the ${title} step`;
}

/** "1 question", "2 questions". */
function questionCountTextOf(count: number): string {
  return CountTextUtil.countedPhrase(count, 'question', 'questions');
}

function changeOfMark(mark: BoardPipelineNodeMark): FlowChange | null {
  return mark === 'changed' || mark === 'new' || mark === 'removed' ? mark : null;
}

/**
 * A switch that changed says which way it turned, and a new one says nothing, its switch being its mark; a changed gates step counts its
 * changed gates; any other change says its word.
 */
function changeTextOf(node: BoardFlowNodeDocument, change: FlowChange | null): string | null {
  if (change === null) return null;
  if (change === 'new' && switchApprovalOf(node) !== null) return null;
  if (change === 'changed' && switchApprovalOf(node) !== null) return node.switchState === 'on' ? 'Off → on' : 'On → off';
  const changedGateCount = node.gateChips.filter((chip) => changeOfMark(chip.mark) !== null).length;
  if (change === 'changed' && node.nodeKind === 'gates' && changedGateCount > 0) return CountTextUtil.countedPhrase(changedGateCount, 'change', 'changes');
  return CHANGE_WORDS[change];
}

function gatePillsOf(node: BoardFlowNodeDocument, gateCacheMarks: readonly BoardGateCacheMarkDocument[]): FlowGatePillView[] {
  const { phase } = node;
  return node.gateChips.map((chip) => ({
    gateName: chip.gateName,
    text:     GateCacheMarkModel.withCacheWordOf(chip.gateName, phase === null ? null : GateCacheMarkModel.gateCacheReportOf(gateCacheMarks, chip.gateName, phase)),
    change:   changeOfMark(chip.mark),
  }));
}

/** `fixer` names who fixes a red gate of a gates node; every other node ignores it. `gateCacheMarks` give a gate pill its cache mark. */
function nodeViewOf(node: BoardFlowNodeDocument, wording: FlowWording, fixer: GatesFixer = 'none', gateCacheMarks: readonly BoardGateCacheMarkDocument[] = []): FlowNodeView {
  const openAction = openActionOf(node);
  const approval = switchApprovalOf(node);
  const title = NODE_TITLES[node.nodeKind];
  const kind = kindOf(node);
  const change = changeOfMark(node.mark);
  const documentFileName = documentFileNameOf(node);
  return {
    nodeId:      node.nodeId,
    title,
    cardTitle:   node.nodeKind === 'gates' && node.phase !== null ? GATES_TITLES[node.phase] : title,
    kind,
    sentence:    sentenceOf(node, fixer, wording.reworkThresholdLines),
    conditional: node.conditional,
    briefText:   kind === 'agent' && documentFileName === null ? instructionFilesTextOf(node) : null,
    documentFileName,
    gatePills:   gatePillsOf(node, gateCacheMarks),
    meter:       meterOf(node, wording.efforts),
    switchView:  approval === null ? null : { accessibleName: title, checked: node.switchState === 'on', approval },
    highlighted: node.nodeKind === 'human-code-review' && node.switchState === 'on',
    change,
    changeText:  changeTextOf(node, change),
    openAction,
    openLabel:   openLabelOf(node, openAction),
  };
}

/** Who fixes the gates node's red gate: the target of its way back, read from the edge's label. */
function gatesFixerOf(flow: Pick<BoardPipelineFlowDocument, 'edges'>, node: BoardFlowNodeDocument): GatesFixer {
  const wayBack = flow.edges.find((edge) => edge.from === node.nodeId && edge.tone === 'rollback' && edge.labelKind !== null);
  const labelKind = wayBack?.labelKind ?? null;
  if (labelKind === null || !Object.hasOwn(FIXER_OF_EDGE_LABEL, labelKind)) return 'none';
  return FIXER_OF_EDGE_LABEL[labelKind] ?? 'none';
}

/** Every node's view in the facts' order, each gates node worded with who fixes its red gates and its gates' cache marks. */
function nodeViewsOf(flow: Pick<BoardPipelineFlowDocument, 'nodes' | 'edges'>, wording: FlowWording, gateCacheMarks: readonly BoardGateCacheMarkDocument[] = []): FlowNodeView[] {
  return flow.nodes.map((node) => nodeViewOf(node, wording, node.nodeKind === 'gates' ? gatesFixerOf(flow, node) : 'none', gateCacheMarks));
}

function insertActionOf(step: BoardInsertableStep, draft: BoardPipelineDefinitionDocument | null, reworkThresholdLines: number): FlowInsertAction {
  const reReview = { thresholdLines: reworkThresholdLines };
  switch (step) {
    case 'build-gates':
      return { kind: 'new-gate', phase: 'build' };
    case 'review-gates':
      return { kind: 'new-gate', phase: 'review' };
    case 'merge-gates':
      return { kind: 'new-gate', phase: 'merge' };
    case 'review':
      return { kind: 'edit', edits: [{ target: 'review', value: { name: DEFAULT_REVIEW_NAME, reReview: null } }] };
    case 'human-code-review':
      return { kind: 'edit', edits: [{ target: 'approval', approval: 'merge', value: true }] };
    case 're-review':
      return { kind: 'edit', edits: [{ target: 'review', value: { name: draft?.review?.name ?? DEFAULT_REVIEW_NAME, reReview } }] };
    case 'airlock-re-review':
      return { kind: 'edit', edits: [{ target: 'airlock', value: { reReview } }] };
  }
}

/** `reworkThresholdLines` is the threshold an added re-review starts with: the forge's default, as its board's limits serve it. */
function slotViewOf(slot: BoardInsertSlotDocument, place: FlowSlotPlace, draft: BoardPipelineDefinitionDocument | null, reworkThresholdLines: number): FlowSlotView {
  return {
    heading: SLOT_HEADINGS[place],
    choices: slot.offeredSteps.map((step) => ({ step, ...INSERT_CHOICE_WORDS[step], action: insertActionOf(step, draft, reworkThresholdLines) })),
  };
}

const TICKET_WRITING_ROUTE_LABELS: Readonly<Record<BoardTicketWritingRoute, string>> = Object.freeze({
  'one-ticket':     'One ticket',
  'spec-then-plan': 'Spec, then plan',
});

/** The choice of how a ticket is written, in the order the Ticket phase offers it. */
const TICKET_WRITING_CHOICES: readonly { readonly value: BoardTicketWritingRoute; readonly label: string }[] = Object.freeze(
  BOARD_TICKET_WRITING_ROUTES.map((value) => ({ value, label: TICKET_WRITING_ROUTE_LABELS[value] })),
);

/** The route a draft that names none writes a ticket by, as the forge serves it. */
export type TicketWritingDefaults = Pick<BoardLimitsDocument, 'defaultTicketWritingRoute'>;

/** An absent route is the default, so choosing the default removes the key and the stored pipeline stays as it was before the choice. */
function ticketWritingEditOf(route: BoardTicketWritingRoute, defaults: TicketWritingDefaults): BoardDraftEditDocument {
  return { target: 'ticket-writing', value: route === defaults.defaultTicketWritingRoute ? null : route };
}

function ticketWritingRouteOfDraft(draft: Pick<BoardPipelineDefinitionDocument, 'ticketWriting'> | null, defaults: TicketWritingDefaults): BoardTicketWritingRoute {
  return draft?.ticketWriting ?? defaults.defaultTicketWritingRoute;
}

/** "Spec, then plan": the route as its choice reads. */
function ticketWritingLabelOf(route: BoardTicketWritingRoute): string {
  return TICKET_WRITING_ROUTE_LABELS[route];
}

function switchEditOf(switchView: FlowSwitchView): BoardDraftEditDocument {
  return { target: 'approval', approval: switchView.approval, value: !switchView.checked };
}

function draftEditCommandOf(target: DraftEditTarget, edits: readonly BoardDraftEditDocument[]): BoardCommandDocument {
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-draft-edit', setupId: target.setupId, draftRevision: target.draftRevision, edits, isACopy: false,
  };
}

function removedStepWordOf(field: string): string {
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
function removedStepsTextOf(changeList: readonly BoardPipelineChangeDocument[]): string | null {
  const words = changeList.filter((change) => change.changeKind === 'removed').map((change) => removedStepWordOf(change.field));
  if (words.length === 0) return null;
  const text = `${listTextOf(words)} removed`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** A node's wording on a board: the efforts its choices offer, and the rework threshold its limits serve. */
function flowWordingOf(facts: Pick<BoardDocument, 'pipeline' | 'limits'>): FlowWording {
  return { efforts: facts.pipeline.choices.efforts, reworkThresholdLines: facts.limits.reworkRoundThresholdLines };
}

export const PipelineFlowModel = Object.freeze({
  TICKET_WRITING_CHOICES,
  flowWordingOf,
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
  ticketWritingEditOf,
  ticketWritingLabelOf,
  ticketWritingRouteOfDraft,
});
